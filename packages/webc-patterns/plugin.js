/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

import webc from "@11ty/eleventy-plugin-webc";

import { adjacent, componentStrings, dropEmptyBundleTags, patterns } from "./index.js";
import { readIcons } from "./lib/icons.js";
import { isInstalled } from "./lib/optional.js";
import { callouts, headingAnchors, headings, scrollTables } from "./markdown.js";

const HERE = import.meta.dirname;
const posix = (file) => file.split(path.sep).join("/");

/** Absolute path to the optional reset, `css/reset.css`, in the `norn.reset` layer. Norn looks the same without it. */
export const reset = posix(path.join(HERE, "css", "reset.css"));

/** Absolute path to the base styles, `css/base.css`, that `norn-base` embeds. For a layout of the project's own. */
export const base = posix(path.join(HERE, "css", "base.css"));

/** Absolute path to the print styles, `css/print.css`, that `norn-base` embeds. For a layout of the project's own. */
export const print = posix(path.join(HERE, "css", "print.css"));

/** The places in `norn-base` a theme or project fills with markup, in page order. */
export const HOOKS = Object.freeze(["head", "banner", "cta", "credit"]);

/** The layouts the plugin ships. Every one but `norn-base` extends `norn-base`. */
export const LAYOUTS = Object.freeze(["norn-base", "norn-docs", "norn-docs-home", "norn-landing", "norn-workspace", "norn-workspaces-home"]);

/** The props `norn-base` and the layouts read, looked up on the page data by name when there is no `props` mapping. */
const PROPS = [
	"lang",
	"dir",
	"title",
	"name",
	"tagline",
	"description",
	"url",
	"ogTitle",
	"ogImage",
	"locale",
	"themeColor",
	"themeToggle",
	"icon",
	"touchIcon",
	"logo",
	"nav",
	"footer",
	"lede",
	"install",
	"repo",
	"license",
	"node",
	"usage",
	"features",
	"packages",
	"docs",
	"prev",
	"next",
	"search",
	"workspaces",
	"workspace",
];

/** The props that are lists: each defaults to `[]`, so a layout can loop over it. */
const LISTS = ["nav", "features", "packages", "docs", "workspaces"];

/** Icon types by file extension, for the icon link. */
const ICON_TYPES = { ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webp": "image/webp" };

/** The plain `norn-code-block`, `<pre><code>`, registered in place of the code sample when it is not installed. */
const plainCodeBlock = posix(path.join(HERE, "fallback", "norn-code-block.webc"));

/**
 * `@allons-y/webc-code-sample`, when it is installed: an optional peer. Without it the plugin registers `plainCodeBlock` under the same tag.
 * Any other failure to load it is a real error and is thrown.
 */
const codeSample = isInstalled("@allons-y/webc-code-sample")
	? await Promise.all([import("@allons-y/webc-code-sample"), import("@allons-y/webc-code-sample/markdown")]).then(([main, markdown]) => ({
		codeBlock: main.codeBlock,
		tokenRanges: main.tokenRanges,
		highlightFences: markdown.highlightFences,
	}))
	: null;

/** Per-configuration state: the hook fills, and whether the plugin ran. */
const states = new WeakMap();

function state(config) {
	if (!states.has(config)) states.set(config, { hooks: Object.fromEntries(HOOKS.map((name) => [name, []])), registered: false });
	return states.get(config);
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const defined = (object) => Object.fromEntries(Object.entries(isObject(object) ? object : {}).filter(([, value]) => value !== undefined));

/**
 * Add markup to the hooks in `norn-base`: `head` (end of the head), `banner` (before the header), `cta` (end of `main`), and `credit` (the footer's last column).
 * A fill is WebC markup, compiled with the page, so it may call components. Fills are appended in the order they are added, and no page data can change them.
 * Themes call it from their plugin, and projects from their config: a favicon, a project stylesheet.
 *
 * @param {import("@11ty/eleventy").UserConfig} config
 * @param {{ head?: string, banner?: string, cta?: string, credit?: string }} fills - Markup by hook name
 * @throws {Error} On an unknown hook name, or a fill that is not a string
 */
export function fillHooks(config, fills = {}) {
	const { hooks } = state(config);
	for (const [name, markup] of Object.entries(fills)) {
		if (!HOOKS.includes(name)) throw new Error(`norn: no hook named "${name}". Hooks: ${HOOKS.join(", ")}`);
		if (typeof markup !== "string") throw new Error(`norn: the ${name} hook takes a markup string.`);
		hooks[name].push(markup);
	}
}

/** The props a page reads off its own data when the project gives no mapping: the same-named fields. */
const sameNamed = (data) => Object.fromEntries(PROPS.map((key) => [key, data?.[key]]));

/**
 * The layout props for one page, from the mapping or the same-named page data, over the theme's defaults.
 * It runs against Eleventy's placeholder data too, so it never throws on missing data, and every list is a list.
 *
 * @param {object} data - The page data
 * @param {(data: object) => object} map
 * @param {object} defaults
 */
function layoutProps(data, map, defaults) {
	const props = { ...defined(defaults), ...defined(map(data)) };
	props.lang = typeof props.lang === "string" && props.lang ? props.lang : typeof data?.page?.lang === "string" && data.page.lang ? data.page.lang : "en";
	for (const key of LISTS) props[key] = list(props[key]);
	const footer = defined(props.footer);
	props.footer = { ...footer, badges: list(footer.badges), groups: list(footer.groups).map((group) => ({ ...defined(group), links: list(group?.links) })) };
	if (typeof props.icon === "string") props.icon = { href: props.icon };
	if (isObject(props.icon) && typeof props.icon.href === "string") {
		props.icon = { ...props.icon, type: props.icon.type ?? ICON_TYPES[path.extname(props.icon.href).toLowerCase()] ?? "image/png" };
	} else {
		delete props.icon;
	}
	if (typeof props.logo === "string") props.logo = { src: props.logo };
	if (!isObject(props.logo) || typeof props.logo.src !== "string") delete props.logo;
	if (typeof props.ogImage === "string") props.ogImage = { src: props.ogImage };
	if (!isObject(props.ogImage) || typeof props.ogImage.src !== "string" || !props.ogImage.src) delete props.ogImage;
	return props;
}

/**
 * Whether a shipped layout compiles the page content as WebC, so the components the Markdown add-ons write render: the `nornCompiles` helper.
 * Content compiles exactly once, and only when it is Markdown output that no WebC has compiled, by `page.templateSyntax`.
 * WebC output, a `templateEngineOverride` with `webc`, and a Nunjucks or Liquid page that renders through `{% renderTemplate "webc" %}` are already compiled.
 * A project's own WebC layout as the page's layout compiles the content itself. A Nunjucks or Liquid layout in the chain, or a layout alias, does not.
 * Every child layout sets `nornCompiled: true` in its front matter, which reaches `norn-base` in the data, so the frame leaves what the child compiled.
 *
 * @param {object} data - The page data, `$data`
 * @param {string} layout - The shipped layout that asks, such as `norn-docs`
 * @param {Record<string, string>} [aliases] - The project's layout aliases
 * @returns {boolean}
 */
export function compiles(data, layout, aliases = {}) {
	const engines = String(data?.page?.templateSyntax ?? "").split(",");
	if (!engines.includes("md") || engines.includes("webc")) return false;
	const own = String(aliases[data.layout] ?? data.layout ?? "");
	if (own.endsWith(".webc") && !LAYOUTS.includes(path.posix.basename(own, ".webc"))) return false;
	return layout !== "norn-base" || !data.nornCompiled;
}

/** Read a compiled layout, with `norn-base`'s style placeholders filled from the package's css folder. */
function readLayout(name) {
	const text = fs.readFileSync(path.join(HERE, "layouts", `${name}.webc`), "utf8");
	return text.replace(/\/\* norn: css\/(base|print)\.css \*\//g, (_, file) => fs.readFileSync(path.join(HERE, "css", `${file}.css`), "utf8").trim());
}

/**
 * The Norn plugin for Eleventy: the one `@11ty/eleventy-plugin-webc` registration, the layouts, the helpers, and the Markdown add-ons.
 *
 * @param {import("@11ty/eleventy").UserConfig} config
 * @param {object} [options]
 * @param {(data: object) => object} [options.props] - Maps a page's data to the layout props, added as `eleventyComputed.norn`. Without it, each prop is read off the same-named page data. It runs against Eleventy's placeholder data too: it must not throw on missing data.
 * @param {boolean | string[]} [options.layouts] - `true` ships the six layouts, `false` none, or a list of layout names to leave out, so the project can supply its own
 * @param {string[]} [options.components] - More component globs: a theme's, the project's
 * @param {string[]} [options.exclude] - Packaged components to leave out, so the project can supply its own
 * @param {Record<string, object>} [options.strings] - The `componentStrings` table, registered as `nornComponentStrings`
 * @param {string | string[] | Record<string, string | { src: string, mirror?: boolean }>} [options.icons] - Project icons for `norn-icon`: a glob or list of globs of `.svg` files, each named for its file without the extension, or a record of names to a path or `{ src, mirror }`. Paths resolve against the working directory. A name that matches a built-in icon replaces it
 * @param {boolean} [options.markdown] - Amend Markdown with the add-ons: fenced code as `norn-code-block` when the code sample is installed, callouts, scrolling tables, and anchored headings. On by default
 * @param {object} [options.defaults] - Prop values a theme sets, under the mapping's
 * @throws {Error} On a bad option, a missing icon file, a second registration of the plugin or of `@11ty/eleventy-plugin-webc`, or, at build time, a project layout named like a shipped one or a page that sets the reserved `norn` key
 */
export default function norn(config, options = {}) {
	const { props, layouts = true, components = [], exclude = [], strings = {}, markdown = true, defaults = {}, icons } = options ?? {};
	if (props !== undefined && typeof props !== "function") throw new Error("norn: `props` must be a function from page data to layout props.");
	if (!Array.isArray(components) || components.some((glob) => typeof glob !== "string")) throw new Error("norn: `components` must be a list of globs.");
	if (layouts !== true && layouts !== false && !Array.isArray(layouts)) throw new Error("norn: `layouts` must be true, false, or a list of layout names to leave out.");
	const skipped = Array.isArray(layouts) ? layouts.map((name) => String(name).replace(/\.webc$/, "")) : [];
	const unknown = skipped.filter((name) => !LAYOUTS.includes(name));
	if (unknown.length) throw new Error(`norn: no layout named ${unknown.map((name) => `"${name}"`).join(", ")}. Layouts: ${LAYOUTS.join(", ")}`);

	let projectIcons = readIcons(icons);

	const own = state(config);
	if (own.registered) throw new Error("norn: the plugin is added twice. A theme such as @allons-y/webc-oss-site adds it for you: add the theme in its place.");
	own.registered = true;

	if (config.plugins?.some((entry) => entry.plugin === webc)) {
		throw new Error("norn: @11ty/eleventy-plugin-webc is registered twice. The Norn plugin registers it: remove the project's own `addPlugin`, and pass its component globs as `components`.");
	}
	try {
		config.addPlugin(webc, { components: [patterns({ exclude }), codeSample ? codeSample.codeBlock : plainCodeBlock, ...components] });
	} catch (error) {
		if (/"webc" template syntax twice/.test(error.message)) {
			throw new Error("norn: @11ty/eleventy-plugin-webc is registered twice. The Norn plugin registers it: remove the other `addPlugin`, and pass its component globs as `components`.", { cause: error });
		}
		throw error;
	}

	config.addJavaScriptFunction("nornAdjacent", adjacent);
	config.addJavaScriptFunction("nornHeadings", headings);
	config.addJavaScriptFunction("nornComponentStrings", componentStrings(strings));
	config.addJavaScriptFunction("nornHook", (name) => {
		if (!HOOKS.includes(name)) throw new Error(`norn: no hook named "${name}". Hooks: ${HOOKS.join(", ")}`);
		return own.hooks[name].join("\n");
	});
	config.addJavaScriptFunction("nornIcons", () => projectIcons);
	config.addJavaScriptFunction("nornCompiles", (data, layout) => compiles(data, layout, config.layoutAliases ?? {}));
	if (icons !== undefined) {
		config.on("eleventy.before", () => {
			projectIcons = readIcons(icons);
		});
		for (const glob of [icons].flat()) if (typeof glob === "string") config.addWatchTarget?.(glob);
		if (isObject(icons)) for (const value of Object.values(icons)) config.addWatchTarget?.(typeof value === "string" ? value : value.src);
	}
	if (codeSample) config.addJavaScriptFunction("nornTokenRanges", codeSample.tokenRanges);

	if (markdown) {
		if (codeSample) config.amendLibrary("md", codeSample.highlightFences);
		config.amendLibrary("md", scrollTables);
		config.amendLibrary("md", callouts);
		config.amendLibrary("md", headingAnchors);
	}

	config.addTransform("norn-empty-bundle-tags", dropEmptyBundleTags);

	const map = props ?? sameNamed;
	config.addGlobalData("eleventyComputed", { norn: (data) => layoutProps(data, map, defaults) });
	// A preprocessor sees the data before computed data runs, so a page's own `norn` is still there to report.
	config.addPreprocessor("norn-reserved", "*", (data) => {
		if (data?.norn !== undefined) throw new Error(`norn: ${data.page?.inputPath} sets \`norn\`, a reserved key: the plugin computes it from \`props\`, which would replace it. Map the value in \`props\`, or rename the key.`);
	});

	if (layouts === false) return;
	const shipped = LAYOUTS.filter((name) => !skipped.includes(name));
	const dirs = config.directories;
	const input = path.posix.normalize(dirs.input);
	const strays = new Set();
	for (const name of shipped) {
		// Eleventy looks a layout up by its path relative to the input folder, and lists a virtual one outside it as a page too.
		const file = path.posix.normalize(path.posix.join(dirs.layouts ?? dirs.includes, `${name}.webc`));
		const key = file.startsWith(input) && input !== "./" ? file.slice(input.length) : file;
		config.addTemplate(key, readLayout(name), {});
		strays.add(`./${path.posix.join(input, key)}`);
	}
	config.addPreprocessor("norn-layouts", "webc", function () {
		if (strays.has(this.inputPath)) return false;
	});

	config.on("eleventy.before", () => {
		const folders = [...new Set([dirs.includes, dirs.layouts].filter(Boolean))];
		const found = folders.flatMap((folder) => shipped.map((name) => path.join(folder, `${name}.webc`))).filter((file) => fs.existsSync(file));
		if (found.length) {
			throw new Error(`norn: ${found.map(posix).join(", ")} has the name of a shipped layout, which would silently replace the file. Rename it, or leave the shipped one out with \`layouts: [${found.map((file) => `"${path.basename(file, ".webc")}"`).join(", ")}]\`.`);
		}
	});
}
