"use strict";

const { require } = window.arguments[0];

const { get: _ }	= require("sdk/l10n");
const { regex }		= require("./data/regex-url.js");
const { prefs }		= require("sdk/simple-prefs");

const bookmarks		= require("sdk/places/bookmarks");
const clipboard		= require("sdk/clipboard");
const tabs			= require("sdk/tabs");
const timers		= require("sdk/timers");



const sort_types = Object.freeze({
	DEFAULT: 0,
	HREF: 1,
	HOST: 2,
	CHECKED: 3
});

const columns = Object.freeze({
	CHECKED: "linkChecked",
	HREF: "link-tree-href",
	HOST: "link-tree-host"
});


// Main data
// TODO: Find better way of doing this
let tree;
let data;

var tree_view = {
	tree: null,

	get rowCount () {
		return data.length;
	},

	getCellText (row, col) {
		switch (col.id) {
			case columns.HREF:	return data[row].href;
			case columns.HOST:	return data[row].host;

			default:
				return "";
		}
	},
	getCellValue (row, col) {
		if (col.id === columns.CHECKED) {
			return data[row].checked;
		}
	},
	isEditable (row, col) {
		return col.id === columns.CHECKED;
	},
	setCellValue (row, col, value) {
		if (col.id === columns.CHECKED) {
			data[row].checked = value == "true";
			this.tree.invalidate();
		}
	},
	setTree (tree) {
		this.tree = tree;
	},

	//nsITreeView defaults
	canDrop				()									{ return false	},
	canDropBeforeAfter	()									{ return false	},
	canDropOn			()									{ return false	},
	cycleCell			(row, cell)							{},
	cycleHeader			(col)								{},
	drop				(row, orientation, transfer_data)	{},
	getCellProperties	(row, col) 							{ return ""		},
	getColumnProperties (col)								{ return ""		},
	getImageSrc			(row, col)							{ return ""		},
	getLevel			(index)								{ return 0;		},
	getParentIndex		(row_index)							{ return -1		},
	getProgressMode		(row, col)							{},
	getRowProperties	(index)								{ return ""		},
	hasNextSibling		(index, after_index)				{ return false	},
	isContainer			(index)								{ return false	},
	isContainerEmpty	(index)								{ return false	},
	isContainerOpen		(index)								{ return false	},
	isSelectable		(row, col)							{ return false	},
	isSeparator			(index)								{ return false	},
	isSorted			()									{ return false	},
	performAction		(action)							{},
	performActionOnCell	(action, row, col)					{},
	performActionOnRow	(action, row)						{},
	selectionChanged	()									{},
	setCellText			(row, col, value)					{},
	toggleOpenState		(index)								{}
};


var util = Object.freeze({
	id: document.getElementById.bind(document)
});

Object.defineProperties(Array.prototype, {
	head: { get: function () { return this[0]				}},
	last: { get: function () { return this[this.length - 1]	}}
});



/*
TODO: implement sorting

function sort_listbox (type, urls, listbox) {
	function sort (items, fn) {
		return items
			.slice()
			.sort(function (a, b) {
				const prop_a = fn(a);
				const prop_b = fn(b);

				if (prop_a < prop_b) {
					return -1;
				} else if (prop_a > prop_b) {
					return 1;
				} else {
					return 0;
				}
			})
			.map(item => [ new URL(util.get_url(item)), util.is_checked(item) ]);
	}

	const list_items = util.get_list_items(listbox);

	let new_list;
	let header_id;

	switch (type) {
		case sort_types.CHECKED:
			new_list = sort(list_items, item => util.is_checked(item));
			header_id = "sort-checked-header";
			util.reverse_sort_order(header_id, listbox);
			break;

		case sort_types.HREF:
			new_list = sort(list_items, item => util.get_url(item));
			header_id = "sort-url-header";
			util.reverse_sort_order(header_id, listbox);
			break;

		case sort_types.HOST:
			new_list = sort(list_items, item => util.get_host(item));
			header_id = "sort-host-header";
			util.reverse_sort_order(header_id, listbox);
			break;

		case sort_types.DEFAULT:
			const checked_positions = list_items
				.filter(util.is_checked)
				.map(item => list_items.indexOf(item));
			new_list = urls.map((url, i) => [ new URL(url), checked_positions.includes(i) ]);
			util.clear_sort_order(listbox);
			break;
	}


	if (header_id && util.get_sort_order(header_id) === "descending") {
		new_list.reverse();
	}

	util.get_list_items(listbox).forEach(function (item, i) {
		const [ url, checked ] = new_list[i];
		listbox.removeChild(item);
		listbox.appendChild(create_list_item(url.href, url.host, checked, listbox));
	});
}
*/


function copy_clipboard (all) {
	clipboard.set((all
		? data.map(item => item.href)
		: data
			.filter(item => item.checked)
			.map(item => item.href)).join("\n"));
}

function bookmark_links () {
	const group = bookmarks.Group({
		title: window.prompt(_("linky-select-bookmarkgroupname")),
		group: bookmarks.MENU
	});

	bookmarks.save(data
		.filter(item => item.checked)
		.map(item => bookmarks.Bookmark({
			title: item.href,
			url: item.href,
			group
		})));
}

function check_all (check) {
	data.forEach(item => item.checked = check.checked);
}

function check_substring () {
	match_substring(_("linky-select-part-confirm-label"),
			item => item.checked = true);
}

function uncheck_substring () {
	match_substring(_("linky-select-partun-confirm-label"),
			item => item.checked = false);
}

function unescape_links () {
	const url_param_regex = /.*\?\w+\=((ftp|https?):\/\/.*)[&|$]/i;

	data.forEach(item => {
		const new_url = item.href.match(url_param_regex);

		if (regex.test(new_url)) {
			const parsed = new URL(new_url);
			item.href = parsed.href;
			item.host = parsed.host;
		}
	});
}

function filter_substring (urls) {
	const label = _("linky-select-partremove-confirm-label");

	match_substring(label, function (item, substring) {
		const new_url = item.href.replace(substring, "");

		if (item.href !== new_url && regex.test(new_url)) {
			const parsed = new URL(new_url);
			item.href = parsed.href;
			item.host = parsed.host;
		}
	});
}

function invert_selection () {
	data.forEach(item => item.checked = !item.checked);
}

function open_links (type, delay_enabled) {
	function open_link (url) {
		tabs.open({
			url: url,
			inBackground: true,
			inNewWindow: type === "win"
		});
	}

	let delay = 0;
	let is_cancelled = false;
	const timeouts = [];

	util.id("cancel").addEventListener("command", function () {
		is_cancelled = true;
	});

	data.forEach((item, i , items) => {
		if (!item.checked) {
			return;
		}

		if (delay_enabled) {
			timeouts.push(timers.setTimeout(function () {
				if (is_cancelled) {
					timeouts.forEach(timers.clearTimeout);
					timeouts.length = 0;
					window.close();

				} else {
					open_link(item.href);
				}
			}, delay));

			if (item === items.last) {
				timeouts.push(timers.setTimeout(function () {
					window.close();
				}, delay));
			} else {
				delay += prefs.delay;
			}
		} else {
			open_link(item.href);
		}
	});

	if (!delay_enabled) {
		window.close();
	}
}


function match_substring (label, callback) {
	const substring = window.prompt(_("linky-select-partremove-confirm-label"));

	data.forEach(item => {
		if (item.href.includes(substring)) {
			callback(item, substring);
		}
	});
	// TODO: sorting here
}


window.addEventListener("load", function () {
	data = window.arguments[0].data.map(url => {
		let parsed = new URL(url);
		return {
			checked: true,
			href: parsed.href,
			host: parsed.host
		};
	});

	tree = document.getElementById("link-tree");
	tree.view = tree_view;

	const open_type = window.arguments[0].open_type;

	function cmd (id, fn, ev = "command") {
		util.id(id).addEventListener(ev, fn, false);
	}

	/*
	let sort_order = sort_types.DEFAULT;

	function sort_default () {
		sort_order = sort_types.DEFAULT;
		sort_listbox(sort_order, urls, listbox);
	};
	function sort_urls () {
		sort_order = sort_types.HREF;
		sort_listbox(sort_order, urls, listbox);
	};
	function sort_hosts () {
		sort_order = sort_types.HOST;
		sort_listbox(sort_order, urls, listbox);
	};
	function sort_checked () {
		sort_order = sort_types.CHECKED;
		sort_listbox(sort_order, urls, listbox);
	};
	*/

	function cancel () {
		timers.setTimeout(function () {
			window.close();
		}, 0);
	}

	// Context menu + headers

	/*
	cmd("sort-url",					sort_urls);
	cmd("sort-url-header",			sort_urls, "click");

	cmd("sort-host",				sort_hosts);
	cmd("sort-host-header",			sort_hosts, "click");

	cmd("sort-default",				sort_default);

	cmd("sort-checked-header",		sort_checked, "click");
	*/

	cmd("check-substr",		() =>	check_substring());
	cmd("uncheck-substr",	() =>	uncheck_substring());
	cmd("unescape",			() =>	unescape_links());
	cmd("filter-substr",	() =>	filter_substring());
	cmd("invert",			() =>	invert_selection());
	cmd("clipboard-all",	() =>	copy_clipboard(true));
	cmd("clipboard",		() =>	copy_clipboard(false));
	cmd("bookmark",			() =>	bookmark_links());


	//Checkboxes
	cmd("check-all",		(e) =>	check_all(e.target), "change");
	//cmd("check-visited",	(e) => checkVisited(e.target));

	//Buttons
	cmd("open-links",		() =>	open_links(open_type, util.id("delay").checked));
	cmd("cancel",					cancel);

}, false);
