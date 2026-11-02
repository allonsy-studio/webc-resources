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
import oss, { ossEnabled, ossProps } from "@allons-y/webc-oss-site";

const here = path.relative(process.cwd(), import.meta.dirname) || ".";
const at = (...parts) => path.posix.join(here.split(path.sep).join("/"), ...parts);

/** The OSS site layer, unless package.json opts out. `NORN_OSS=off` builds without it, and `NORN_RESET=off` without the reset. */
const packagePath = process.env.SITE_PACKAGE_JSON ?? path.resolve(import.meta.dirname, "../package.json");
const withOss = ossEnabled({ packagePath }) && process.env.NORN_OSS !== "off";

/** @param {import("@11ty/eleventy").UserConfig} config */
export default function (config) {
	config.addPlugin(withOss ? oss : norn, {
		props: (data) => ({ ...ossProps(data.site, data.project, { oss: withOss }), title: data.title, workspaces: data.workspaces, workspace: data.workspace }),
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
