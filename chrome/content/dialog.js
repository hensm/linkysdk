"use strict";

const { require } = window.arguments[0];

const { get: _ }	= require("sdk/l10n");
const { regex }		= require("./data/regex-url.js");
const { prefs }		= require("sdk/simple-prefs");

const bookmarks		= require("sdk/places/bookmarks");
const clipboard		= require("sdk/clipboard");
const tabs			= require("sdk/tabs");
const timers		= require("sdk/timers");



const sort_orders = Object.freeze({
	ASC: "ascending",
	DESC: "descending"
});

const columns = Object.freeze({
	CHECKED: "linkChecked",
	HREF: "link-tree-href",
	HOST: "link-tree-host"
});


// Main data
// TODO: Find better way of doing this
let data;
let data_initial;

const tree_view = {
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


const util = Object.freeze({
	id: document.getElementById.bind(document)
});

Object.defineProperties(Array.prototype, {
	head: { get: function () { return this[0]				}},
	last: { get: function () { return this[this.length - 1]	}}
});



function sort_tree (tree, column, order) {
	function _sort (fn) {
		return function (a, b) {
			const prop_a = fn(a);
			const prop_b = fn(b);

			if (prop_a < prop_b) {
				return -1;
			} else if (prop_a > prop_b) {
				return 1;
			} else {
				return 0;
			}
		};
	}

	switch (column) {
		case columns.CHECKED:
			data.sort(_sort(item => item.checked));
			break;
		case columns.HREF:
			data.sort(_sort(item => item.href));
			break;
		case columns.HOST:
			data.sort(_sort(item => item.host));
			break;
	}

	console.log(order, sort_orders.DESC, order === sort_orders.DESC);
	if (order === sort_orders.DESC) {
		data.reverse();
	}

	tree.setAttribute("sortDirection", order);
	tree.setAttribute("sortResource", column);

	Array.from(tree.querySelectorAll("treecol")).forEach(treecol => {
		if (treecol.id === column) {
			treecol.setAttribute("sortDirection", order);
		} else if (treecol.hasAttribute("sortDirection")) {
			treecol.removeAttribute("sortDirection");
		}
	});

	tree_view.tree.invalidate();
}

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

function check_substring (sort_column, sort_order, tree) {
	match_substring(_("linky-select-part-confirm-label"),
			item => item.checked = true, sort_column, sort_order, tree);
}

function uncheck_substring (sort_column, sort_order, tree) {
	match_substring(_("linky-select-partun-confirm-label"),
			item => item.checked = false, sort_column, sort_order, tree);
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

function filter_substring (sort_column, sort_order, tree) {
	const label = _("linky-select-partremove-confirm-label");

	match_substring(label, function (item, substring) {
		const new_url = item.href.replace(substring, "");

		if (item.href !== new_url && regex.test(new_url)) {
			const parsed = new URL(new_url);
			item.href = parsed.href;
			item.host = parsed.host;
		}
	}, sort_column, sort_order, tree);
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


function match_substring (label, callback, sort_column, sort_order, tree) {
	const substring = window.prompt(_("linky-select-partremove-confirm-label"));

	data.forEach(item => {
		if (item.href.includes(substring)) {
			callback(item, substring);
		}
	});
	sort_tree(sort_column, sort_order, tree)
	// TODO: sorting here
}


window.addEventListener("load", function () {
	const tree = document.getElementById("link-tree");
	const open_type = window.arguments[0].open_type;

	data = window.arguments[0].data.map(url => {
		let parsed = new URL(url);
		return {
			checked: true,
			href: parsed.href,
			host: parsed.host
		};
	});
	data_initial = data.slice();

	tree.view = tree_view;

	function cancel () {
		timers.setTimeout(function () {
			window.close();
		}, 0);
	}


	function cmd (id, fn, ev = "command") {
		util.id(id).addEventListener(ev, fn, false);
	}

	let sort_column = columns.HREF;
	let sort_order = sort_orders.ASC;

	function on_sort (ev) {
		let old_sort_column = sort_column;

		console.log(ev);

		switch (ev.currentTarget.id) {
			case "linkChecked":		sort_column = columns.CHECKED;	break;
			case "link-tree-href":	sort_column = columns.HREF;		break;
			case "link-tree-host":	sort_column = columns.HOST;		break;
		}

		if (sort_column === old_sort_column) {
			sort_order = (sort_order === sort_orders.ASC)
				? sort_orders.DESC
				: sort_orders.ASC;
		}

		sort_tree(tree, sort_column, sort_order);
	}

	cmd("linkChecked", on_sort, "click");
	cmd("link-tree-href", on_sort, "click");
	cmd("link-tree-host", on_sort, "click");

	cmd("check-substr",		() =>	check_substring(sort_column, sort_order, tree));
	cmd("uncheck-substr",	() =>	uncheck_substring(sort_column, sort_order, tree));
	cmd("unescape",			() =>	unescape_links());
	cmd("filter-substr",	() =>	filter_substring(sort_column, sort_order, tree));
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
