/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { createRequire } from "node:module";
import path from "node:path";

import { HtmlBasePlugin } from "@11ty/eleventy";
import webc from "@11ty/eleventy-plugin-webc";

const here = path.relative(process.cwd(), import.meta.dirname) || ".";
const at = (...parts) => path.posix.join(here.split(path.sep).join("/"), ...parts);
const axe = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

/** @param {import("@11ty/eleventy").UserConfig} config */
export default function (config) {
	// The preview's own components are the only ones registered. The packages' components join them when they have stories to show.
	config.addPlugin(webc, { components: at("_includes/*.webc") });
	config.addPlugin(HtmlBasePlugin);

	// A page with no component styles or scripts leaves its bundle tags empty. Drop them after the bundle transform has run.
	config.addTransform("drop-empty-bundle-tags", (content, outputPath) => (outputPath?.endsWith(".html") ? content.replace(/[ \t]*<(style|script)><\/\1>\n?/g, "") : content));

	config.addPassthroughCopy({ [at("content/assets")]: "assets" });
	config.addPassthroughCopy({ [axe]: "assets/axe.min.js" });

	// The catalog reads each package's compiled components and layouts, so rebuild when they change.
	config.addWatchTarget("../packages/*/components/");
	config.addWatchTarget("../packages/*/layouts/");

	return {
		pathPrefix: process.env.PATH_PREFIX || "/",
		dir: { input: at("content"), output: at(process.env.SITE_OUTPUT ?? "_site"), includes: "../_includes", layouts: "../_layouts", data: "../_data" },
		templateFormats: ["md", "webc"],
		markdownTemplateEngine: false,
	};
}
