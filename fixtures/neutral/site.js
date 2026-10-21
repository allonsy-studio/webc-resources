/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

import { HtmlBasePlugin, I18nPlugin } from "@11ty/eleventy";
import norn, { fillHooks, reset } from "@allons-y/webc-patterns/plugin";

/** The French strings, picked by `page.lang` on the pages under `fr/`. */
export const STRINGS = {
	fr: {
		"norn-skip-link": { label: "Aller au contenu" },
		"norn-header": { label: "Principal" },
		"norn-toc": { label: "Sur cette page" },
		"norn-search": { label: "Rechercher", none: "Aucun résultat", "results-one": "{count} résultat", "results-other": "{count} résultats" },
		"norn-callout": { tip: "Astuce" },
		"norn-notice": { warning: "Attention : " },
		"norn-copy-button": { copy: "Copier", copied: "Copié", failed: "Échec de la copie" },
		"norn-code-block": { label: "code {language}", "copy-label": "Copier le {name}" },
		"norn-theme-toggle": { label: "Thème", light: "Clair", system: "Système", dark: "Sombre" },
		"norn-pager": { label: "Pages voisines" },
		"norn-base": { footer: "Pied de page" },
	},
};

/** The header and footer every page shares. A page's `frame` front matter replaces any of them. */
const FRAME = {
	name: "Neutral fixture",
	nav: [
		{ url: "/docs/one/", title: "Docs", icon: "book" },
		{ url: "https://example.com/source", title: "Source" },
	],
	footer: {
		text: "Patterns only.",
		groups: [
			{
				heading: "Project",
				links: [
					{ url: "https://example.com/source", title: "Source" },
					{ url: "https://example.com/changelog", title: "Changelog" },
				],
			},
		],
		colophon: "Footer closing line.",
	},
};

/** The fixture's own data, in its own shape, mapped to the layout props. */
const props = (data) => ({
	...FRAME,
	title: data.title,
	description: data.description,
	url: "https://example.com/",
	themeToggle: true,
	docs: (data.collections?.docs ?? []).map((page) => ({ url: page.url, title: page.data.title })),
	...data.frame,
});

const here = path.relative(process.cwd(), import.meta.dirname) || ".";

/** Path inside the fixture, relative to the working directory. */
export const at = (...parts) => path.posix.join(here.split(path.sep).join("/"), ...parts);

/**
 * Shared Eleventy setup for the neutral fixture and its variants: the Norn plugin, with no theme and one project icon. `NORN_RESET=off` builds without the reset.
 *
 * @param {import("@11ty/eleventy").UserConfig} config
 * @param {{ components?: string[], exclude?: string[], strings?: object, output?: string, layouts?: string }} [options] - More component globs, packaged components to leave out, the strings table, the output folder, and the layouts folder
 */
export function configure(config, { components = [], exclude = [], strings = STRINGS, output = "_site", layouts = "../_layouts" } = {}) {
	config.addPlugin(norn, { props, components, exclude, strings, icons: at("icons/*.svg") });
	fillHooks(config, {
		head: [process.env.NORN_RESET === "off" ? "" : `<style>${fs.readFileSync(reset, "utf8")}</style>`, '<link rel="stylesheet" href="/assets/project.css" webc:keep />'].join("\n"),
	});
	config.addPlugin(HtmlBasePlugin);
	config.addPlugin(I18nPlugin, { defaultLanguage: "en", errorMode: "never" });
	config.addPassthroughCopy({ [at("assets")]: "assets" });

	config.addCollection("docs", (api) =>
		api
			.getAll()
			.filter((page) => page.data.layout === "norn-docs.webc")
			.sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0) || a.inputPath.localeCompare(b.inputPath)),
	);

	return {
		pathPrefix: process.env.PATH_PREFIX || "/",
		dir: { input: at("content"), output: at(output), includes: "../_includes", layouts },
		templateFormats: ["md", "webc"],
		markdownTemplateEngine: false,
	};
}
