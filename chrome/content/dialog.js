"use strict";

const { require } = window.arguments[0];

const { get: _ }	= require("sdk/l10n");
const { regex }		= require("./data/regex-url.js");
const { prefs }		= require("sdk/simple-prefs");

const bookmarks		= require("sdk/places/bookmarks");
const clipboard		= require("sdk/clipboard");
const tabs			= require("sdk/tabs");
const timers		= require("sdk/timers");


const util = Object.freeze({
	get_list_items (listbox) {
		return [...listbox.children].filter(child => child.tagName === "listitem");
	},

	is_checked (item) {
		return item.firstChild.getAttribute("checked") === "true";
	},
	set_checked (item, state) {
		item.firstChild.setAttribute("checked", state);
		console.log(state, item.firstChild.getAttribute("checked"));
	},

	get_url (item) {
		return item.childNodes[1].getAttribute("label");
	},
	set_url (item, value) {
		item.childNodes[1].setAttribute("label", value);
	},

	set_host (item, value) {
		item.childNodes[2].setAttribute("label", value);
	},
	get_host (item) {
		return item.childNodes[2].getAttribute("label");
	},


	clear_sort_order (listbox, exceptions = []) {
		[...listbox.querySelectorAll("listheader")].forEach(function (el) {
			const id = el.getAttribute("id");
			if (!exceptions.includes(id)) {
				[...document.getAnonymousNodes(util.id(id))].last
					.removeAttribute("sortDirection");
			}
		});
	},

	get_sort_order (id) {
		return [...document.getAnonymousNodes(util.id(id))].last
			.getAttribute("sortDirection");
	},
	set_sort_order (id, order) {
		[...document.getAnonymousNodes(util.id(id))].last
			.setAttribute("sortDirection", order);
	},

	reverse_sort_order (id, listbox) {
		this.set_sort_order(id, this.get_sort_order(id) === "descending"
			? "ascending"
			: "descending");
		this.clear_sort_order(listbox, [ id ]);
	},


	id: document.getElementById.bind(document)
});

Object.defineProperties(Array.prototype, {
	head: { get: function () { return this[0]				}},
	last: { get: function () { return this[this.length - 1]	}}
});



const sort_types = Object.freeze({
	DEFAULT: 0,
	HREF: 1,
	HOST: 2,
	CHECKED: 3
});



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


function copy_clipboard (all, listbox) {
	const sep = "\n";

	clipboard.set(all
		? util.get_list_items(listbox).map(util.get_url)
		: util.get_list_items(listbox)
			.filter(util.is_checked)
			.map(util.get_url)).join(sep);
}

function bookmark_links (listbox) {
	const group = bookmarks.Group({
		title: window.prompt(_("linky-select-bookmarkgroupname")),
		group: bookmarks.MENU
	});

	bookmarks.save(util.get_list_items(listbox)
		.filter(item => util.is_checked(item))
		.map(item => bookmarks.Bookmark({
			title: item.value,
			url: item.value,
			group: group
		})));
}

function check_all (check, listbox) {
	for (let item of util.get_list_items(listbox)) {
		util.set_checked(item, check.checked);
		check.indeterminate = false;
	}
}

function check_substring (listbox) {
	const label = _("linky-select-part-confirm-label");

	match_substring(label, listbox, item => util.set_checked(item, true));
	determine_check_all_state(listbox);
}

function uncheck_substring (listbox) {
	const label = _("linky-select-partun-confirm-label");

	match_substring(label, listbox, item => util.set_checked(item, false));
	determine_check_all_state(listbox);
}

function unescape_links (listbox) {
	const url_param_regex = /.*\?\w+\=((ftp|https?):\/\/.*)[&|$]/i;

	for (let item of util.get_list_items(listbox)) {
		const url_new = util.get_url(item).match(url_param_regex)[1];

		if (regex.test(url_new)) {
			const url_new_url = new URL(url_new);
			util.set_url(item, url_new_url.href);
			util.set_host(item, url_new_url.host);
		}
	}
}

function filter_substring (urls, sort_order, listbox) {
	const label = _("linky-select-partremove-confirm-label");

	match_substring(label, listbox, function (item, substring) {
		const url = util.get_url(item);
		const url_new = url.replace(substring, "");

		if (url_new !== url && regex.test(url_new)) {
			const url_new_url = new URL(url_new);
			util.set_url(item, url_new_url.href);
			util.set_host(item, url_new_url.host);
		}
	}, sort_order, urls);
}

function invert_selection (listbox) {
	for (let item of listbox) {
		util.set_checked(item, !util.is_checked(item));
	}
}

function open_links (type, delay_enabled, listbox) {
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

	util.get_list_items(listbox).forEach(function (item, i, items) {
		if (!util.is_checked(item)) {
			return;
		}

		const url = util.get_url(item);

		if (delay_enabled) {
			timeouts.push(timers.setTimeout(function () {
				if (is_cancelled) {
					timeouts.forEach(timers.clearTimeout);
					timeouts.length = 0;
					window.close();

				} else {
					open_link(url);
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
			open_link(url);
		}
	});

	if (!delay_enabled) {
		window.close();
	}
}


function match_substring (label, callback, sort_order, urls, listbox) {
	const substring = window.prompt(_("linky-select-partremove-confirm-label"));

	for (let item of util.get_list_items(listbox)) {
		if (util.get_url(item).includes(substring)) {
			callback(item, substring);
		}
	}
	if (sort_order) {
		sort_listbox(sort_order, urls, listbox);
	}
}

function determine_check_all_state (listbox) {
	const checkAllEle = util.id("check-all");
	const checked = util.is_checked(util.get_list_items(listbox)[0]);
	const indeterminate = !util.get_list_items(listbox).every(
			item => util.is_checked(item) === checked);

	checkAllEle.indeterminate = indeterminate;
	if (!indeterminate) {
		checkAllEle.checked = checked;
	}
}

function create_list_item (url, host, checked, listbox) {
	const item = document.createElement("listitem");

	const colCheckbox = document.createElement("listcell");
	const colUrl = document.createElement("listcell");
	const colHost = document.createElement("listcell");

	colCheckbox.setAttribute("type", "checkbox");

	item.appendChild(colCheckbox);
	item.appendChild(colUrl);
	item.appendChild(colHost);

	util.set_checked(item, checked);
	util.set_url(item, url);
	util.set_host(item, host);

	item.addEventListener("click", function () {
		util.set_checked(item, !util.is_checked(item));
	});

	colCheckbox.addEventListener("click", function () {
		determine_check_all_state(listbox);
	});

	return item;
}


window.addEventListener("load", function () {
	const urls = window.arguments[0].data.map(url => new URL(url));
	const open_type = window.arguments[0].open_type;
	const listbox = util.id("listbox");

	for (let url of urls) {
		listbox.appendChild(create_list_item(url.href, url.host, true, listbox));
	}

	function cmd (id, fn, ev = "command") {
		util.id(id).addEventListener(ev, fn, false);
	}

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

	function cancel () {
		timers.setTimeout(function () {
			window.close();
		}, 0);
	}

	// Context menu + headers

	cmd("sort-url",					sort_urls);
	cmd("sort-url-header",			sort_urls, "click");

	cmd("sort-host",				sort_hosts);
	cmd("sort-host-header",			sort_hosts, "click");

	cmd("sort-default",				sort_default);

	cmd("sort-checked-header",		sort_checked, "click");

	cmd("check-substr",		() =>	check_substring(listbox));
	cmd("uncheck-substr",	() =>	uncheck_substring(listbox));
	cmd("unescape",			() =>	unescape_links(listbox));
	cmd("filter-substr",	() =>	filter_substring(urls, sort_order, listbox));
	cmd("invert",			() =>	invert_selection(listbox));
	cmd("clipboard-all",	() =>	copy_clipboard(true, listbox));
	cmd("clipboard",		() =>	copy_clipboard(false, listbox));
	cmd("bookmark",			() =>	bookmark_links(listbox));


	//Checkboxes
	cmd("check-all",		(e) =>	check_all(e.target, listbox), "change");
	//cmd("check-visited",	(e) => checkVisited(e.target, listbox));

	//Buttons
	cmd("open-links",		() =>	open_links(open_type, util.id("delay").checked, listbox));
	cmd("cancel",					cancel);

}, false);
