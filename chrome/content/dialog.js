"use strict";

const { require } = window.arguments[0];

const { get: _ }	= require("sdk/l10n");
const { regex }		= require("./data/regex-url.js");
const { prefs }		= require("sdk/simple-prefs");

const bookmarks		= require("sdk/places/bookmarks");
const clipboard		= require("sdk/clipboard");
const tabs			= require("sdk/tabs");
const timers		= require("sdk/timers");



// Constants used in functions relating to sorting / treecols

const sort = Object.freeze({
	CHECKED: "linkChecked",
	HREF: "link-tree-href",
	HOST: "link-tree-host",
	DEFAULT: "sort-default"
});

const sort_orders = Object.freeze({
	ASC: "ascending",
	DESC: "descending"
});


// Globals
let tree;
let sort_column = sort.HREF;
let sort_order = sort_orders.ASC;


/*	
 *	TODO: Find better way of doing this
 *
 *	data contains current representation of tree
 *
 *	data_initial keeps the original order with any permanent
 *	changes to content / state
 */
let data;
let data_initial;

const tree_view = {
	tree: null,

	get rowCount () {
		return data.length;
	},

	getCellText (row, col) {
		switch (col.id) {
			case sort.HREF:	return data[row].href;
			case sort.HOST:	return data[row].host;

			default:
				return "";
		}
	},
	getCellValue (row, col) {
		if (col.id === sort.CHECKED) {
			return data[row].checked;
		}
	},
	isEditable (row, col) {
		return col.id === sort.CHECKED;
	},
	setCellValue (row, col, value) {
		if (col.id === sort.CHECKED) {
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

// General util functions
const util = Object.freeze({
	id: document.getElementById.bind(document)
});

// Helper properties on the Array prototype for first/last elements
Object.defineProperties(Array.prototype, {
	head: { get: function () { return this[0]				}},
	last: { get: function () { return this[this.length - 1]	}}
});


/*	
 *	Gets called when user interacts with treecol sort UI or
 *	after any changes to content/state which would affect
 *	the current sort order
 */
function sort_tree () {

	/*
	 *	Helper function to create a sort function comparing
	 *	properties modified by a function passed in as the
	 *	fn argument
	 */
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

	// Start over with original order
	data = data_initial.slice();

	// Doesn't sort if column is sort.DEFAULT
	switch (sort_column) {
		case sort.CHECKED:	data.sort(_sort(item => item.checked));	break;
		case sort.HREF:		data.sort(_sort(item => item.href));	break;
		case sort.HOST:		data.sort(_sort(item => item.host));	break;
	}

	// Reverse if descending sort order
	if (sort_order === sort_orders.DESC) {
		data.reverse();
	}

	// Reflect current sort order on the tree UI
	tree.setAttribute("sortDirection", sort_order);
	tree.setAttribute("sortResource", sort_column);

	// Remove any previously set sortDirection attributes
	Array.from(tree.querySelectorAll("treecol")).forEach(treecol => {
		if (treecol.id === sort_column) {
			treecol.setAttribute("sortDirection", sort_order);
		} else if (treecol.hasAttribute("sortDirection")) {
			treecol.removeAttribute("sortDirection");
		}
	});

	// Update tree view
	tree_view.tree.invalidate();
}

/*
 *	Copies href property of all/checked items to clipboard
 */
function copy_clipboard (all) {
	clipboard.set((all ? data : data.filter(item => item.checked))
		.map(item => item.href).join("\n"));
}

/*
 *	Prompts for a name and creates a new folder in the
 *	bookmarks menu. Saves all checked items within that folder
 */
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

/*
 *	Sets all items' checked state to that of the checked
 *	argument
 */
function check_all (is_checked) {
	data_initial.forEach(item => item.checked = is_checked);

	// Update tree
	sort_tree();
}

/*
 *	Prompts for a string and checks/unchecks items
 *	containing it as a substring
 */
function check_substring (is_checked) {
	const substring = window.prompt(is_checked
		? _("linky-select-part-confirm-label")
		: _("linky-select-partun-confirm-label"));

	data_initial.forEach(item => {
		if (item.href.includes(substring)) {
			item.checked = is_checked;
		}
	});

	// Update tree
	sort_tree();
}

/*
 *	Finds a URL within a query parameter of existing URLs
 *	and replaces existing items with that URL
 */
function unescape_links () {
	const url_param_regex = /.*\?\w+\=((ftp|https?):\/\/.*)[&|$]/i;

	data_initial.forEach(item => {
		const new_url = item.href.match(url_param_regex);

		// Test against URL regex
		if (regex.test(new_url)) {
			const parsed = new URL(new_url);
			item.href = parsed.href;
			item.host = parsed.host;
		}
	});

	// Update tree
	sort_tree();
}

/*
 *	Prompts for a string and removes it from all selected
 *	items containing it as a substring
 */
function filter_substring () {
	const substring = window.prompt(_("linky-select-partremove-confirm-label"));

	data_initial
		.filter(item => item.checked)
		.forEach(item => {
			const new_url = item.href.replace(substring, "");

			// Test if it's changed and is still a valid URL
			if (item.href !== new_url && regex.test(new_url)) {
				const parsed = new URL(new_url);
				item.href = parsed.href;
				item.host = parsed.host;
			}
		});

	// Update tree
	sort_tree();
}

/*
 *	Loops through all items and inverts checked state
 */
function invert_selection () {
	data_initial.forEach(item => item.checked = !item.checked);

	// Update tree
	tree_view.tree.invalidate();
}

/*
 *	Opens links in windows/tabs, deals with timing, and
 *	closes dialog when finished
 */
function open_links (type, delay_enabled) {

	/*
	 *	Helper function to open url with predefined settings
	 */
	function open_link (url) {
		tabs.open({
			url,
			inBackground: true,
			inNewWindow: type === "win"
		});
	}

	let delay = 0;
	let is_cancelled = false;
	const timeouts = [];

	// Stop opening new links if the dialog is cancelled
	util.id("cancel").addEventListener("command", function () {
		is_cancelled = true;
	});

	data
		.filter(item => item.checked)
		.forEach((item, i, items) => {
			if (delay_enabled) {
				timeouts.push(timers.setTimeout(function () {

					// Clear all timeouts if dialog is cancelled and close dialog
					if (is_cancelled) {
						timeouts.forEach(timers.clearTimeout);
						timeouts.length = 0;
						window.close();
					} else {
						open_link(item.href);
					}
				}, delay));

				if (i === items.length - 1) {

					// On last item, close window
					timeouts.push(timers.setTimeout(function () {
						window.close();
					}, delay));
				} else {

					// Increment delay to stage next timeout
					delay += prefs.delay;
				}
			} else {

				// If no delay, just open link normally
				open_link(item.href);
			}
		});

	// Don't close dialog if delay is enabled, so the user can cancel
	if (!delay_enabled) {
		window.close();
	}
}


window.addEventListener("load", function () {

	// "win" or "tab"
	const open_type = window.arguments[0].open_type;

	tree = document.getElementById("link-tree");

	// Parse URLs for host property and add default checked state
	data = window.arguments[0].data.map(url => {
		let { href, host } = new URL(url);
		return {
			checked: true,
			href,
			host
		};
	});
	// Copy at initial state
	data_initial = data.slice();

	tree.view = tree_view;

	/*
	 *	Helper function to assign actions to UI with default
	 *	"command" event
	 */
	function cmd (id, fn, ev = "command") {
		util.id(id).addEventListener(ev, fn, false);
	}

	/*
	 *	Sets column/order when triggered by treecol sort UI
	 *	and sorts data	
	 */
	function on_sort ({ currentTarget: { id }}) {
		let old_sort_column = sort_column;

		// Is valid sort type
		if (Object.values(sort).includes(id)) {
			sort_column = id;
		}

		// Handle swapping sort order
		if (sort_column === old_sort_column) {
			if (sort_order === sort_orders.ASC) {
				sort_order = sort_orders.DESC;
			} else {
				sort_order = sort_orders.ASC;
			}
		}

		sort_tree();
	}

	// Treecol sort UI headers
	cmd("linkChecked",		on_sort, "click");
	cmd("link-tree-href",	on_sort, "click");
	cmd("link-tree-host",	on_sort, "click");
	cmd("sort-default", 	on_sort);

	cmd("check-substr",		() =>	check_substring(true));
	cmd("uncheck-substr",	() =>	check_substring(false));
	cmd("unescape",			() =>	unescape_links());
	cmd("filter-substr",	() =>	filter_substring());
	cmd("invert",			() =>	invert_selection());
	cmd("clipboard-all",	() =>	copy_clipboard(true));
	cmd("clipboard",		() =>	copy_clipboard(false));
	cmd("bookmark",			() =>	bookmark_links());


	// Checkboxes
	cmd("check-all",		(e) =>	check_all(e.target.checked));

	// Buttons
	cmd("open-links",		() =>	open_links(open_type, util.id("delay").checked));

	cmd("cancel", () => {
		timers.setTimeout(function () {
			window.close();
		}, 0);
	});

}, false);
