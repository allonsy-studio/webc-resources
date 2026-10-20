/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

import { HtmlBasePlugin } from "@11ty/eleventy";
import norn, { fillHooks, reset } from "@allons-y/webc-patterns/plugin";
import studio, { studioEnabled, studioProps } from "@allons-y/webc-studio";

const here = path.relative(process.cwd(), import.meta.dirname) || ".";
const at = (...parts) => path.posix.join(here.split(path.sep).join("/"), ...parts);

/** The studio layer, unless package.json opts out. `NORN_STUDIO=off` builds without it, and `NORN_RESET=off` without the reset. */
const packagePath = process.env.SITE_PACKAGE_JSON ?? path.resolve(import.meta.dirname, "../package.json");
const withStudio = studioEnabled({ packagePath }) && process.env.NORN_STUDIO !== "off";

/** @param {import("@11ty/eleventy").UserConfig} config */
export default function (config) {
	config.addPlugin(withStudio ? studio : norn, {
		props: (data) => ({ ...studioProps(data.site, data.project, { studio: withStudio }), title: data.title, workspaces: data.workspaces, workspace: data.workspace }),
		components: [at("_includes/*.webc")],
	});
	fillHooks(config, {
		head: [process.env.NORN_RESET === "off" ? "" : `<style>${fs.readFileSync(reset, "utf8")}</style>`, '<link rel="stylesheet" href="/assets/styles/project.css" webc:keep />'].join("\n"),
	});
	config.addPlugin(HtmlBasePlugin);

	config.addPassthroughCopy({ [at("content/assets")]: "assets" });

	return {
		pathPrefix: process.env.PATH_PREFIX || "/",
		dir: { input: at("content"), output: at(process.env.SITE_OUTPUT ?? "_site"), includes: "../_includes", layouts: "../_layouts", data: "../_data" },
		templateFormats: ["md", "webc"],
		markdownTemplateEngine: false,
	};
}
