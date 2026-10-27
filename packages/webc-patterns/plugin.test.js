/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import webc from "@11ty/eleventy-plugin-webc";

import { codeBlock } from "../webc-code-sample/index.js";
import { highlightFences } from "../webc-code-sample/markdown.js";
import { patterns } from "./index.js";
import { callouts, headingAnchors, scrollTables } from "./markdown.js";
import norn, { base, compiles, fillHooks, HOOKS, LAYOUTS, print, reset } from "./plugin.js";

/** A stand-in for Eleventy's config that records what a plugin registers. */
function fakeConfig({ input = "./src/content/", includes = "./src/_includes/", layouts = "./src/_layouts/", plugins = [] } = {}) {
	const calls = { plugins: [], functions: {}, amends: [], transforms: {}, globalData: {}, templates: {}, preprocessors: {}, events: {} };
	return {
		calls,
		plugins,
		directories: { input, includes, layouts },
		addPlugin(plugin, options) {
			if (plugin === webc && calls.plugins.some((entry) => entry.plugin === webc)) throw new Error('An attempt was made to override the "webc" template syntax twice.');
			calls.plugins.push({ plugin, options });
		},
		addJavaScriptFunction: (name, fn) => (calls.functions[name] = fn),
		amendLibrary: (language, fn) => calls.amends.push([language, fn]),
		addTransform: (name, fn) => (calls.transforms[name] = fn),
		addGlobalData: (name, data) => (calls.globalData[name] = data),
		addTemplate: (key, content, data) => (calls.templates[key] = { content, data }),
		addPreprocessor: (name, extensions, fn) => (calls.preprocessors[name] = { extensions, fn }),
		on: (event, fn) => (calls.events[event] = fn),
	};
}

/** The computed `norn` props for some page data. */
const computed = (config, data) => config.calls.globalData.eleventyComputed.norn(data);

test("fillHooks appends fills in order, and an unknown hook or a fill that is not markup throws", () => {
	const config = fakeConfig();
	fillHooks(config, { head: "<link rel=\"icon\" href=\"/a.svg\">" });
	norn(config, { layouts: false });
	fillHooks(config, { head: "<meta name=\"b\">", credit: "<p>Credit</p>" });
	const hook = config.calls.functions.nornHook;
	assert.equal(hook("head"), "<link rel=\"icon\" href=\"/a.svg\">\n<meta name=\"b\">", "fills before and after the plugin, in order");
	assert.equal(hook("credit"), "<p>Credit</p>");
	assert.equal(hook("banner"), "", "an empty hook renders nothing");
	assert.throws(() => hook("footer"), /no hook named "footer". Hooks: head, banner, cta, credit/);
	assert.throws(() => fillHooks(config, { sidebar: "<p></p>" }), /no hook named "sidebar"/);
	assert.throws(() => fillHooks(config, { cta: ["<p></p>"] }), /the cta hook takes a markup string/);
	assert.deepEqual([...HOOKS], ["head", "banner", "cta", "credit"]);
});

test("the plugin registers the WebC plugin once: the patterns, then the code sample when it is installed, then the extra globs", () => {
	const config = fakeConfig();
	norn(config, { components: ["theme/*.webc", "_includes/*.webc"], exclude: ["norn-card"], layouts: false });
	const registrations = config.calls.plugins.filter(({ plugin }) => plugin === webc);
	assert.equal(registrations.length, 1);
	assert.deepEqual(registrations[0].options.components, [patterns({ exclude: ["norn-card"] }), codeBlock, "theme/*.webc", "_includes/*.webc"]);
});

test("the code sample is an optional peer: absent is fine, present is used, and installed but broken is an error", async () => {
	const repo = path.resolve(import.meta.dirname, "..", "..");
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "norn-peer-"));
	/** This package copied into a project's node_modules, which `modules` then fills. Returns the copy's plugin module. */
	const install = async (name, modules) => {
		const project = path.join(root, name, "node_modules");
		const dir = path.join(project, "@allons-y", "webc-patterns");
		fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
		fs.mkdirSync(path.join(dir, "components"));
		fs.writeFileSync(path.join(dir, "components", "norn-card.webc"), "<p></p>");
		for (const file of ["plugin.js", "index.js", "markdown.js", "lib/icons.js", "lib/optional.js"]) fs.copyFileSync(path.join(import.meta.dirname, file), path.join(dir, file));
		fs.symlinkSync(path.join(repo, "node_modules", "@11ty"), path.join(project, "@11ty"), "junction");
		modules(path.join(project, "@allons-y"));
		return import(pathToFileURL(path.join(dir, "plugin.js")).href);
	};
	try {
		const absent = fakeConfig();
		(await install("absent", () => {})).default(absent, { layouts: false });
		assert.equal(absent.calls.functions.nornTokenRanges, undefined, "no code sample helper");
		assert.equal(absent.calls.amends.length, 3, "tables, callouts, and heading anchors, without the fences");

		const present = fakeConfig();
		(await install("present", (scope) => fs.symlinkSync(path.join(repo, "packages", "webc-code-sample"), path.join(scope, "webc-code-sample"), "junction"))).default(present, { layouts: false });
		assert.equal(typeof present.calls.functions.nornTokenRanges, "function");
		assert.equal(present.calls.amends.length, 4, "with the fences");

		// Installed, but one of its own dependencies is missing: Node names the importing file in the message, and that path holds the peer's name.
		await assert.rejects(
			install("broken", (scope) => {
				const stub = path.join(scope, "webc-code-sample");
				fs.mkdirSync(stub);
				fs.writeFileSync(path.join(stub, "package.json"), JSON.stringify({ name: "@allons-y/webc-code-sample", type: "module", exports: { ".": "./index.js", "./markdown": "./markdown.js" } }));
				fs.writeFileSync(path.join(stub, "index.js"), 'import "a-dependency-that-is-not-installed";\n');
				fs.writeFileSync(path.join(stub, "markdown.js"), "export const highlightFences = () => {};\n");
			}),
			(error) => error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes("a-dependency-that-is-not-installed"),
		);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("the plugin registers the helpers, the Markdown add-ons, the empty bundle tag transform, and the computed props", () => {
	const config = fakeConfig();
	norn(config, { layouts: false, strings: { "norn-skip-link": { label: "Sauter" } } });
	assert.deepEqual(Object.keys(config.calls.functions).sort(), ["nornAdjacent", "nornCompiles", "nornComponentStrings", "nornHeadings", "nornHook", "nornIcons", "nornTokenRanges"]);
	assert.equal(config.calls.functions.nornComponentStrings("norn-skip-link", "label"), "Sauter");
	assert.deepEqual(config.calls.amends, [["md", highlightFences], ["md", scrollTables], ["md", callouts], ["md", headingAnchors]]);
	assert.ok(config.calls.transforms["norn-empty-bundle-tags"]);
	assert.equal(typeof config.calls.globalData.eleventyComputed.norn, "function");
	const plain = fakeConfig();
	norn(plain, { layouts: false, markdown: false });
	assert.deepEqual(plain.calls.amends, [], "markdown: false leaves Markdown alone");
});

test("the six layouts register under the configured layouts folder, and one outside the input is never listed as a page", () => {
	const config = fakeConfig();
	norn(config);
	assert.deepEqual(Object.keys(config.calls.templates).sort(), LAYOUTS.map((name) => `src/_layouts/${name}.webc`).sort());
	assert.ok(config.calls.templates["src/_layouts/norn-docs.webc"].content.startsWith("---\nlayout: norn-base.webc\nnornCompiled: true\n---"));
	const baseLayout = config.calls.templates["src/_layouts/norn-base.webc"].content;
	assert.ok(baseLayout.includes("@layer norn.base {") && baseLayout.includes("@layer norn.print {") && !baseLayout.includes("/* norn: css/"), "the base and print styles are embedded");
	const { extensions, fn } = config.calls.preprocessors["norn-layouts"];
	assert.equal(extensions, "webc");
	assert.equal(fn.call({ inputPath: "./src/content/src/_layouts/norn-base.webc" }), false, "the stray page Eleventy lists for it is skipped");
	assert.equal(fn.call({ inputPath: "./src/content/index.webc" }), undefined, "a page is left alone");
	const inside = fakeConfig({ input: "./src/", includes: "./src/_includes/", layouts: null });
	norn(inside);
	assert.ok(inside.calls.templates["_includes/norn-landing.webc"], "the includes folder, relative to the input, without a layouts folder");
});

test("nornCompiles compiles Markdown once, at the first shipped layout, and never content WebC already compiled", () => {
	const page = (templateSyntax, layout, more = {}) => ({ page: { templateSyntax }, layout, ...more });
	for (const syntax of ["md", "liquid,md", "njk,md"]) assert.equal(compiles(page(syntax, "norn-base.webc"), "norn-base"), true, `${syntax} on norn-base`);
	for (const syntax of ["webc", "webc,md", "njk", "liquid", "11ty.js", undefined]) assert.equal(compiles(page(syntax, "norn-base.webc"), "norn-base"), false, `${syntax}: already compiled, or not Markdown`);
	assert.equal(compiles(page("md", "norn-docs.webc", { nornCompiled: true }), "norn-docs"), true, "the child layout compiles");
	assert.equal(compiles(page("md", "norn-docs.webc", { nornCompiled: true }), "norn-base"), false, "and the frame leaves it");
	assert.equal(compiles(page("md", "post.njk"), "norn-base"), true, "a Nunjucks layout in the chain");
	assert.equal(compiles(page("md", "page"), "norn-base"), true, "an alias");
	assert.equal(compiles(page("md", "docs", { nornCompiled: true }), "norn-docs", { docs: "norn-docs.webc" }), true, "an alias of a child layout");
	assert.equal(compiles(page("md", "own.webc"), "norn-base"), false, "a WebC layout of the project's own compiles it");
	assert.equal(compiles(page("md", "mine"), "norn-base", { mine: "layouts/own.webc" }), false, "also through an alias");
	const config = fakeConfig();
	config.layoutAliases = { mine: "own.webc" };
	norn(config, { layouts: false });
	assert.equal(config.calls.functions.nornCompiles(page("md", "mine"), "norn-base"), false, "the helper reads the project's aliases");
});

test("layouts: false registers none, a list leaves those out, and an unknown name throws", () => {
	const none = fakeConfig();
	norn(none, { layouts: false });
	assert.deepEqual(none.calls.templates, {});
	const some = fakeConfig();
	norn(some, { layouts: ["norn-landing", "norn-docs.webc"] });
	assert.deepEqual(Object.keys(some.calls.templates).sort(), ["src/_layouts/norn-base.webc", "src/_layouts/norn-docs-home.webc", "src/_layouts/norn-workspace.webc", "src/_layouts/norn-workspaces-home.webc"]);
	assert.throws(() => norn(fakeConfig(), { layouts: ["norn-home"] }), /no layout named "norn-home". Layouts: norn-base, norn-docs/);
});

test("bad options throw, naming the option", () => {
	assert.throws(() => norn(fakeConfig(), { props: { title: "x" } }), /`props` must be a function/);
	assert.throws(() => norn(fakeConfig(), { components: "theme/*.webc" }), /`components` must be a list of globs/);
	assert.throws(() => norn(fakeConfig(), { layouts: "norn-base" }), /`layouts` must be true, false, or a list/);
});

test("icons: the nornIcons helper returns the project's icons, and none without the option", () => {
	const none = fakeConfig();
	norn(none, { layouts: false });
	assert.deepEqual(none.calls.functions.nornIcons(), {});
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "norn-icons-"));
	const cwd = process.cwd();
	try {
		fs.mkdirSync(path.join(root, "icons"));
		fs.writeFileSync(path.join(root, "icons", "dot.svg"), '<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>');
		fs.writeFileSync(path.join(root, "next.svg"), '<svg><path d="M0 0h4"/></svg>');
		process.chdir(root);
		const globbed = fakeConfig();
		norn(globbed, { layouts: false, icons: "icons/*.svg" });
		assert.deepEqual(globbed.calls.functions.nornIcons(), { dot: { viewBox: "0 0 8 8", body: '<circle cx="4" cy="4" r="3"/>', mirror: false } });
		const record = fakeConfig();
		norn(record, { layouts: false, icons: { "arrow-next": { src: "next.svg", mirror: true } } });
		assert.deepEqual(Object.keys(record.calls.functions.nornIcons()), ["arrow-next"]);
		assert.equal(record.calls.functions.nornIcons()["arrow-next"].mirror, true);
		fs.writeFileSync(path.join(root, "icons", "dot.svg"), '<svg viewBox="0 0 9 9"><circle cx="4" cy="4" r="3"/></svg>');
		globbed.calls.events["eleventy.before"]();
		assert.equal(globbed.calls.functions.nornIcons().dot.viewBox, "0 0 9 9", "a rebuild reads the files again");
	} finally {
		process.chdir(cwd);
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("icons: a bad option or a missing file throws before anything is registered", () => {
	for (const icons of [7, [], { Dot: "dot.svg" }, { dot: "missing.svg" }, { dot: { src: "dot.svg", mirror: 1 } }]) {
		const config = fakeConfig();
		assert.throws(() => norn(config, { layouts: false, icons }), /norn: `?icons/, JSON.stringify(icons));
		assert.deepEqual(config.calls.plugins, [], "the WebC plugin is not registered");
	}
});

test("the plugin added twice, or beside a project's own WebC registration, throws", () => {
	const twice = fakeConfig();
	norn(twice, { layouts: false });
	assert.throws(() => norn(twice, { layouts: false }), /the plugin is added twice/);
	assert.throws(() => norn(fakeConfig({ plugins: [{ plugin: webc, options: {} }] }), { layouts: false }), /@11ty\/eleventy-plugin-webc is registered twice/, "a top-level registration");
	const nested = fakeConfig();
	nested.addPlugin(webc, {});
	assert.throws(() => norn(nested, { layouts: false }), /@11ty\/eleventy-plugin-webc is registered twice/, "an earlier registration from another plugin");
});

test("eleventyComputed.norn maps the page data through props over the theme's defaults, and every list defaults to []", () => {
	const config = fakeConfig();
	norn(config, { layouts: false, props: (data) => ({ title: data.heading, themeColor: data.color, nav: data.links }), defaults: { themeColor: "#123456", locale: "en_US" } });
	assert.deepEqual(computed(config, { heading: "Usage", links: "not a list", page: {} }), {
		themeColor: "#123456",
		locale: "en_US",
		title: "Usage",
		lang: "en",
		nav: [],
		features: [],
		packages: [],
		docs: [],
		workspaces: [],
		footer: { badges: [], groups: [] },
	});
	assert.equal(computed(config, { color: "#abcdef", page: {} }).themeColor, "#abcdef", "the mapping wins over a default");
});

test("without props each layout prop is the same-named page data, and missing or odd data never throws", () => {
	const config = fakeConfig();
	norn(config, { layouts: false });
	const props = computed(config, { title: "Plain", name: "Site", nav: [{ url: "/", title: "Home" }], footer: "not an object", icon: "/assets/icon.svg", logo: "/assets/logo.svg", heading: "ignored", page: { lang: "fr" } });
	assert.equal(props.title, "Plain");
	assert.deepEqual(props.nav, [{ url: "/", title: "Home" }]);
	assert.deepEqual(props.footer, { badges: [], groups: [] });
	assert.deepEqual(props.icon, { href: "/assets/icon.svg", type: "image/svg+xml" });
	assert.deepEqual(props.logo, { src: "/assets/logo.svg" });
	assert.equal(props.lang, "fr", "the page's language");
	assert.ok(!("heading" in props), "only the layout props");
	for (const data of [{}, undefined, { page: undefined, footer: { groups: [{ heading: "Help" }] } }]) assert.doesNotThrow(() => computed(config, data));
	assert.deepEqual(computed(config, { footer: { groups: [{ heading: "Help" }] } }).footer.groups, [{ heading: "Help", links: [] }]);
});

test("ogImage is a prop: a URL string becomes {src}, an object keeps its alt, and anything else is dropped", () => {
	const config = fakeConfig();
	norn(config, { layouts: false });
	assert.deepEqual(computed(config, { ogImage: "/card.png", page: {} }).ogImage, { src: "/card.png" });
	assert.deepEqual(computed(config, { ogImage: { src: "card.png", alt: "A card" }, page: {} }).ogImage, { src: "card.png", alt: "A card" });
	for (const ogImage of [undefined, "", 7, {}, { src: "" }, { alt: "No source" }]) assert.ok(!("ogImage" in computed(config, { ogImage, page: {} })), JSON.stringify(ogImage));
	const mapped = fakeConfig();
	norn(mapped, { layouts: false, props: (data) => ({ ogImage: data.share && { src: data.share, alt: data.shareAlt } }) });
	assert.deepEqual(computed(mapped, { share: "card.png", shareAlt: "A card", page: {} }).ogImage, { src: "card.png", alt: "A card" });
});

test("a project file named like a shipped layout fails the build, unless that layout is left out", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "norn-layouts-"));
	fs.mkdirSync(path.join(root, "_layouts"));
	fs.writeFileSync(path.join(root, "_layouts", "norn-docs.webc"), "<article></article>");
	const config = fakeConfig({ input: `${root}/content/`, includes: `${root}/_includes/`, layouts: `${root}/_layouts/` });
	norn(config);
	assert.throws(() => config.calls.events["eleventy.before"](), /_layouts\/norn-docs.webc has the name of a shipped layout, which would silently replace the file. Rename it, or leave the shipped one out with `layouts: \["norn-docs"\]`/);
	const skipped = fakeConfig({ input: `${root}/content/`, includes: `${root}/_includes/`, layouts: `${root}/_layouts/` });
	norn(skipped, { layouts: ["norn-docs"] });
	assert.doesNotThrow(() => skipped.calls.events["eleventy.before"]());
	fs.rmSync(root, { recursive: true, force: true });
});

test("reset, base, and print are forward-slash paths to the shipped stylesheets", () => {
	for (const [file, layer] of [[reset, "norn.reset"], [base, "norn.base"], [print, "norn.print"]]) {
		assert.ok(!file.includes("\\") && fs.existsSync(file), file);
		assert.ok(fs.readFileSync(file, "utf8").includes(`@layer ${layer} {`), `${file} is in ${layer}`);
	}
});
