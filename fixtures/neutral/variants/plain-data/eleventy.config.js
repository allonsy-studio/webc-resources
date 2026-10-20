/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import path from "node:path";

import norn from "@allons-y/webc-patterns/plugin";

const here = path.relative(process.cwd(), import.meta.dirname) || ".";
const at = (...parts) => path.posix.join(here.split(path.sep).join("/"), ...parts);

/** The plugin with no mapping and no reset: the layouts read the page's same-named data. */
export default function (config) {
	config.addPlugin(norn);
	return { dir: { input: at("content"), output: at("../../_site-plain-data") }, templateFormats: ["md", "webc"], markdownTemplateEngine: false };
}
