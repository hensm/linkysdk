let href = link => link.href;
let getLinks = () => Array.prototype.filter.call(document.links, href);
let getImages = () => Array.prototype.map.call(
		document.images, image => image.src);

function getSelectedTextLinks() {
	return window.getSelection().toString().split(/\s+/)
		.filter(a => a.length && re_weburl.test(a));
}
function getSelectedLinks() {
	try {
		let selection = window.getSelection();
		let links = selection.getRangeAt(0).commonAncestorContainer
			.querySelectorAll("a[href], area[href]");
		return Array.prototype.filter.call(
				links, node => selection.containsNode(node, true)).map(href);
	} catch(e) {
		return null;
	}
}

function getImageLinks() {
	return getLinks().filter(link => link.firstChild
		&& link.firstChild.tagName === "IMG").map(href);
}


let emit = function(subjects, payload) {
	let data = payload();
	if (data && data.length) {
		subjects.forEach(subject => {
			if (subject === self.options.name) {
				self.postMessage({
					subject: subject,
					payload: data
				});
			}
		});
	}
};

emit(self.options.actions.selectedLinks,		() => getSelectedLinks());
emit(self.options.actions.selectedTextLinks,	() => getSelectedTextLinks());
emit(self.options.actions.links,				() => getLinks().map(href));
emit(self.options.actions.images,				() => getImages());
emit(self.options.actions.imageLinks,			() => getImageLinks());