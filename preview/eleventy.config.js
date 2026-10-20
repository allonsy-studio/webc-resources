/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { createRequire } from "node:module";
import path from "node:path";

import { HtmlBasePlugin } from "@11ty/eleventy";
import norn, { base, fillHooks } from "@allons-y/webc-patterns/plugin";
import { components as studioComponents, fonts, studioProps } from "@allons-y/webc-studio";

import { buildComponents } from "../scripts/build-components.js";

const here = path.relative(process.cwd(), import.meta.dirname) || ".";
const at = (...parts) => path.posix.join(here.split(path.sep).join("/"), ...parts);
const axe = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

/** The `docs` collection the norn-docs and norn-docs-home stories read: three pages, the first being the docs story's own frame. */
const DOCS = [
	{ url: "/frames/patterns/norn-docs/default/", data: { title: "Getting started", description: "Install the project and run it once." } },
	{ url: "/frames/patterns/norn-docs/usage/", data: { title: "Usage", description: "The everyday commands." } },
	{ url: "/frames/patterns/norn-docs/reference/", data: { title: "Reference", description: "Every option, in one place." } },
];

/** The frames that stand in for the sample workspaces' pages: the first workspace's story, then the second's. The sample data links to pages that do not exist. */
const WORKSPACE_FRAMES = ["/frames/patterns/norn-workspace/default/", "/frames/patterns/norn-workspace/second/"];

/** The layout stories' props: the sample project data, mapped the way a studio project's is, without the studio theme. */
const props = (data, noIndex) => {
	const workspaces = (data.workspaces ?? []).map((workspace, index) => ({ ...workspace, url: WORKSPACE_FRAMES[index] ?? WORKSPACE_FRAMES[0] }));
	const docs = (data.collections?.docs ?? []).map((page) => ({ url: page.url, title: page.data?.title, description: page.data?.description }));
	return { ...studioProps(data.site, data.project, { docs, anchors: data.anchors === true, studio: false }), title: data.title, docs, search: { bundle: noIndex }, workspaces, workspace: data.workspace && { ...data.workspace, url: workspaces.find(({ name }) => name === data.workspace.name)?.url } };
};

/** @param {import("@11ty/eleventy").UserConfig} config */
export default async function (config) {
	// Compile the component sources first, and again before every rebuild: this listener runs ahead of the WebC plugin's, which globs the compiled folders.
	await buildComponents();
	config.on("eleventy.before", () => buildComponents());
	// The studio components are listed for their own stories; the layouts render without the studio theme.
	// The preview builds no Pagefind index. The search stories load a script that fails instead, so the search falls back to its plain form with no 404.
	const noIndex = () => config.getFilter("url")("/assets/no-index.js");
	config.addPlugin(norn, { props: (data) => props(data, noIndex()), components: [studioComponents, at("_includes/*.webc")] });
	fillHooks(config, { head: '<link rel="stylesheet" href="/assets/norn/reset.css" webc:keep />\n<script src="/assets/tokens.js" webc:keep></script>' });
	config.addPlugin(HtmlBasePlugin);

	config.addCollection("docs", () => DOCS);

	config.addPassthroughCopy({ [at("content/assets")]: "assets" });
	config.addPassthroughCopy({ [fonts]: "assets/fonts" });
	// The preview's own frames and shell are layouts of their own: they link the base and print styles that norn-base embeds.
	config.addPassthroughCopy({ [path.dirname(base)]: "assets/norn" });
	config.addPassthroughCopy({ [axe]: "assets/axe.min.js" });

	// Rebuild when a component source or the tokens change, so `yarn docs:start` follows the packages.
	config.addWatchTarget("../packages/*/src/");
	config.addWatchTarget("../tokens.json");

	return {
		pathPrefix: process.env.PATH_PREFIX || "/",
		dir: { input: at("content"), output: at(process.env.SITE_OUTPUT ?? "_site"), includes: "../_includes", layouts: "../_layouts", data: "../_data" },
		templateFormats: ["md", "webc", "11ty.js"],
		markdownTemplateEngine: false,
	};
}
