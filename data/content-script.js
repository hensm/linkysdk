"use strict";

function get_links () {
	return Array.from(document.links).map(link => link.href);
}
function get_images () {
	return Array.from(document.images).map(img => img.src);
}

function get_selected_links () {
	try {
		const selection = window.getSelection();
		const links = selection.getRangeAt(0)
			.commonAncestorContainer
			.querySelectorAll("a[href], area[href]");

		return Array.from(links)
			.filter(link => selection.containsNode(link, true))
			.map(link => link.href);
	} catch (e) {
		return null;
	}
}

function get_selected_text_links () {
	return window.getSelection()
		.toString()
		.split(/\s+/)
		.filter(a => a.length && re_weburl.test(a));
}

function get_image_links () {
	return get_links()
		.filter(link => link.firstChild && link.firstChild.nodeName === "IMG")
		.map(link => link.href);
}



function emit (subjects, payload) {
	const data = payload();
	const subject = self.options.name;

	if (data && data.length && subjects.includes(subject)) {
		self.postMessage({
			subject,
			payload: data
		});
	}
}


emit(self.options.actions.links				,	get_links				);
emit(self.options.actions.images			,	get_images				);
emit(self.options.actions.selectedLinks		,	get_selected_links		);
emit(self.options.actions.selectedTextLinks	,	get_selected_text_links	);
emit(self.options.actions.imageLinks		,	get_image_links			);
