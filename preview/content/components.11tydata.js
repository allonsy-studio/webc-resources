/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// One page per component. A function permalink, because Markdown here has no template engine.

export default {
	layout: "shell.webc",
	pagination: { data: "catalog.components", size: 1, alias: "component" },
	permalink: (data) => `${data.component.url}index.html`,
	eleventyComputed: { title: (data) => data.component.name, description: (data) => data.component.summaryText },
};
