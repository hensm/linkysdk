"use strict";

self.postMessage({
	link_count: document.links.length,
	image_count: document.images.length
});
