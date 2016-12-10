"use strict";

const { get: _	}	= require("sdk/l10n");

const clipboard		= require("sdk/clipboard");
const context_menu	= require("sdk/context-menu");
const notifications	= require("sdk/notifications");
const request		= require("sdk/request");
const self			= require("sdk/self");
const tabs			= require("sdk/tabs");
const window_utils	= require("sdk/window/utils");
const simple_prefs	= require("sdk/simple-prefs");

const SELECT_DIALOG_URL = "chrome://linkysdk/content/dialog.xul";
const OPTIONS_DIALOG_URL = "chrome://linkysdk/content/options.xul";

let menu;


const actions = {
	links: [
		"open-all-tab",
		"open-all-win",
		"clipboard-all",
		"download-all"
	],
	images: [
		"pictures-tab",
		"pictures-win",
		"pictures-page-tab",
		"pictures-page-win"
	],
	imageLinks: [
		"pictures-links-page-tab",
		"pictures-links-page-win"
	],
	selectedLinks: [
		"open-selected-tab",
        "open-selected-win",
        "clipboard-selected",
        "download-selected"
	],
	selectedTextLinks: [
		"selected-text-tab",
		"selected-text-win"
	]
};

const actions_tab = [
	"open-selected-tab",
	"selected-text-tab",
	"open-all-tab",
	"pictures-tab",
	"pictures-links-page-tab",
	"pictures-page-tab",
	"clipboard-all",
	"clipboard-selected",
	"download-all",
	"download-selected"
];
const actions_win = [
	"open-selected-win",
	"selected-text-win",
	"open-all-win",
	"pictures-win",
	"pictures-links-page-win",
	"pictures-page-win",
	"clipboard-all",
	"clipboard-selected",
	"download-all",
	"download-selected"
];


function create_menu_item (name, ctx) {
	return context_menu.Item({
		label: _(name + "-label"),
		data: name,
		accessKey: _(name + "-accessKey"),
		context: ctx
	});
}

function on_menu_pref_change () {
	// remove previously created menu
	if (menu) {
		menu.destroy();
	}

	const ctx_all = context_menu.SelectorContext("*");
	const ctx_selection = context_menu.SelectionContext();

	const info_item = context_menu.Item({
		label: _("linky-context-info-label"),
		contentScriptFile: "./update-info.js",
		context: ctx_all
	});


	// 0 = tab
	// 1 = win
	// 2 = tab + win
	const pref = simple_prefs.prefs.showopen;
	const items = (pref === 2
		? actions_tab.concat(actions_win)
		: pref === 1
			? actions_win
			: actions_tab).filter(function (item) {

		switch (item) {
			case "open-selected-tab":
			case "open-selected-win":
				return simple_prefs.prefs["context.selectedlinks"];

			case "selected-text-tab":
			case "selected-text-win":
				return simple_prefs.prefs["context.selectedtextlinks"];

			case "open-all-tab":
			case "open-all-win":
				return simple_prefs.prefs["context.alllinks"];

			case "clipboard-selected":
			case "clipboard-all":
				return simple_prefs.prefs["context.clipboard"];

			case "download-all":
			case "download-selected":
				return simple_prefs.prefs["context.downloadlinks"];

			default:
				return true;
		}
	}).map(function (item) {

		// set contexts
		switch (item) {
			case "open-selected-tab":
			case "open-selected-win":
			case "selected-text-tab":
			case "selected-text-win":
			case "clipboard-selected":
			case "download-selected":
				return create_menu_item(item, ctx_selection);

			// TODO: check for images, image links, etc...

			default:
				return create_menu_item(item);
		}
	});


	menu = context_menu.Menu({
		label: _("linky-label"),
		contentScript: "self.on('click',(n,d)=>self.postMessage(d))",
		context: ctx_all,
		items: [info_item, context_menu.Separator()].concat(items),
		image: self.data.url("icon16.png")
	});

	info_item.on("message", msg => {
		info_item.label = _("linky-info",
				msg.link_count.toString(),
				msg.image_count.toString());
	});

	menu.on("message", msg => {
		const worker = tabs.activeTab.attach({
			contentScriptFile: ["./regex-url.js", "./content-script.js"],
			contentScriptOptions: {
				name: msg,
				actions: actions
			}
		});
		worker.on("message", msg => {
			let open_type;

			if (msg.subject.endsWith("-tab")) {
				open_type = "tab";
			} else
			if (msg.subject.endsWith("-win")) {
				open_type = "win";
			} else {
				switch (msg.subject) {
					case "clipboard-all":
					case "clipboard-selected":
						clipboard.set(msg.payload.join("\n"));
						break;
					case "download-all":
					case "download-selected":
						notifications.notify({
							title: self.name,
							text: "TODO!"
						});
						break;
				}
			}

			if (open_type) {
				window_utils.openDialog({
					url: SELECT_DIALOG_URL,
					features:`
							chrome,
							centerscreen,
							resizable=yes,
							width=${simple_prefs.prefs.dialog_width},
							height=${simple_prefs.prefs.dialog_height}`,
					args: {
						data: msg.payload,
						require,
						open_type
					}
				});
			}
		});
	});
}

// recreate menu when prefs modified
simple_prefs.on("showopen",						on_menu_pref_change);
simple_prefs.on("context.selectedlinks",		on_menu_pref_change);
simple_prefs.on("context.selectedtextlinks",	on_menu_pref_change);
simple_prefs.on("context.alllinks",				on_menu_pref_change);
simple_prefs.on("context.clipboard",			on_menu_pref_change);
simple_prefs.on("context.downloadlinks",		on_menu_pref_change);
simple_prefs.on("context.piclinks",				on_menu_pref_change);
simple_prefs.on("context.piclinksshow",			on_menu_pref_change);


function startup () {
	// create menu
	on_menu_pref_change();
}

function shutdown() {}

exports.main = startup;
exports.onUnload = shutdown;
