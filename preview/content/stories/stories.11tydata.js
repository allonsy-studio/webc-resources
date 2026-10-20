/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Each story is a page of its own, shown in a frame: /stories/<package>/<component>/<story> becomes /frames/…/.

export default {
	layout: "frame.webc",
	eleventyComputed: { permalink: (data) => `${data.page.filePathStem.replace(/^\/stories\//, "/frames/")}/index.html` },
};
