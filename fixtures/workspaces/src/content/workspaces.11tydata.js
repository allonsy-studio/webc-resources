/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// One page per workspace. A function permalink, because Markdown here has no template engine.

export default {
	layout: "norn-workspace.webc",
	pagination: { data: "workspaces", size: 1, alias: "workspace" },
	permalink: (data) => `${data.workspace.slug}/index.html`,
	eleventyComputed: { title: (data) => data.workspace.name },
};
