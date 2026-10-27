/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Each story is a page of its own, shown in a frame: /stories/<package>/<component>/<story> becomes /frames/…/.
// A story page reads its component's CSF file as `$data.csf`, so it can loop over the options instead of listing them.

/** The CSF data of the component a story page belongs to, or undefined when it has no CSF file. */
const csf = (data) => {
	const [, , packageId, name, slug] = data.page.filePathStem.split("/");
	if (!slug) return undefined;
	return data.catalog?.components.find((component) => component.slug === `${packageId}/${name}`)?.csfData;
};

export default {
	layout: "frame.webc",
	eleventyComputed: { permalink: (data) => `${data.page.filePathStem.replace(/^\/stories\//, "/frames/")}/index.html`, csf },
};
