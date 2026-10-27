/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import path from "node:path";

import { RenderPlugin } from "@11ty/eleventy";
import norn from "@allons-y/webc-patterns/plugin";

const here = path.relative(process.cwd(), import.meta.dirname) || ".";
const at = (...parts) => path.posix.join(here.split(path.sep).join("/"), ...parts);

/** Pages that reach the layouts by every route: WebC, Markdown, an override, the Render plugin, a project layout, and an alias. `build.test.js` builds it. */
export default function (config) {
	config.addPlugin(RenderPlugin);
	config.addLayoutAlias("page", "norn-base.webc");
	config.addPlugin(norn);
	return { dir: { input: at("content"), output: at("../../_site-compile") }, templateFormats: ["md", "webc", "njk"], markdownTemplateEngine: false };
}
