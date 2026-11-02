/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { WebC } from "@11ty/webc";

import { tokenRanges } from "./packages/webc-code-sample/index.js";
import { headings } from "./packages/webc-patterns/markdown.js";
import { adjacent, componentStrings, defaultStrings } from "./packages/webc-patterns/index.js";
import { compiles, HOOKS, LAYOUTS } from "./packages/webc-patterns/plugin.js";
import { csfDoc, csfFile, effectiveArgTypes, readCsf } from "./preview/lib/catalog.js";
import { analyzeFile, analyzeWebc, derivedArgTypes, helperNames, sourceFiles } from "./scripts/analyze-webc.js";
import { readTokens, TOKENS_FILE } from "./scripts/build-components.js";

const PACKAGES = path.join(import.meta.dirname, "packages");

// css-tree is installed for WebC, which parses component styles with it. Resolve it from there.
const csstree = createRequire(createRequire(import.meta.url).resolve("@11ty/webc/package.json"))("css-tree");

/** Every file of one type in a package folder (`src`, `components`, `layouts`, `css`), without its inline SVG. */
const filesIn = (folder, extension = ".webc") =>
	fs
		.readdirSync(PACKAGES)
		.flatMap((name) => {
			const dir = path.join(PACKAGES, name, folder);
			return fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(extension)).map((file) => `${name}/${folder}/${file}`) : [];
		})
		.map((file) => ({ file, text: fs.readFileSync(path.join(PACKAGES, file), "utf8").replace(/<svg[\s\S]*?<\/svg>/g, "") }));

/** The compiled components, which is what the packages ship: run the build first (`yarn test` does). */
const components = filesIn("components");

/** The compiled layouts and stylesheets, shipped beside the components. */
const layouts = filesIn("layouts");

/** The compiled fallbacks: the plain `norn-code-block` the plugin registers without the code sample. */
const fallbacks = filesIn("fallback");
const stylesheets = filesIn("css", ".css");

/** The sources everything compiled comes from: components, layouts, and stylesheets. */
const sources = [...filesIn("src"), ...filesIn("src/layouts"), ...filesIn("src/fallback"), ...filesIn("src/css", ".css")];

/** Every compiled file, by the source it comes from. */
const compiledFrom = (file) => file.replace(/\/src\/layouts\//, "/layouts/").replace(/\/src\/fallback\//, "/fallback/").replace(/\/src\/css\//, "/css/").replace(/\/src\//, "/components/");

const squash = (value) => value.replace(/\s+/g, " ").trim();

/**
 * Each component's and layout's docs, by name, from its CSF file.
 * The plain fallback has none: it takes the real component's, with its own props and slots derived from its source.
 */
const docs = new Map(
	await Promise.all(
		filesIn("src")
			.map((entry) => ({ ...entry, layout: false }))
			.concat(filesIn("src/layouts").map((entry) => ({ ...entry, layout: true })))
			.concat(filesIn("src/fallback").map((entry) => ({ ...entry, layout: false, fallback: true })))
			.map(async ({ file, text, layout, fallback }) => {
				const derived = derivedArgTypes(analyzeFile(path.join(PACKAGES, file)));
				if (fallback) {
					const names = (category) => new Set(Object.entries(derived).filter(([, argType]) => argType.table.category === category).map(([arg]) => arg));
					return [`fallback:${path.basename(file, ".webc")}`, { fallback: true, props: names("props"), slots: names("slots"), text }];
				}
				const stories = csfFile(path.join(PACKAGES, file.split("/")[0]), path.basename(file, ".webc"), layout);
				if (!fs.existsSync(stories)) throw new Error(`${file}: no CSF file at ${path.relative(PACKAGES, stories)}`);
				const { meta } = await readCsf(stories);
				const doc = csfDoc(meta, effectiveArgTypes(derived, meta.argTypes));
				return [path.basename(file, ".webc"), { category: doc.category, slots: new Set(doc.slots.map(({ name: slot }) => slot)), props: new Set(doc.props.map(({ name: prop }) => prop)), text: fs.readFileSync(stories, "utf8") }];
			}),
	),
);
for (const [name, doc] of docs) if (doc.fallback) docs.set(name, { ...docs.get(name.replace(/^fallback:/, "")), ...doc });

/** A component's or layout's docs, by its file. */
const docsOf = (file) => docs.get(`${/\/fallback\//.test(file) ? "fallback:" : ""}${path.basename(file, ".webc")}`);

/** The server-only comment, `<!--- … --->`, which holds a file's license header. WebC drops it at render. */
const SERVER_COMMENT = /<!---[\s\S]*?--->/g;

/** A file's markup, scripts, and styles without its server-only comment. */
const withoutDocs = (text) => text.replace(SERVER_COMMENT, "");

/** The CSS of a file: a stylesheet's whole text, or every `<style>` block of a component or layout. */
const styles = (text, file = "") => (file.endsWith(".css") ? text : [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(([, css]) => css).join("\n"));

const tokens = readTokens();
const byName = new Map(tokens.map((token) => [token.name, token]));
const byPath = new Map(tokens.map((token) => [token.path, token]));

test("tokens.json holds tokens in groups: a leaf has a value and a comment, and a group never has a value", () => {
	const tree = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
	const walk = (node, trail) => {
		for (const [key, child] of Object.entries(node)) {
			const here = [...trail, key].join(".");
			if ("value" in child) {
				assert.equal(typeof child.value, "string", `${here} has a string value`);
				assert.ok(typeof child.comment === "string" && child.comment.length > 0, `${here} has a comment`);
				assert.deepEqual(Object.keys(child).sort(), ["comment", "value"], `${here} is a leaf`);
			} else {
				assert.ok(Object.keys(child).length > 0 && trail.length < 3, `${here} is a group`);
				walk(child, [...trail, key]);
			}
		}
	};
	walk(tree, []);
	assert.equal(new Set(tokens.map(({ name }) => name)).size, tokens.length, "no two paths share a custom property");
	for (const { path: tokenPath, name } of tokens) assert.equal(name, "--norn-" + tokenPath.split(".").join("-"), `${tokenPath} names ${name}`);
});

test("a token's references resolve: no {path} is left in a default", () => {
	for (const { path: tokenPath, resolved } of tokens) assert.ok(!/[{}]/.test(resolved), `${tokenPath}: ${resolved}`);
	assert.equal(byPath.get("font.heading").resolved, `var(--norn-font-body, ${byPath.get("font.body").resolved})`);
	assert.equal(byPath.get("text.accent").resolved.includes(`var(--norn-ui-accent, ${byPath.get("ui.accent").resolved})`), true, "the accent text follows a project accent");
});

test("every use of a shared token in a source carries the t() fallback for the path that names it", () => {
	for (const { file, text } of sources) {
		const css = styles(text, file);
		assert.ok(!/@property --norn-/.test(css) || ![...css.matchAll(/@property (--norn-[\w-]+)/g)].some(([, name]) => byName.has(name)), `${file}: a shared token is registered with @property`);
		for (const [, name, rest] of css.matchAll(/var\((--norn-[\w-]+)(\s*,\s*t\('[^']*'\))?/g)) {
			if (!byName.has(name) && !rest) continue;
			assert.ok(byName.has(name), `${file}: ${name} is not a shared token`);
			assert.equal(rest?.match(/t\('([^']*)'\)/)?.[1], byName.get(name).path, `${file}: var(${name}) falls back to t('${byName.get(name).path}')`);
		}
		for (const [, tokenPath] of css.matchAll(/t\('([^']*)'\)/g)) assert.ok(byPath.has(tokenPath), `${file}: t('${tokenPath}') is a path in tokens.json`);
		const fallbacks = [...css.matchAll(/var\((--norn-[\w-]+), t\('([^']*)'\)\)/g)].length;
		assert.equal([...css.matchAll(/t\('/g)].length, fallbacks, `${file}: every t() is the whole fallback of a var()`);
	}
});

test("a source declares a shared token only to set it for the project, and never as a fallback to itself", () => {
	for (const { file, text } of sources) {
		for (const [, name] of styles(text, file).matchAll(/^\s*(--norn-[\w-]+)\s*:/gm)) {
			if (!byName.has(name)) continue;
			assert.ok(["webc-oss-site/src/css/tokens.css", "webc-oss-site/src/oss-cta.webc"].includes(file), `${file}: ${name} is set only in the Allons-y Studio brand, or by oss-cta for its own actions`);
		}
	}
});

test("every token in tokens.json is read by a component, a layout, or the base styles", () => {
	const all = sources.map(({ file, text }) => styles(text, file)).join("\n");
	for (const { path: tokenPath } of tokens) assert.ok(all.includes(`t('${tokenPath}')`), `${tokenPath} is unused`);
});

test("the compiled components, layouts, and stylesheets keep no t() and no @tokens rule", () => {
	const compiled = [...components, ...layouts, ...fallbacks, ...stylesheets];
	assert.deepEqual(compiled.map(({ file }) => file).sort(), sources.map(({ file }) => compiledFrom(file)).sort(), "one compiled file per source");
	for (const { file, text } of compiled) {
		assert.ok(!/(^|[^\w-])t\(/.test(styles(text, file)), `${file}: a t() is left`);
		assert.ok(!/@tokens\b/.test(text), `${file}: an @tokens rule is left`);
		assert.ok(!/@property --norn-/.test(styles(text, file)) || ![...styles(text, file).matchAll(/@property (--norn-[\w-]+)/g)].some(([, name]) => byName.has(name)), `${file}: a shared token is registered with @property`);
	}
});

test("a compiled fallback is the default in tokens.json, resolved", () => {
	const compiled = new Map([...components, ...layouts, ...stylesheets].map(({ file, text }) => [file, text]));
	let checked = 0;
	for (const { file, text } of sources) {
		const css = compiled.get(compiledFrom(file));
		for (const [, name, tokenPath] of styles(text, file).matchAll(/var\((--norn-[\w-]+), t\('([^']*)'\)\)/g)) {
			assert.ok(styles(css, file).includes(`var(${name}, ${byPath.get(tokenPath).resolved})`), `${file}: ${name} compiles to its default`);
			checked++;
		}
	}
	assert.ok(checked > 100, "a real sweep");
	const toc = compiled.get("webc-patterns/components/norn-toc.webc");
	assert.ok(toc.includes("gap: var(--norn-space-xs, 0.5rem);"), "a spacing step");
	assert.ok(toc.includes("color: var(--norn-text-muted, light-dark(#4b5160, #a4abba));"), "a component reads the shared token, with its default");
});

test("the base styles define no token: base.css sets color-scheme, norn-head declares the layer order, and the components carry the defaults", () => {
	const base = stylesheets.find(({ file }) => file === "webc-patterns/css/base.css").text;
	assert.ok(/^@layer norn\.base \{\s*:root \{\s*color-scheme: light dark;/m.test(base));
	const head = components.find(({ file }) => file === "webc-patterns/components/norn-head.webc").text;
	assert.ok(head.includes("<style webc:keep>@layer norn.reset, norn.base, norn.layout, norn.components, norn.oss, norn.print;</style>"), "the order, inline");
	assert.ok(head.indexOf("@layer norn.reset,") < head.indexOf("getBundleFileUrl('css')"), "ahead of the bundle link");
	assert.ok(!head.includes("norn-foundation"), "no foundation bucket");
	for (const { file, text } of stylesheets.filter(({ file }) => file.startsWith("webc-patterns/"))) {
		assert.ok(!text.includes("norn.tokens"), `${file}: no tokens layer`);
		assert.ok(!/^\s*--norn-[\w-]+\s*:/m.test(text), `${file}: no custom property is declared`);
	}
});

test("norn-head's default theme colors are the page surface from tokens.json, one per scheme", async () => {
	const surface = readTokens().find((token) => token.path === "surface.base").resolved;
	const [, light, dark] = surface.match(/^light-dark\((\S+), (\S+)\)$/);
	const html = await render('<html><head><meta webc:is="norn-head" webc:nokeep @title="T" /></head><body></body></html>', { helpers: { getBundleFileUrl: () => "/bundle" } });
	assert.ok(html.includes(`<meta name="theme-color" content="${light}" media="(prefers-color-scheme: light)">`), `light: ${light}`);
	assert.ok(html.includes(`<meta name="theme-color" content="${dark}" media="(prefers-color-scheme: dark)">`), `dark: ${dark}`);
});

test("the shipped stylesheets each sit in one layer: reset in norn.reset, base in norn.base, print in norn.print", () => {
	for (const [name, layer] of [["reset", "norn.reset"], ["base", "norn.base"], ["print", "norn.print"]]) {
		const text = stylesheets.find(({ file }) => file === `webc-patterns/css/${name}.css`).text.replace(/\/\*[\s\S]*?\*\//g, "").trim();
		assert.ok(text.startsWith(`@layer ${layer} {`) && text.endsWith("}"), `${name}.css is wrapped in @layer ${layer}`);
		assert.equal((text.match(/@layer /g) ?? []).length, 1, `${name}.css opens one layer`);
	}
});

test("the baseline tokens are in tokens.json, each with the value the components expect", () => {
	const expected = {
		"ui.border.strong": "light-dark(#7a8194, #6f7789)",
		"ui.focus.width": "2px",
		"ui.focus.offset": "2px",
		"ui.state.hover": "8%",
		"ui.state.press": "12%",
		"ui.radius.s": "4px",
		"ui.motion.duration": "150ms",
		"ui.motion.easing": "cubic-bezier(0.2, 0, 0, 1)",
		"ui.control.height": "2.25rem",
		"ui.icon.s": "1em",
		"ui.icon.m": "1.25rem",
		"status.info": "light-dark(#1b4fc4, #8fb0ff)",
		"status.success": "light-dark(#0b6b3a, #7ed6a1)",
		"status.warning": "light-dark(#9a4a00, #ffb36b)",
		"status.danger": "light-dark(#b42318, #ff8a80)",
		"font.size.s": "0.875rem",
		"font.size.m": "1rem",
		"font.size.l": "1.25rem",
		"font.size.xl": "1.5rem",
		"space.2xs": "0.25rem",
		"layout.width": "64rem",
	};
	for (const [tokenPath, value] of Object.entries(expected)) assert.equal(byPath.get(tokenPath)?.resolved, value, tokenPath);
	for (const tokenPath of ["ui.accent", "ui.border.color", "ui.border.radius", "ui.shadow", "space.xs", "space.s", "space.m", "space.l", "space.xl"]) assert.ok(byPath.has(tokenPath), `${tokenPath} stays`);
});

test("the dark raised and code surfaces step up from the page by at least 1.25:1, the light values are unchanged, and the text on them reads at AA", () => {
	const hex = (value) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
	const luminance = (color) => {
		const [r, g, b] = color.map((channel) => ((channel /= 255) <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const ratio = (a, b) => {
		const [high, low] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
		return (high + 0.05) / (low + 0.05);
	};
	const pair = (tokenPath) => byPath.get(tokenPath).resolved.match(/^light-dark\((.+?), (#[0-9a-f]{6})\)$/);
	const dark = (tokenPath) => pair(tokenPath)[2];
	assert.equal(pair("surface.raised")[1], "hsl(40, 14%, 96%)", "light raised is as it was");
	assert.equal(pair("surface.code")[1], "hsl(40, 14%, 94%)", "light code is as it was");
	assert.equal(pair("surface.base")[1], "#ffffff");
	assert.ok(ratio(dark("surface.raised"), dark("surface.base")) >= 1.25, `raised on base ${ratio(dark("surface.raised"), dark("surface.base")).toFixed(2)}:1`);
	assert.ok(ratio(dark("surface.code"), dark("surface.base")) >= 1.25, "code on base");
	for (const name of ["text.base", "text.muted"]) assert.ok(ratio(dark(name), dark("surface.raised")) >= 4.5, `${name} on raised`);
	for (const name of ["text.base", "text.muted", "code.comment", "code.string", "code.keyword", "code.function", "code.number", "code.flag"]) assert.ok(ratio(dark(name), dark("surface.code")) >= 4.5, `${name} on code`);
});

/**
 * Block-axis margins that stay, each with the reason a gap or a padding can't do the work. Spacing between siblings is a gap on the parent.
 * The key is the source file and the property.
 */
const BLOCK_MARGINS = {
	"webc-code-sample/src/norn-code-block.webc|margin": "the copy button's inset from the corner of the code it overlays, not a space between siblings",
	"webc-oss-site/src/oss-cta.webc|margin": "the space above the call to action: the cta hook renders it with no wrapper that could carry a gap",
	"webc-patterns/src/norn-accordion.webc|margin-block": "the space below a panel inside a native details, whose content has no box a gap could belong to without ::details-content",
	"webc-patterns/src/norn-card-grid.webc|margin-block-end": "the subgrid rows have no gap, so a card with no footer leaves no blank space, and the space between cards is a margin taken back from the end of the list",
	"webc-patterns/src/norn-card.webc|margin-block-end": "the same subgrid rows: a gap would leave blank space under a card with no footer",
	"webc-patterns/src/norn-code-tabs.webc|margin-block-end": "a negative margin that lays the tab's line over the rule below it",
	"webc-patterns/src/norn-notice.webc|margin-block-start": "centers the icon on the first line of text",
	"webc-patterns/src/norn-rich-text.webc|margin": "headings in arbitrary Markdown HTML take space above, on top of the flow's gap",
	"webc-patterns/src/norn-rich-text.webc|margin-block-start": "the same space above a heading anchor, which zeroes its heading's margin",
	"webc-patterns/src/norn-side-nav.webc|margin": "a negative margin that keeps focus rings inside the scroll box",
	"webc-patterns/src/norn-sidebar-layout.webc|margin-block-end": "the space under a folded summary: a gap would show while the details is closed",
	"webc-patterns/src/norn-toc.webc|margin-block-end": "the space under a folded title: a gap would show while the details is closed",
	"webc-patterns/src/layouts/norn-base.webc|margin-block-start": "the page, not the footer, owns the space above the footer",
};

/** The values of a CSS declaration, split on spaces outside parentheses. */
const cssValues = (value) => {
	const out = [];
	let depth = 0;
	let current = "";
	for (const character of value.trim()) {
		if (character === "(") depth++;
		if (character === ")") depth--;
		if (/\s/.test(character) && depth === 0) {
			if (current) out.push(current);
			current = "";
		} else current += character;
	}
	if (current) out.push(current);
	return out;
};

test("sources space siblings with a gap: no block margin outside a short list of named exceptions, and no owl selector", () => {
	const found = new Set();
	const problems = [];
	for (const { file, text } of sources) {
		const css = styles(withoutDocs(text), file).replace(/\/\*[\s\S]*?\*\//g, "");
		for (const [, property, raw] of css.matchAll(/(?<![\w-])(margin(?:-block(?:-start|-end)?|-top|-bottom)?)\s*:\s*([^;}]+)[;}]/g)) {
			const values = cssValues(raw);
			let block;
			if (["margin-block-start", "margin-block-end", "margin-top", "margin-bottom"].includes(property)) block = [values[0]];
			else if (property === "margin-block") block = values.slice(0, 2);
			else block = values.length < 3 ? [values[0]] : [values[0], values[2]];
			if (block.every((value) => value === "0" || value === "auto")) continue;
			found.add(`${file}|${property}`);
			if (!BLOCK_MARGINS[`${file}|${property}`]) problems.push(`${file}: ${property}: ${raw.trim()}`);
		}
		for (const [, selector] of css.matchAll(/^[ \t]*([^@\n{}][^\n{}]*)\{/gm)) if (/\s\+\s|\*\s*\+\s*\*/.test(selector)) problems.push(`${file}: owl selector \`${selector.trim()}\``);
	}
	assert.deepEqual(problems, [], "space siblings with a gap on the parent, or add the reason to BLOCK_MARGINS");
	assert.deepEqual(Object.keys(BLOCK_MARGINS).filter((key) => !found.has(key)), [], "an exception that no longer applies is removed from BLOCK_MARGINS");
});

test("the base styles draw one focus ring from the focus tokens, with no narrower exception, and one body line height", () => {
	const base = squash(stylesheets.find(({ file }) => file === "webc-patterns/css/base.css").text);
	assert.ok(base.includes("outline: var(--norn-ui-focus-width, 2px) solid var(--norn-text-accent,"), "the ring reads the width token");
	assert.ok(base.includes("outline-offset: var(--norn-ui-focus-offset, 2px)"), "and the offset token");
	assert.ok(!/outline-width/.test(base), "no ring of another width");
	assert.equal([...base.matchAll(/line-height: ([\d.]+)/g)].map(([, value]) => value).join(" "), "1.5 1.15", "the body 1.5, the headings 1.15, and no other");
	assert.ok(!/(^|[ }])p \{/.test(base), "the paragraph takes the body's line height");
});

test("norn-notice keeps the status recipe, a tint and a 3px bar, while norn-callout is a quiet raised panel with an eyebrow label", () => {
	const [callout, notice] = ["norn-callout", "norn-notice"].map((name) => squash(styles(sources.find(({ file }) => file === `webc-patterns/src/${name}.webc`).text)));
	assert.ok(!/light-dark\(#/.test(notice), "norn-notice: no hard-coded color pair");
	assert.ok(notice.includes("border-inline-start: 3px solid var(--_color)"), "norn-notice: the bar");
	assert.ok(notice.includes("background: color-mix(in oklab, var(--_color) 8%, var(--norn-surface-base,"), "norn-notice: the tint");
	assert.ok(notice.includes("--_color: var(--norn-status-info, t('status.info'))") && !notice.includes("--norn-notice-"), "norn-notice: each severity sets the private --_color, with no property of its own");
	assert.ok(!/border: |border-inline-start-width|border-color/.test(notice.replace(/@media \(forced-colors: active\) \{.*$/, "")), "norn-notice: no other border");
	for (const status of ["info", "success", "warning", "danger"]) assert.ok(notice.includes(`t('status.${status}')`), `norn-notice reads status.${status}`);
	const screen = callout.replace(/\/\*.*?\*\//g, "").replace(/@media print \{.*$/, "").replace(/@media \(forced-colors: active\) \{.*?\} \}/, "");
	assert.ok(!screen.includes("3px"), "norn-callout: no bar");
	assert.ok(!/color-mix\(/.test(screen), "norn-callout: no tint");
	assert.ok(!/(?:^|[;{ ])border(?!-radius)[a-z-]*:/.test(screen), "norn-callout: no border");
	assert.ok(callout.includes("background: var(--norn-surface-raised, t('surface.raised'))"), "norn-callout: the raised fill");
	assert.ok(callout.includes("--_color: var(--norn-text-accent, t('text.accent'))") && !callout.includes("--norn-callout-"), "norn-callout: each variant sets the private --_color, with no property of its own");
	assert.ok(/text-transform: uppercase/.test(callout) && callout.includes("font-size: var(--norn-font-size-s, t('font.size.s'))") && callout.includes("font-weight: 600"), "norn-callout: the eyebrow label");
	assert.ok(callout.includes("font-size: var(--norn-font-size-l, t('font.size.l'))"), "norn-callout: the body at the large step");
	assert.ok(callout.includes("--norn-text-accent, t('text.accent')") && !callout.includes("#6b2fc2"), "note and important take the accent");
	for (const status of ["success", "warning", "danger"]) assert.ok(callout.includes(`t('status.${status}')`), `norn-callout reads status.${status}`);
});

/** A source's CSS, squashed, by component name. */
const cssOf = (name) => squash(styles(sources.find(({ file }) => file.endsWith(`/${name}.webc`)).text));

test("a component that exposes no custom property of its own reads only global tokens and private --_ names", () => {
	for (const name of ["norn-pager", "norn-skip-link", "norn-search", "norn-segmented-control", "norn-callout", "norn-link-button", "norn-notice"]) {
		const css = cssOf(name);
		assert.ok(!css.includes(`--${name}-`), `${name}: no --${name}-* property`);
		for (const [, property] of css.matchAll(/var\((--norn-[\w-]+)/g)) assert.ok(byName.has(property), `${name}: ${property} is a global token`);
	}
	assert.ok(cssOf("norn-pager").includes("color: var(--norn-text-accent, t('text.accent'))"), "norn-pager: links in the accent text color");
	const skip = cssOf("norn-skip-link");
	assert.ok(skip.includes("border-radius: var(--norn-ui-border-radius, t('ui.border.radius'))") && skip.includes("background: var(--norn-surface-raised, t('surface.raised'))") && skip.includes("color: var(--norn-text-base, t('text.base'))"), "norn-skip-link: the radius, the raised fill, and the base text");
	assert.ok(cssOf("norn-search").includes("background: var(--norn-surface-base, t('surface.base'))"), "norn-search: the field on the page surface");
	const segmented = cssOf("norn-segmented-control");
	assert.ok(segmented.includes("background: var(--norn-surface-raised, t('surface.raised'))") && segmented.includes("calc(var(--norn-ui-border-radius, t('ui.border.radius')) - var(--_gap))"), "norn-segmented-control: the raised track and the nested radius");
});

test("norn-segmented-control draws no thumb, counts no options, and fills its checked option itself in forced colors", () => {
	const css = cssOf("norn-segmented-control");
	assert.ok(!/::before|::after/.test(css), "no pseudo-element");
	assert.ok(!/--_(index|count)|translate|nth-of-type/.test(css), "no thumb math, so no cap on the options");
	assert.ok(!/outline: 3px/.test(css) && css.includes("outline: var(--norn-ui-focus-width,"), "the one ring, inset");
	const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
	assert.match(forced, /label:has\(input:checked\) \{ background-color: Highlight; color: HighlightText; forced-color-adjust: none;/, "the label itself is filled");
	assert.ok(css.includes("--_current: var(--norn-text-accent, t('text.accent'))") && !/thumb|--norn-segmented-control-/.test(css), "the accent tint replaces the thumb and the border");
});

test("norn-link-button has primary, secondary, and quiet, and any other value is primary", async () => {
	for (const [variant, expected] of [["primary", "primary"], ["secondary", "secondary"], ["quiet", "quiet"], ["outline", "primary"], [undefined, "primary"]]) {
		const html = await render(`<norn-link-button @href="/" ${variant ? `@variant="${variant}"` : ""}>Go</norn-link-button>`);
		assert.ok(html.includes(`<a href="/" data-variant="${expected}">Go</a>`), `${variant}: ${html}`);
	}
	const css = cssOf("norn-link-button");
	assert.ok(!/text-decoration: underline/.test(css), "no underline on hover or focus");
	assert.ok(css.includes("border: 1px solid var(--_border)") && css.includes("border-radius: var(--norn-ui-border-radius, t('ui.border.radius'))"), "a 1px edge and the component radius");
	assert.ok(css.includes("--_bg: var(--norn-ui-accent, t('ui.accent')); color: var(--norn-text-on-accent, t('text.on-accent'));"), "primary reads the accent tokens");
	assert.ok(!/outline-width/.test(css), "the ring is the base ring");
	assert.match(css, /a\[data-variant="primary"\] \{ border-color: LinkText; background-color: LinkText; color: Canvas; forced-color-adjust: none;/, "primary stays filled in forced colors");
	assert.ok(css.includes("&:active"), "a pressed state");
});

test("norn-link-button takes @tone=\"current\" for the surrounding text color, and any other value keeps the accent", async () => {
	assert.ok((await render('<norn-link-button @href="/" @variant="quiet" @tone="current">Go</norn-link-button>')).includes('<a href="/" data-variant="quiet" data-tone="current">Go</a>'));
	for (const tone of ["accent", "inherit", ""]) assert.ok((await render(`<norn-link-button @href="/" @tone="${tone}">Go</norn-link-button>`)).includes('<a href="/" data-variant="primary">Go</a>'), tone);
	const css = cssOf("norn-link-button");
	assert.ok(css.indexOf('& a[data-tone="current"] { color: inherit; }') > css.indexOf("& a[data-variant] {") && css.indexOf('& a[data-tone="current"]') < css.indexOf('& a[data-variant="primary"]'), "after the base rule, and before primary, which keeps its text");
});

test("norn-copy-button has no border, stacks its icons and texts in one cell, and swaps to a check tinted with the success color", async () => {
	const css = cssOf("norn-copy-button");
	assert.ok(!/border: 1px|--norn-copy-button-border/.test(css), "no border");
	assert.ok(css.includes("--norn-status-success") && css.includes('[data-state="copied"]'), "the success tint");
	const html = unid(await render('<norn-copy-button @value="x"></norn-copy-button>'));
	assert.ok(html.includes("<span data-icons><norn-icon") && (html.match(/<svg /g) ?? []).length === 2, "the copy icon and the check");
	assert.ok(html.includes("data-label"), "one holder for the texts");
	assert.ok(!html.includes("data-compact"), "not compact by default");
	assert.ok(unid(await render('<norn-copy-button @value="x" @compact></norn-copy-button>')).includes("data-compact"), "compact when asked");
});

test("norn-copy-button reads the shared tokens and takes its fill as a surface prop, with no custom property of its own", async () => {
	const css = cssOf("norn-copy-button");
	assert.ok(!/--norn-copy-button-/.test(css), "no --norn-copy-button-* property");
	assert.ok(css.includes("border-radius: var(--norn-ui-border-radius, t('ui.border.radius'));") && css.includes("color: var(--norn-text-muted, t('text.muted'));"), "the radius and text tokens");
	assert.ok(css.includes("background-color: color-mix(in oklab, currentcolor var(--_state), var(--_bg, transparent));"), "no fill by default");
	for (const surface of ["base", "raised", "code"]) {
		assert.ok(css.includes(`&[data-surface="${surface}"] { --_bg: var(--norn-surface-${surface}, t('surface.${surface}')); }`), `${surface} fills from its token`);
		assert.ok((await render(`<norn-copy-button @value="x" @surface="${surface}"></norn-copy-button>`)).includes(`data-surface="${surface}"`), surface);
	}
	assert.ok(!(await render('<norn-copy-button @value="x"></norn-copy-button>')).includes("data-surface"), "none by default");
	assert.ok(!(await render('<norn-copy-button @value="x" @surface="red"></norn-copy-button>')).includes("data-surface"), "an unknown surface is ignored");
	assert.ok((await render('<norn-code-block @language="js" @code="x"></norn-code-block>')).includes('data-surface="code"'), "a code block's button sits on the code surface");
	assert.ok(!cssOf("norn-code-block").includes("--norn-copy-button"), "set by the prop, not a custom property");
});

test("norn-code-block overlays a compact copy button, and its terminal frame is flat, with no dots, no shadow, and no border", async () => {
	const css = cssOf("norn-code-block");
	assert.ok(!/border: 1px|--norn-code-block-border|radial-gradient|box-shadow|--norn-code-block-(dot|shadow)|::before/.test(css), "no border, dots, or shadow");
	assert.ok(css.includes('& figure:where([data-chrome="terminal"]) > figcaption {'), "the frame is still there for whoever asks for it");
	assert.ok(css.includes("block-size: 2rem"), "a 2rem header");
	assert.match(css, /norn-copy-button \{[^}]*grid-area: 2 \/ 1;[^}]*justify-self: end;[^}]*align-self: start;/, "over the top end corner of the code");
	assert.ok(unid(await render('<norn-code-block @language="js" @code="x"></norn-code-block>')).includes("<norn-copy-button"), "the button is still part of the sample");
	assert.ok((await render('<norn-code-block @language="js" @code="x"></norn-code-block>')).includes("data-compact"), "and compact");
	assert.ok(!cssOf("norn-hero").includes("--norn-chrome"), "a hero no longer turns the frame on");
});

test("norn-code-block reads the shared tokens, and its terminal frame is a prop, not an inherited custom property", async () => {
	const css = cssOf("norn-code-block");
	assert.ok(!/--norn-code-block-|--norn-chrome|@container style/.test(css), "no --norn-code-block-* property and no mode flag");
	for (const read of ["background: var(--norn-surface-code, t('surface.code'));", "color: var(--norn-text-base, t('text.base'));", "font-family: var(--norn-font-mono, t('font.mono'));", "padding: var(--norn-space-m, t('space.m'));", "border-radius: var(--norn-ui-border-radius, t('ui.border.radius'));"]) assert.ok(css.includes(read), read);
	assert.ok((await render('<norn-code-block @chrome="terminal" @language="sh" @code="x"></norn-code-block>')).includes('<figure data-chrome="terminal">'), "the prop marks the frame");
	assert.ok(!(await render('<norn-code-block @language="sh" @code="x"></norn-code-block>')).includes("data-chrome"), "no frame by default");
	assert.ok(!(await render('<norn-code-block @chrome="window" @language="sh" @code="x"></norn-code-block>')).includes("data-chrome"), "nor for an unknown value");
	assert.ok(!(await render('<div style="--norn-chrome: terminal"><norn-code-block @language="sh" @code="x"></norn-code-block></div>')).includes("data-chrome"), "an ancestor's custom property does nothing");
	assert.match(css, /& figure:where\(\[data-chrome="terminal"\]\), & figure:where\(\[data-chrome="terminal"\]\):has\(> figcaption\) \{ overflow: hidden; row-gap: 0;/, "the frame clips its corners and closes the gap");
	assert.ok(css.indexOf('figure:where([data-chrome="terminal"]):has(> figcaption)') > css.indexOf("& figure:has(> figcaption) {"), "after the plain caption gap, at the same specificity");
});

test("norn-search has a field edge from the strong border, a leading magnifier, and floating results on the raised surface with the shadow and no border", async () => {
	const css = cssOf("norn-search");
	assert.ok(css.includes("border: 1px solid var(--norn-ui-border-strong, t('ui.border.strong'))"), "the field's edge is 3:1");
	const results = css.match(/& ol \{[^}]*\}/)[0];
	assert.ok(results.includes("box-shadow: var(--norn-ui-shadow,"), "the results float on a shadow");
	assert.ok(!/border:/.test(results), "and have no border");
	assert.ok(results.includes("background: var(--norn-surface-raised, t('surface.raised'))"), "on the raised surface");
	const html = unid(await render("<norn-search></norn-search>"));
	assert.match(html, /<label>\s*<span>[^]*?<\/span>\s*<norn-icon>[^]*?<\/norn-icon>\s*<input type="search"/, "the magnifier is in the label, before the field");
});

test("no source draws a focus ring of its own: a ring reads the focus tokens, and the rest only move it or turn it off", () => {
	for (const { file, text } of sources) {
		for (const [, property, value] of styles(text, file).matchAll(/\boutline(-width)?\s*:\s*([^;]+);/g)) {
			assert.ok(/^var\(--norn-ui-focus-width,/.test(value) || value.trim() === "none", `${file}: outline${property ?? ""}: ${value}`);
		}
	}
});

test("type sizes come from the scale: no source sets a font size in rem outside a clamp", () => {
	for (const { file, text } of sources) {
		if (file === "webc-oss-site/src/css/brand.css") continue; // The brand's own sizes, such as the footer name at 1.2rem.
		for (const [, value] of styles(text, file).matchAll(/font-size:\s*([^;]+);/g)) {
			assert.ok(!/\d(\.\d+)?rem/.test(value) || value.startsWith("clamp(") || value.startsWith("var(--norn-font-size-"), `${file}: font-size: ${value}`);
		}
	}
});

test("norn-card has a fill and no band, border, or underline at rest, and its heading link covers the card", async () => {
	const css = cssOf("norn-card");
	assert.ok(!/::before/.test(css), "no band");
	assert.ok(!/border: 1px|--norn-card-border/.test(css.replace(/@media \(forced-colors: active\) \{.*$/, "")), "no border, but in forced colors, which drop the fill");
	assert.ok(css.includes("--_accent: initial;") && css.includes("border-block-start: 2px solid var(--_accent);"), "an accent draws a 2px line, and none draws nothing");
	assert.ok(css.includes("&::after { content: \"\"; position: absolute; inset: 0; }"), "the link reaches over the card");
	assert.ok(css.includes("&:has(a:hover)") && css.includes("&:has(a:focus-visible)"), "the card takes the hover layer and the ring");
	assert.match(css, /a \{ color: var\(--norn-text-accent, [^;]+; text-decoration: none;/, "no underline at rest");
	const grid = cssOf("norn-card-grid");
	assert.ok(!/ActiveText|VisitedText|GrayText|accent|feature/.test(grid + sources.find(({ file }) => file.endsWith("/norn-card-grid.webc")).text), "no accent cycle and no system color");
});

test("norn-card takes its accent and title face as props, mapped to global tokens, and reads no custom property of its own", async () => {
	const css = cssOf("norn-card");
	assert.ok(!/--norn-card-/.test(css), "no --norn-card-* custom property");
	assert.ok(!/@container style/.test(css), "no inherited mode flag");
	const accents = { accent: "--norn-ui-accent", info: "--norn-status-info", success: "--norn-status-success", warning: "--norn-status-warning", danger: "--norn-status-danger" };
	for (const [value, token] of Object.entries(accents)) {
		assert.ok(css.includes(`&[data-accent="${value}"] { --_accent: var(${token}, `), `${value} maps to ${token}`);
		assert.ok((await render(`<norn-card @accent="${value}"><h3>T</h3></norn-card>`)).includes(`<article data-accent="${value}">`), `@accent="${value}" renders`);
	}
	for (const value of ["none", "red", ""]) assert.ok((await render(`<norn-card @accent="${value}"><h3>T</h3></norn-card>`)).includes("<article><h3>"), `@accent="${value}" draws no line`);
	assert.ok((await render("<norn-card><h3>T</h3></norn-card>")).includes("<article><h3>"), "no accent by default");
	assert.ok((await render('<norn-card @title-face="mono"><h3>T</h3></norn-card>')).includes('<article data-title-face="mono">'), "the mono title face");
	assert.ok(css.includes('& > article[data-title-face="mono"] > :is(h2, h3, h4, h5, h6),'), "the mono face styles the heading");
	assert.ok(css.includes("& > article { --_state: 0%; --_accent: initial;") && css.includes("grid-template-rows: inherit;"), "the article takes the rows of its tag");
	const grid = cssOf("norn-card-grid");
	assert.ok(grid.includes("& > ul > li > norn-card { grid-template-rows: subgrid; }"), "a card grid gives each card subgrid rows");
	assert.ok(!/--norn-card-(?!grid-)/.test(grid + sources.find(({ file }) => file.endsWith("/norn-card-grid.webc")).text), "the card grid sets no card custom property");
	assert.ok(!(await render("<norn-card-grid @mono><li><norn-card><h3>T</h3></norn-card></li></norn-card-grid>")).includes("style="), "the grid has no mono prop");
});

test("norn-card-grid takes its gap from the space scale and its narrowest card as props", async () => {
	const css = cssOf("norn-card-grid");
	assert.ok(!/--norn-card-grid-/.test(css), "no --norn-card-grid-* custom property");
	assert.ok(css.includes("--_gap: var(--norn-space-m, t('space.m'));") && css.includes("gap: var(--_gap);"), "m by default");
	for (const step of ["s", "l"]) {
		assert.ok(css.includes(`& > ul[data-gap="${step}"] { --_gap: var(--norn-space-${step}, t('space.${step}')); }`), `${step} maps to --norn-space-${step}`);
		assert.ok((await render(`<norn-card-grid @gap="${step}"><li>A</li></norn-card-grid>`)).includes(`<ul role="list" data-gap="${step}">`), `@gap="${step}" renders`);
	}
	for (const step of ["m", "xl", ""]) assert.ok((await render(`<norn-card-grid @gap="${step}"><li>A</li></norn-card-grid>`)).includes('<ul role="list">'), `@gap="${step}" is the default`);
	assert.ok(css.includes("minmax(min(100%, var(--_min, 17rem)), 1fr)"), "17rem by default");
	assert.ok((await render('<norn-card-grid @min="12rem"><li>A</li></norn-card-grid>')).includes('<ul role="list" style="--_min: 12rem">'), "@min sets the private minimum");
	assert.ok((await render("<norn-card-grid><li>A</li></norn-card-grid>")).includes('<ul role="list">'), "no style without @min");
});

test("norn-hero takes its width as a prop, from the layout width or the measure, and its tagline from the shared accent", async () => {
	const css = cssOf("norn-hero");
	assert.ok(!/--norn-hero-/.test(css), "no --norn-hero-* custom property");
	assert.ok(css.includes("--_width: var(--norn-layout-width, t('layout.width'));") && css.includes('& > header[data-width="measure"] { --_width: var(--norn-text-measure, t(\'text.measure\')); }'), "layout, or the measure");
	assert.ok(css.includes("color: var(--norn-text-accent, t('text.accent'));"), "the tagline");
	assert.ok((await render('<norn-hero @width="measure"><h1>A</h1></norn-hero>')).includes('<header data-width="measure">'), "@width=\"measure\" renders");
	for (const value of ["layout", "wide"]) assert.ok((await render(`<norn-hero @width="${value}"><h1>A</h1></norn-hero>`)).includes("<header><h1>"), `@width="${value}" is the layout width`);
});

test("norn-rich-text takes its measure as a prop, and its rules and code fill from shared tokens", async () => {
	const css = cssOf("norn-rich-text");
	assert.ok(!/--norn-rich-text-/.test(css), "no --norn-rich-text-* custom property");
	assert.ok(css.includes("max-inline-size: var(--norn-text-measure, t('text.measure')); &[data-measure=\"none\"] { max-inline-size: none; }"), "the measure, or none");
	assert.equal((css.match(/solid var\(--norn-ui-border-color, t\('ui\.border\.color'\)\)/g) ?? []).length, 4, "the quote bar and the rules");
	assert.ok(css.includes("background: var(--norn-surface-code, t('surface.code'));"), "inline code");
	assert.ok((await render('<norn-rich-text @measure="none" id="a"><p>A</p></norn-rich-text>')).includes('<norn-rich-text data-measure="none" id="a"><p>A</p></norn-rich-text>'), "@measure=\"none\" renders on the tag, beside its attributes");
	assert.ok((await render('<norn-rich-text id="a"><p>A</p></norn-rich-text>')).includes('<norn-rich-text id="a"><p>A</p></norn-rich-text>'), "the measure by default");
	for (const name of ["norn-docs", "norn-workspace"]) assert.ok(sources.find(({ file }) => file.endsWith(`/layouts/${name}.webc`)).text.includes('<norn-rich-text @measure="none"'), `${name} lets its prose take the column`);
	assert.ok(!/--norn-rich-text-/.test(sources.find(({ file }) => file.endsWith("/layouts/norn-base.webc")).text), "norn-base sets no rich-text property");
});

test("norn-simple-table reads its rules and its surface from shared tokens, and has no custom property of its own", () => {
	const css = cssOf("norn-simple-table");
	assert.ok(!/--norn-simple-table-/.test(css), "no --norn-simple-table-* custom property");
	assert.ok(css.includes("--_bg: var(--norn-surface-base, t('surface.base'));"), "the shadows' surface");
	assert.equal((css.match(/solid var\(--norn-ui-border-color, t\('ui\.border\.color'\)\)/g) ?? []).length, 2, "the row rules");
	assert.ok(!/thead \{/.test(css), "no header fill");
});

test("the build script runs when it is started through a symlinked path", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "norn-link-"));
	try {
		fs.symlinkSync(path.join(import.meta.dirname, "scripts"), path.join(root, "scripts"), "junction");
		const output = execFileSync(process.execPath, [path.join(root, "scripts", "build-components.js"), "webc-code-sample"], { encoding: "utf8" });
		assert.match(output, /^webc-code-sample: 1 components$/m, "the package is built and reported");
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("norn-rich-text holds only its @scope rules, with no @supports copy", () => {
	const source = sources.find(({ file }) => file.endsWith("/norn-rich-text.webc")).text;
	assert.ok(!/@supports/.test(styles(source).replace(/\/\*[\s\S]*?\*\//g, "")), "the source holds only the @scope");
	assert.ok(!/@supports/.test(styles(components.find(({ file }) => file.endsWith("/norn-rich-text.webc")).text)), "the build adds no copy");
});

test("one heading anchor recipe: norn-heading-anchor draws the # and styles its link, and norn-rich-text keeps no copy", () => {
	const rich = styles(sources.find(({ file }) => file.endsWith("/norn-rich-text.webc")).text).replace(/\/\*[\s\S]*?\*\//g, "");
	assert.ok(!/::before|>\s*a\b/.test(rich), "norn-rich-text has no rule for the mark or the heading link");
	const anchor = styles(sources.find(({ file }) => file.endsWith("/norn-heading-anchor.webc")).text);
	assert.ok(anchor.includes("color: var(--norn-text-muted, t('text.muted'));") && !/--norn-heading-anchor-/.test(anchor), "the # takes the shared muted color, with no custom property of its own");
});

test("::highlight() rules sit on the element that holds the text, which Firefox needs", () => {
	const bare = sources.flatMap(({ file, text }) => styles(text).replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]*::highlight\([^)]*\)\s*\{/g)?.map((rule) => [file, rule.trim()]) ?? []).filter(([, rule]) => !/(^|\s)code::highlight\(/.test(rule));
	assert.deepEqual(bare, [], "write `& code::highlight(name)`: an ancestor's ::highlight() is ignored by Firefox");
});

test("the docs layouts share one title rule in norn-base, and norn-docs-home lists its contents with no rules between them", () => {
	for (const name of ["norn-docs", "norn-workspace"]) assert.ok(!/h1|--norn-rich-text-measure/.test(squash(styles(sources.find(({ file }) => file.endsWith(`/layouts/${name}.webc`)).text))), `${name} sets no title rule`);
	assert.equal((squash(styles(sources.find(({ file }) => file.endsWith("/layouts/norn-base.webc")).text)).match(/article > h1 \{/g) ?? []).length, 1, "norn-base holds the title rule");
	const home = squash(styles(sources.find(({ file }) => file.endsWith("/layouts/norn-docs-home.webc")).text));
	assert.ok(!/border-block-end|padding-block-end/.test(home), "no rule per item");
	assert.ok(home.includes("gap: var(--norn-space-s,") && home.includes("dt a { text-decoration: none; &::after { content: \"\"; position: absolute; inset: 0;"), "a gap, and a link that fills its row");
});

test("norn-header folds its links into a closed details with a summary from the slot, the registry, then English", async () => {
	const html = unid(await render('<norn-header><a href="/">Home</a></norn-header>'));
	assert.ok(/<details>\s*<summary><span>Menu<\/span><\/summary>\s*<nav /.test(html) || html.includes("<summary>Menu</summary>"), "the links are inside a closed details");
	assert.ok(unid(await render('<norn-header><span slot="summary">Pages</span><a href="/">Home</a></norn-header>')).includes("<summary><span>Pages</span></summary>"), "the slot");
	assert.ok(unid(await render('<norn-header><a href="/">Home</a></norn-header>', { strings: { "norn-header": { summary: "Navigation" } } })).includes("<summary>Navigation</summary>"), "the registry");
	assert.equal(defaultStrings["norn-header"].summary, "Menu");
});

test("norn-header reads the shared tokens and no custom property of its own, and sizes a logo by its logo-height prop", async () => {
	const css = styles(sources.find(({ file }) => file === "webc-patterns/src/norn-header.webc").text);
	assert.ok(!/--norn-header-/.test(css), "no --norn-header-* property");
	assert.ok(!/&::after \{\s*content: "";\s*position: absolute;/.test(css), "no strip: the OSS site theme draws its own");
	assert.ok(css.includes("background: var(--norn-surface-raised, t('surface.raised'));") && css.includes("block-size: var(--_logo, 2rem);"));
	assert.match(await render('<norn-header @logo-height="3rem"><a slot="brand" rel="home" href="/"><img src="l.svg" alt="L"></a></norn-header>'), /<header style="--_logo: 3rem">/, "the prop sets the logo height");
	assert.match(await render('<norn-header><a slot="brand" rel="home" href="/">Home</a></norn-header>'), /<header>/, "without it, no style");
	assert.match(await render('<norn-header style="--norn-header-logo: 9rem"><a slot="brand" rel="home" href="/">Home</a></norn-header>'), /<header>/, "the old property sets nothing");
});

test("norn-footer reads the shared tokens and no custom property of its own, and takes its widths from props", async () => {
	const css = styles(sources.find(({ file }) => file === "webc-patterns/src/norn-footer.webc").text);
	assert.ok(!/--norn-footer-/.test(css), "no --norn-footer-* property");
	assert.ok(!css.includes("strong:first-of-type"), "no rule for the name: the OSS site theme styles its own");
	assert.ok(css.includes("inline-size: min(100%, var(--_width, var(--norn-layout-width, t('layout.width'))));") && css.includes("grid-template-columns: minmax(0, var(--_lead, 25rem));"));
	assert.match(await render('<norn-footer @width="50rem" @lead-width="20rem"><div><p>A</p></div></norn-footer>'), /<footer style="--_width: 50rem; --_lead: 20rem">/, "both props");
	assert.match(await render('<norn-footer @lead-width="20rem"><div><p>A</p></div></norn-footer>'), /<footer style="--_lead: 20rem">/, "one prop");
	assert.match(await render('<norn-footer style="--norn-footer-width: 9rem"><div><p>A</p></div></norn-footer>'), /<footer>/, "without them, no style, and the old property sets nothing");
});

test("norn-sidebar-layout folds its navigation into a closed details with a summary from the slot, the registry, then English", async () => {
	const html = unid(await render("<norn-sidebar-layout><norn-side-nav slot=\"nav\" :@items=\"[]\"></norn-side-nav><h1>T</h1></norn-sidebar-layout>"));
	assert.match(html, /<details>\s*<summary>Menu<\/summary>\s*<norn-side-nav/, "closed, and named in English");
	assert.ok(unid(await render("<norn-sidebar-layout><span slot=\"summary\">Pages</span></norn-sidebar-layout>")).includes("<summary><span>Pages</span></summary>"), "the slot");
	assert.ok(unid(await render("<norn-sidebar-layout></norn-sidebar-layout>", { strings: { "norn-sidebar-layout": { summary: "Navigation" } } })).includes("<summary>Navigation</summary>"), "the registry");
	assert.equal(defaultStrings["norn-sidebar-layout"].summary, "Menu");
});

test("norn-sidebar-layout reads the shared tokens and no custom property of its own, and takes its column width, gap, and body columns from props", async () => {
	const css = styles(sources.find(({ file }) => file === "webc-patterns/src/norn-sidebar-layout.webc").text);
	assert.ok(!/--norn-sidebar-layout-/.test(css), "no --norn-sidebar-layout-* property");
	assert.ok(css.includes("inline-size: min(100% - 2 * var(--norn-space-m, t('space.m')), var(--norn-layout-width, t('layout.width')));"), "the width is the layout token");
	assert.ok(css.includes("grid-template-columns: var(--_nav, 14rem) minmax(0, 1fr);") && css.includes("grid-template-columns: var(--_columns, minmax(0, 1fr));"));
	for (const step of ["s", "m", "xl"]) assert.ok(squash(css).includes(`&[data-gap="${step}"] { gap: var(--norn-space-${step}, t('space.${step}')); }`), step);
	const html = await render('<norn-sidebar-layout @nav-width="10rem" @gap="s" @columns="minmax(0, 1fr) 10rem"><h1>T</h1></norn-sidebar-layout>');
	assert.match(html, /<norn-sidebar-layout><div data-gap="s" style="--_nav: 10rem; --_columns: minmax\(0, 1fr\) 10rem">/, "the props");
	assert.match(await render('<norn-sidebar-layout @gap="huge"><h1>T</h1></norn-sidebar-layout>'), /<norn-sidebar-layout><div>/, "an unknown gap, and no other prop, leave the div bare");
	assert.match(await render('<norn-sidebar-layout style="--norn-sidebar-layout-nav: 9rem"><h1>T</h1></norn-sidebar-layout>'), /<div>/, "the old property sets nothing");
	const docs = squash(styles(sources.find(({ file }) => file.endsWith("/layouts/norn-docs.webc")).text));
	assert.ok(docs.includes("norn-sidebar-layout > div > article:has(> norn-toc > nav) { grid-auto-columns: 12rem; }") && !docs.includes("--norn-sidebar-layout"), "norn-docs puts its contents in an implicit column");
});

test("norn-side-nav reads the shared text tokens and no custom property of its own", () => {
	const css = styles(sources.find(({ file }) => file === "webc-patterns/src/norn-side-nav.webc").text);
	assert.ok(!/--norn-side-nav-/.test(css), "no --norn-side-nav-* property");
	assert.ok(css.includes("color: var(--norn-text-muted, t('text.muted'));") && css.includes("--_tint: color-mix(in oklab, var(--norn-text-accent, t('text.accent')) var(--norn-ui-state-press, t('ui.state.press')), transparent);"));
});

test("norn-breadcrumbs reads the shared text tokens and no custom property of its own", () => {
	const css = squash(styles(sources.find(({ file }) => file === "webc-patterns/src/norn-breadcrumbs.webc").text));
	assert.ok(!/--norn-breadcrumbs-/.test(css), "no --norn-breadcrumbs-* property");
	assert.ok(css.includes("& nav > ol > li > norn-icon { color: var(--norn-text-muted, t('text.muted')); }") && css.includes("color: var(--norn-text-muted, t('text.muted')); text-decoration: none;"));
});

test("norn-toc folds under its title through a details, and the title names the landmark", async () => {
	const html = unid(await render("<norn-toc :@items=\"[{ id: 'a', text: 'A', level: 2 }, { id: 'b', text: 'B', level: 2 }]\"></norn-toc>"));
	assert.match(html, /<nav>\s*<details>\s*<summary><span>On this page<\/span><\/summary>\s*<ol><li><a href="#a">/);
});

test("norn-toc reads the shared text tokens, folds by its fold prop, and reads no custom property of its own", async () => {
	const css = squash(styles(sources.find(({ file }) => file === "webc-patterns/src/norn-toc.webc").text));
	assert.ok(!/--norn-toc-/.test(css), "no --norn-toc-* property, inherited or not");
	assert.ok(css.includes('& > nav[data-fold="always"] { --_folded: on; }') && css.includes('@container (width < 60rem) { & > nav[data-fold="narrow"] { --_folded: on; } }') && css.includes("@container style(--_folded: on) {"));
	const items = "[{ id: 'a', text: 'A', level: 2 }, { id: 'b', text: 'B', level: 2 }]";
	for (const fold of ["always", "narrow"]) assert.match(unid(await render(`<norn-toc :@items="${items}" @fold="${fold}"></norn-toc>`)), new RegExp(`<nav data-fold="${fold}">`), fold);
	assert.match(unid(await render(`<norn-toc :@items="${items}" @fold="sometimes"></norn-toc>`)), /<nav>/, "an unknown value never folds");
	assert.match(unid(await render(`<norn-toc :@items="${items}" style="--norn-toc-fold: on"></norn-toc>`)), /<nav>/, "the old property sets nothing");
	const docs = sources.find(({ file }) => file.endsWith("/layouts/norn-docs.webc")).text;
	assert.ok(docs.includes('@fold="narrow"') && !docs.includes("--norn-toc-fold"), "norn-docs passes the prop");
});

test("the docs never name a token with a stray number after it", () => {
	for (const { file } of components) assert.ok(!/--norn-[a-z0-9-]+\.\d/.test(docsOf(file).text), `${file}: a token name runs into a decimal`);
});

const CATEGORIES = ["layout", "landmark", "container", "component", "template", "document"];

test("every component and layout names its category: the first part of its CSF title", () => {
	for (const { file } of [...components, ...layouts, ...fallbacks]) {
		const { category } = docsOf(file);
		assert.ok(CATEGORIES.includes(category), `${file}: the category is one of ${CATEGORIES.join(", ")}`);
	}
});

/** The license header alone: a source's one server-only comment. */
const LICENSE_COMMENT = "<!---\n/*\n * SPDX-License-Identifier: MPL-2.0\n * This Source Code Form is subject to the terms of the Mozilla Public\n * License, v. 2.0. If a copy of the MPL was not distributed with this\n * file, You can obtain one at https://mozilla.org/MPL/2.0/.\n */\n--->";

test("every component and layout keeps its license header alone in one server-only comment, and its setup block holds only code", () => {
	for (const { file, text } of sources.filter(({ file }) => file.endsWith(".webc"))) {
		const comments = text.match(SERVER_COMMENT) ?? [];
		assert.equal(comments.length, 1, `${file}: one <!--- … ---> comment`);
		assert.equal(comments[0], LICENSE_COMMENT, `${file}: the comment is the license header alone, and the API lives in the CSF file`);
		for (const [, code] of text.matchAll(/<script webc:setup>([\s\S]*?)<\/script>/g)) {
			assert.ok(code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").trim() !== "", `${file}: a webc:setup block holds code, not only comments`);
			assert.ok(!code.includes("SPDX-License-Identifier"), `${file}: the license header sits in the top comment`);
		}
		const shipped = [...components, ...layouts, ...fallbacks].find((entry) => entry.file === compiledFrom(file));
		assert.deepEqual(shipped.text.match(SERVER_COMMENT), comments, `${file}: the build keeps the comment as written`);
	}
});

test("a landmark component renders a landmark element, or one that does", () => {
	for (const { file, text } of components) {
		if (docsOf(file).category !== "landmark") continue;
		assert.match(withoutDocs(text), /<(header|nav|footer|norn-header|norn-footer)\b/, `${file} has no landmark in its markup`);
	}
});

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** The component's own element tree, from its markup without scripts and styles. */
function tree(text) {
	const root = { name: "#host", children: [] };
	const stack = [root];
	const markup = withoutDocs(text).replace(/<(script|style)[\s\S]*?<\/\1>/g, "");
	for (const [, close, name, attrs, selfClose] of markup.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*?)(\/?)>/g)) {
		if (close) {
			while (stack.length > 1 && stack.pop().name !== name);
			continue;
		}
		const node = { name, attrs, children: [] };
		stack.at(-1).children.push(node);
		if (!selfClose && !VOID.has(name)) stack.push(node);
	}
	return root;
}

const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);
const holdsSlot = (node) => descendants(node).some((child) => child.name === "slot");
const holdsDefaultSlot = (node) => descendants(node).some((child) => child.name === "slot" && !/\bname=/.test(child.attrs));

/** Split on a separator outside brackets and parentheses. */
function splitTop(value, separator) {
	const parts = [""];
	let depth = 0;
	for (const char of value) {
		if ("([".includes(char)) depth++;
		if (")]".includes(char)) depth--;
		if (depth === 0 && separator.test(char)) parts.push(char);
		else parts[parts.length - 1] += char;
	}
	return parts;
}

/**
 * Every selector in a component's styles, in full: a nested rule is resolved against the rules it sits in, so `norn-x { & a { … } }` yields `norn-x a`.
 * An at-rule block (`@layer`, `@media`, `@scope`, and the like) is looked through.
 */
function selectors(text) {
	const css = styles(text);
	const found = [];
	/** @param {import("css-tree").List} list @param {string[] | null} parents - The full selectors of the rule around this block */
	const visit = (list, parents) => {
		list.forEach((node) => {
			if (node.type === "Atrule" && node.block) visit(node.block.children, parents);
			if (node.type !== "Rule" || node.prelude.type !== "SelectorList") return;
			const full = node.prelude.children.toArray().flatMap((selector) => {
				const raw = css.slice(selector.loc.start.offset, selector.loc.end.offset);
				if (!parents) return [squash(raw)];
				const nesting = [];
				csstree.walk(selector, (child) => child.type === "NestingSelector" && nesting.push(child));
				return parents.map((parent) => {
					if (!nesting.length) return squash(`${parent} ${raw}`);
					let out = "";
					let last = selector.loc.start.offset;
					for (const child of nesting) {
						out += css.slice(last, child.loc.start.offset) + parent;
						last = child.loc.end.offset;
					}
					return squash(out + css.slice(last, selector.loc.end.offset));
				});
			});
			found.push(...full);
			visit(node.block.children, full);
		});
	};
	visit(csstree.parse(css, { positions: true }).children, null);
	return found;
}

/**
 * The step of `selector` that can reach slotted content without `:where()` or a child path, if any.
 * With a default slot, even the first step from the host needs a child path: a descendant of the host also matches the same element in the slotted content.
 */
function leak(selector, root, tag) {
	const steps = splitTop(selector.replace(/\s*([>+~])\s*/g, "$1"), /[\s>+~]/);
	if (!steps[0].startsWith(tag)) return undefined;
	let nodes = [root];
	for (const step of steps.slice(1)) {
		const combinator = /^[>+~]/.test(step) ? step[0] : " ";
		const compound = step.replace(/^[\s>+~]/, "");
		const type = compound.match(/^[a-z][a-z0-9-]*/)?.[0];
		const matches = (node) => !type || node.name === type;
		if (combinator === "+" || combinator === "~") return undefined;
		if (combinator === ">") {
			if (nodes.some((node) => node.children.some((child) => child.name === "slot"))) return undefined;
			nodes = nodes.flatMap((node) => node.children.filter(matches));
		} else if (compound.startsWith(":where(")) {
			return undefined;
		} else if (nodes.length === 1 && nodes[0] === root && holdsDefaultSlot(root)) {
			return compound;
		} else if (nodes.length === 1 && nodes[0] === root && type && root.children.some((child) => child.name === type)) {
			nodes = root.children.filter(matches);
		} else if (nodes.some(holdsSlot)) {
			return compound;
		} else {
			nodes = nodes.flatMap(descendants).filter(matches);
		}
		if (!nodes.length) return undefined;
	}
	return undefined;
}

test("a slot-taking layout, landmark, or container never styles slotted components by element", () => {
	const leaks = [];
	for (const { file, text } of components) {
		if (!["layout", "landmark", "container"].includes(docsOf(file).category)) continue;
		const root = tree(text);
		if (!holdsSlot(root)) continue;
		const tag = path.basename(file, ".webc");
		for (const selector of selectors(text)) {
			const step = leak(selector, root, tag);
			if (step) leaks.push(`${file}: \`${selector}\` reaches slotted content at \`${step}\``);
		}
	}
	assert.deepEqual(leaks, [], "wrap the step in :where(), or scope it to the component's own markup");
});

test("the leak check flags a descendant step from the host to the component's own element when it has a default slot, and passes a child path", () => {
	const treeOf = (name) => tree(components.find(({ file }) => file.endsWith(`/${name}.webc`)).text);
	for (const [name, selector, step] of [
		["norn-card-grid", "norn-card-grid ul", "ul"],
		["norn-card-grid", "norn-card-grid ul > li > *", "ul"],
		["norn-card", "norn-card article", "article"],
		["norn-card", "norn-card article > :is(h2, h3, h4, h5, h6) a", "article"],
		["norn-footer", "norn-footer footer > div:first-child > * > ul", "footer"],
	]) {
		assert.equal(leak(selector, treeOf(name), name), step, selector);
	}
	for (const [name, selector] of [
		["norn-card-grid", "norn-card-grid > ul > li > *"],
		["norn-card", "norn-card > article > :is(h2, h3, h4, h5, h6) a"],
		["norn-footer", "norn-footer > footer > div:first-child > :is(div, nav) > ul"],
		["norn-footer", "norn-footer :where(p)"],
	]) {
		assert.equal(leak(selector, treeOf(name), name), undefined, selector);
	}
});

/**
 * Compile markup with every package component defined, and optionally a `componentStrings` table, a page `lang`, more page data,
 * and, with `codeSample: false`, with the plain `norn-code-block` and without the code sample's helper, as when it is not installed.
 */
async function render(content, { strings, lang, data = {}, codeSample = true, helpers = {} } = {}) {
	const page = new WebC();
	page.setBundlerMode(true);
	page.setHelper("nornCompiles", compiles);
	for (const [name, helper] of Object.entries(helpers)) page.setHelper(name, helper);
	if (codeSample) page.setHelper("nornTokenRanges", tokenRanges);
	if (strings) page.setHelper("nornComponentStrings", componentStrings(strings));
	page.defineComponents(Object.fromEntries([...components, ...(codeSample ? [] : fallbacks)].map(({ file }) => [path.basename(file, ".webc"), path.join(PACKAGES, file)])));
	page.setContent(content);
	return (await page.compile({ data: { page: { lang }, ...data } })).html;
}

/** Markup without its per-instance ids, so a test can compare it. */
const unid = (html) => html.replace(/ (id|aria-labelledby|data-strings)="[^"]*"/g, "");

test("norn-code-block names the code and its copy button in English by default, in hidden text, with no tab stop or name on the code", async () => {
	const html = unid(await render('<norn-code-block @language="js" @code="x"></norn-code-block>'));
	assert.ok(html.includes("<span data-name hidden><span data-default>js code</span></span>"));
	for (const text of ['<span data-string="label">Copy {name} to clipboard</span>', '<span data-string="copy">Copy</span>', '<span data-string="copied">Copied</span>', '<span data-string="failed">Copy failed</span>']) assert.ok(html.includes(text), text);
	assert.ok(html.includes('<pre dir="ltr" data-language="js"><code>'), "no tabindex, role, or name without a script");
	assert.ok(!/aria-label=|data-(copied|failed)=/.test(html));
	assert.ok(unid(await render('<norn-code-block @code="x"></norn-code-block>')).includes("<span data-default>code</span>"), "an empty language leaves no stray space");
});

test("norn-code-block points its copy button at its own texts", async () => {
	const html = await render('<norn-code-block @language="js" @code="x"></norn-code-block>');
	const [, holder] = html.match(/data-strings="([^"]+)"/);
	assert.ok(html.includes(`<span hidden id="${holder}">`));
	assert.ok(html.includes(`<span data-string="label" id="${holder}-copy">`), "the button's name has an id for aria-labelledby");
	assert.equal((html.match(/data-string="copy"/g) ?? []).length, 1, "the button renders no texts of its own");
});

test("norn-code-block takes every string as a slot, and leaves the default mark off the author's label", async () => {
	const slots = '<span slot="label">exemple</span><span slot="copy-label">Copier le {name}</span><span slot="copy">Copier</span><span slot="copied">Copié</span><span slot="failed">Échec</span>';
	const html = unid(await render(`<norn-code-block @language="js" @code="x">${slots}</norn-code-block>`));
	assert.ok(html.includes("<span data-name hidden><span>exemple</span></span>"));
	for (const text of ["<span>Copier le {name}</span>", "<span>Copier</span>", "<span>Copié</span>", "<span>Échec</span>"]) assert.ok(html.includes(text), text);
	assert.ok(!/\b(Copy|Copied|code)\b/.test(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, " ").replace(/\bx\b/, "")));
});

test("norn-accordion reads the shared tokens and slides for a fixed 200ms, with no custom property of its own", () => {
	const css = cssOf("norn-accordion");
	assert.ok(!/--norn-accordion-/.test(css), "no --norn-accordion-* property");
	assert.equal((css.match(/1px solid var\(--norn-ui-border-color, t\('ui\.border\.color'\)\)/g) ?? []).length, 2, "the rules above and below from the hairline token");
	assert.equal((css.match(/2px solid var\(--norn-text-accent, t\('text\.accent'\)\)/g) ?? []).length, 2, "the chevron in the accent text");
	assert.ok(css.includes("transition: rotate 200ms var(--norn-ui-motion-easing, t('ui.motion.easing'));") && css.includes("transition: block-size 200ms var(--norn-ui-motion-easing, t('ui.motion.easing')), content-visibility 200ms allow-discrete;"), "opening and closing take 200ms, as the baseline sets");
});

test("norn-fact-list reads the shared tokens and takes its row gap as a prop, with no custom property of its own", async () => {
	const css = cssOf("norn-fact-list");
	assert.ok(!/--norn-fact-list-/.test(css), "no --norn-fact-list-* property");
	assert.ok(css.includes("gap: var(--norn-space-xs, t('space.xs')) var(--norn-space-m, t('space.m'));"), "xs rows and m facts by default");
	assert.ok(css.includes("color: var(--norn-text-muted, t('text.muted'));") && css.includes("& norn-icon { color: var(--norn-text-accent, t('text.accent')); }"), "the text and icon tokens");
	for (const step of ["s", "m", "l"]) {
		assert.ok(css.includes(`&[data-gap="${step}"] { row-gap: var(--norn-space-${step}, t('space.${step}')); }`), `${step} from its spacing token`);
		assert.ok((await render(`<norn-fact-list @gap="${step}"><li>x</li></norn-fact-list>`)).includes(`<ul role="list" data-gap="${step}">`), step);
	}
	for (const none of ["", ' @gap="xs"', ' @gap="2rem"']) assert.ok((await render(`<norn-fact-list${none}><li>x</li></norn-fact-list>`)).includes('<ul role="list">'), `the default for${none || " no gap"}`);
	assert.ok(!cssOf("norn-hero").includes("--norn-fact-list"), "a hero no longer sets the gap");
	const landing = fs.readFileSync(path.join(PACKAGES, "webc-patterns/src/layouts/norn-landing.webc"), "utf8");
	assert.ok(landing.includes('<norn-fact-list @gap="l">'), "the landing hero passes the gap");
});

test("norn-code-tabs reads the shared tokens, with no custom property of its own, and its samples take the terminal frame as their own prop", async () => {
	const css = cssOf("norn-code-tabs");
	assert.ok(!/--norn-code-tabs-/.test(css), "no --norn-code-tabs-* property");
	assert.ok(css.includes("border-block-end: 1px solid var(--norn-ui-border-color, t('ui.border.color'));"), "the rule from the hairline token");
	assert.match(css, /&\[aria-selected="true"\] \{ border-block-end-color: var\(--norn-text-accent, t\('text\.accent'\)\); color: var\(--norn-text-accent, t\('text\.accent'\)\);/, "the selected tab in the accent text");
	const html = await render('<norn-code-tabs><norn-code-block @chrome="terminal" @language="sh" @code="a"></norn-code-block><norn-code-block @chrome="terminal" @language="sh" @code="b"></norn-code-block></norn-code-tabs>');
	assert.equal((html.match(/<figure data-chrome="terminal">/g) ?? []).length, 2, "each sample frames itself");
});

test("norn-code-tabs holds its tab list name and fallback tab name as hidden text, in English or from its slots", async () => {
	const html = unid(await render("<norn-code-tabs></norn-code-tabs>"));
	assert.ok(html.includes('<span data-string="label">Code samples</span>') && html.includes('<span data-string="sample">Sample {n}</span>'));
	const own = unid(await render('<norn-code-tabs><span slot="label">Commandes</span><span slot="sample">Exemple {n}</span></norn-code-tabs>'));
	assert.ok(own.includes('<span data-string="label"><span>Commandes</span></span>') && own.includes('<span data-string="sample"><span>Exemple {n}</span></span>'));
	assert.ok(!/data-(label|sample)=/.test(html + own));
});

/** Each component's documented slot names: its CSF slot argTypes. */
const slotsOf = (file) => docsOf(file).slots;

test("defaultStrings lists every string a component or layout looks up, with the default it falls back to", () => {
	const looked = new Set();
	/** A component may fall back to another's strings only where it renders that one's texts itself. */
	const BORROWS = { "norn-code-block": ["norn-copy-button"] };
	for (const { file, text } of components) {
		const name = path.basename(file, ".webc");
		for (const [, component, key] of text.matchAll(/nornComponentStrings\?\.\('([a-z-]+)', '([a-z-]+)', \$data\.page\)/g)) {
			assert.ok(component === name || BORROWS[name]?.includes(component), `${file} looks up another component's strings`);
			assert.ok(Object.hasOwn(defaultStrings[component] ?? {}, key), `${file}: ${component}.${key} is missing from defaultStrings`);
			looked.add(`${component}.${key}`);
		}
	}
	for (const { file, text } of layouts) {
		const name = path.basename(file, ".webc");
		for (const [, owner, key] of text.matchAll(/nornComponentStrings\?\.\('([a-z-]+)', '([a-z-]+)', \$data\.page\)/g)) {
			assert.equal(owner, name, `${file} looks up another layout's strings`);
			assert.ok(Object.hasOwn(defaultStrings[owner] ?? {}, key), `${file}: ${owner}.${key} is missing from defaultStrings`);
			looked.add(`${owner}.${key}`);
		}
	}
	for (const [component, keys] of Object.entries(defaultStrings)) {
		const text = [...components, ...layouts].find(({ file }) => path.basename(file, ".webc") === component)?.text;
		assert.ok(text?.includes(`nornComponentStrings?.('${component}', `), `${component} never looks up its strings`);
		for (const [key, value] of Object.entries(keys)) {
			if (value !== null) assert.ok(text.includes(value.replace(/: $/, "")), `${component}.${key}: the component's own default is not "${value}"`);
			if (!["norn-callout", "norn-notice"].includes(component)) assert.ok(looked.has(`${component}.${key}`), `${component}.${key} is never looked up`);
		}
	}
});

test("every component string is a named slot with the registry as its fallback, and none is a prop", () => {
	const SLOT_OF = { "norn-callout": "heading", "norn-notice": "prefix" };
	for (const [component, keys] of Object.entries(defaultStrings).filter(([name]) => !LAYOUTS.includes(name))) {
		const { file, text } = components.find(({ file }) => path.basename(file, ".webc") === component);
		const slots = slotsOf(file);
		for (const key of Object.keys(keys)) {
			const slot = SLOT_OF[component] ?? key;
			assert.ok(slots.has(slot), `${component}: the ${slot} slot is not documented`);
			assert.ok(!docsOf(file).props.has(slot), `${component}: ${slot} is still a prop`);
			const pattern = new RegExp(`<slot name="${slot}">(?:(?!</slot>)[\\s\\S])*nornComponentStrings\\?\\.\\('${component}', ${SLOT_OF[component] ? "" : `'${key}'`}`);
			assert.match(text, pattern, `${component}: the ${slot} slot falls back to the registry`);
		}
	}
	for (const { file, text } of components) {
		const documented = slotsOf(file);
		for (const [, name] of withoutDocs(text).matchAll(/<slot name="([a-z-]+)"/g)) assert.ok(documented.has(name), `${file}: <slot name="${name}"> is not documented`);
	}
	// A component with no registry entry still takes no prop named like one of its slots.
	for (const file of sourceFiles()) {
		const { props, slots } = analyzeFile(file);
		const names = new Set(props.map(({ name }) => name));
		for (const { name } of slots) assert.ok(!names.has(name), `${path.relative(PACKAGES, file)}: ${name} is a slot and a prop`);
	}
});

test("norn-segmented-control takes its group's name from the legend slot only, and fails the build without one", async () => {
	const { props, slots } = analyzeFile(path.join(PACKAGES, "webc-patterns/src/norn-segmented-control.webc"));
	assert.deepEqual(props.map(({ name }) => name).sort(), ["icon-only", "name", "options"]);
	assert.deepEqual(slots.map(({ name }) => name).sort(), ["default", "legend"]);
	const options = ":@options=\"[{ value: 'a', label: 'A' }]\"";
	assert.ok((await render(`<norn-segmented-control @name="s" ${options}><span slot="legend">Size</span></norn-segmented-control>`)).includes("<legend><span>Size</span></legend>"));
	await assert.rejects(render(`<norn-segmented-control @name="s" ${options}></norn-segmented-control>`), /norn-segmented-control: .*`legend` slot/);
	await assert.rejects(render('<norn-segmented-control @legend="Size"><label><input type="radio" name="s" value="a" /><span>A</span></label></norn-segmented-control>'), /norn-segmented-control: .*`legend` slot/, "the old prop names nothing");
	const toggle = await render("<norn-theme-toggle></norn-theme-toggle>");
	assert.ok(toggle.includes("<legend><span>Color scheme</span></legend>"), "the theme toggle names its group in the page");
	assert.ok((await render("<norn-theme-toggle></norn-theme-toggle>", { strings: FRENCH })).includes("<legend><span>Thème</span></legend>"), "from the registry");
});

test("no component writes a string into an aria-label or a data attribute for its script", () => {
	for (const { file, text } of components) {
		const markup = withoutDocs(text).replace(/<(script|style)[\s\S]*?<\/\1>/g, "");
		assert.ok(!/:aria-label="[^"]*nornComponentStrings/.test(markup), `${file}: an accessible name in an attribute`);
		assert.ok(!/:data-[a-z-]+="[^"]*nornComponentStrings/.test(markup), `${file}: a script string in a data attribute`);
	}
});

const FRENCH = {
	"norn-toc": { label: "Sur cette page" },
	"norn-search": { label: "Rechercher", none: "Aucun résultat", "results-one": "{count} résultat", "results-other": "{count} résultats" },
	"norn-callout": { tip: "Astuce" },
	"norn-notice": { warning: "Attention : " },
	"norn-code-block": { label: "code {language}", "copy-label": "Copier le {name}" },
	"norn-copy-button": { copy: "Copier", copied: "Copié", failed: "Échec" },
	"norn-theme-toggle": { label: "Thème", light: "Clair", system: "Système", dark: "Sombre" },
	"norn-skip-link": { label: "Aller au contenu" },
	"norn-header": { label: "Principal" },
};

test("componentStrings fills every component's slot fallbacks from one table", async () => {
	const strings = FRENCH;
	const items = "[{ id: 'a', text: 'A', level: 2 }, { id: 'b', text: 'B', level: 2 }]";
	const toc = await render(`<norn-toc :@items="${items}"></norn-toc>`, { strings });
	const [, tocId] = toc.match(/<nav aria-labelledby="([^"]+)">/);
	assert.ok(toc.includes(`<span id="${tocId}">Sur cette page</span>`), "the title names the landmark");
	const search = unid(await render("<norn-search></norn-search>", { strings }));
	assert.ok(search.includes("<span>Rechercher</span>") && search.includes('<span data-string="none">Aucun résultat</span>'));
	assert.ok(search.includes('<span data-string="results-one">{count} résultat</span>') && search.includes('<span data-string="results-other">{count} résultats</span>'));
	assert.match(await render('<norn-callout @variant="tip"><p>x</p></norn-callout>', { strings }), /<span>Astuce<\/span>/);
	assert.ok((await render('<norn-notice @severity="warning"><p>x</p></norn-notice>', { strings })).includes("<span data-prefix>Attention : </span>"));
	const code = unid(await render('<norn-code-block @language="js" @code="x"></norn-code-block>', { strings }));
	assert.ok(code.includes("<span data-default>code js</span>") && code.includes('<span data-string="label">Copier le {name}</span>'));
	assert.ok(code.includes('<span data-string="copy">Copier</span>') && code.includes('<span data-string="copied">Copié</span>') && code.includes('<span data-string="failed">Échec</span>'));
	const toggle = await render("<norn-theme-toggle></norn-theme-toggle>", { strings });
	for (const text of ['<span data-string="label">Thème</span>', '<span data-string="light">Clair</span>', '<span data-string="system">Système</span>', '<span data-string="dark">Sombre</span>']) assert.ok(toggle.includes(text), text);
	assert.ok((await render("<norn-skip-link></norn-skip-link>", { strings })).includes(">Aller au contenu</a>"));
	assert.ok(unid(await render("<norn-header></norn-header>", { strings })).includes("<span data-label>Principal</span>"));
});

test("a string comes from the slot, else the registry, else the English default", async () => {
	const slot = '<span slot="label">Sauter</span>';
	assert.ok((await render(`<norn-skip-link>${slot}</norn-skip-link>`, { strings: FRENCH })).includes("><span>Sauter</span></a>"), "the slot wins over the registry");
	assert.ok((await render("<norn-skip-link></norn-skip-link>", { strings: FRENCH })).includes(">Aller au contenu</a>"), "the registry fills an empty slot");
	assert.ok((await render("<norn-skip-link></norn-skip-link>")).includes(">Skip to content</a>"), "no helper registered");
	assert.ok(unid(await render("<norn-breadcrumbs :@items=\"[{ url: '/', title: 'Accueil' }]\"></norn-breadcrumbs>", { strings: FRENCH })).includes("<span data-label>Breadcrumb</span>"), "a string the table leaves out keeps the English default");
	const notice = await render('<norn-notice @severity="danger"><span slot="prefix">Erreur : </span><p>x</p></norn-notice>', { strings: FRENCH });
	assert.ok(notice.includes("<span data-prefix><span>Erreur : </span></span>"));
	const callout = await render('<norn-callout @variant="tip"><span slot="heading">Conseil</span><p>x</p></norn-callout>', { strings: FRENCH });
	assert.ok(callout.includes("<span>Conseil</span></p>") && !callout.includes("Astuce"));
	const strings = { "norn-skip-link": { label: "Skip ahead" }, fr: { "norn-skip-link": { label: "Aller au contenu" } }, de: { "norn-skip-link": { label: "Zum Inhalt" } } };
	assert.ok((await render("<norn-skip-link></norn-skip-link>", { strings, lang: "fr-CA" })).includes(">Aller au contenu</a>"));
	assert.ok((await render("<norn-skip-link></norn-skip-link>", { strings, lang: "de" })).includes(">Zum Inhalt</a>"));
	assert.ok((await render("<norn-skip-link></norn-skip-link>", { strings, lang: "es" })).includes(">Skip ahead</a>"));
});

test("norn-notice names its severities after the status tokens: danger, not error", async () => {
	const danger = await render('<norn-notice @severity="danger" :@live="true"><p>x</p></norn-notice>');
	assert.ok(danger.includes('data-severity="danger"') && danger.includes('role="alert"'), "danger interrupts");
	assert.ok(danger.includes("<span data-prefix>Error: </span>"), "the visitor still reads Error");
	const own = await render('<norn-notice @severity="danger"><p>x</p></norn-notice>', { strings: { "norn-notice": { danger: "Erreur : " } } });
	assert.ok(own.includes("<span data-prefix>Erreur : </span>"), "the registry's danger text");
	const css = squash(styles(sources.find(({ file }) => file === "webc-patterns/src/norn-notice.webc").text));
	assert.ok(css.includes("&:has(> [data-severity=\"danger\"]) { --_color: var(--norn-status-danger, t('status.danger'));"), "the danger recipe");
	assert.ok(!css.includes('[data-severity="error"]'), "no error selector");
	const unknown = await render('<norn-notice @severity="bogus" :@live="true"><p>x</p></norn-notice>');
	assert.ok(unknown.includes('data-severity="info"') && unknown.includes('role="status"') && unknown.includes("<span data-prefix>Note: </span>"), "an unknown severity reads as info");
	assert.equal(await render('<norn-notice @severity="error" :@live="true"><p>x</p></norn-notice>'), unknown, "error is unknown now");
	assert.equal(defaultStrings["norn-notice"].danger, "Error: ");
	assert.ok(!Object.hasOwn(defaultStrings["norn-notice"], "error"), "the registry has no error key");
	assert.throws(() => componentStrings({ "norn-notice": { error: "Erreur : " } }), /norn-notice has no string "error"/);
});

test("an author's line break inside a tag leaves a named slot's fallback in place", async () => {
	assert.ok((await render("<norn-skip-link>\n</norn-skip-link>")).includes('<a href="#main">Skip to content</a>'));
	assert.ok(unid(await render("<norn-header>\n\t<a href=\"/\">Home</a>\n</norn-header>")).includes("<span data-label>Primary</span>"));
	assert.ok(unid(await render("<norn-copy-button @value=\"x\">\n</norn-copy-button>")).includes('<span data-string="copy">Copy</span>'));
	assert.match(await render('<norn-callout @variant="warning">\n\t<p>x</p>\n</norn-callout>'), /<span>Warning<\/span><\/p>/);
	const search = unid(await render("<norn-search>\n</norn-search>"));
	assert.ok(search.includes('<span data-string="results-other">{count} results</span>') && search.includes('<span data-string="results-one">{count} result</span>'));
});

test("norn-search leaves results-one empty when the registry sets only results-other, so the script uses that", async () => {
	const html = unid(await render("<norn-search></norn-search>", { strings: { "norn-search": { "results-other": "{count} 件" } } }));
	assert.ok(html.includes('<span data-string="results-one"></span>') && html.includes('<span data-string="results-other">{count} 件</span>'));
});

/** Project icons as the plugin hands them to norn-icon: a stroke icon, a filled one, and a directional one. */
const PROJECT_ICONS = {
	ring: { viewBox: "0 0 32 32", body: '<g fill="none" stroke="currentColor" stroke-width="3"><circle cx="16" cy="16" r="8"/></g>', mirror: false },
	solid: { viewBox: "0 0 20 20", body: '<path fill="currentColor" d="M2 2h16v16H2z"/>', mirror: false },
	"arrow-end": { viewBox: "0 0 20 20", body: '<path fill="currentColor" d="M2 8h10V4l6 6l-6 6v-4H2z"/>', mirror: true },
};

test("norn-icon draws a project icon with its own viewBox and paint, hidden from assistive tech, and marks it as a project icon", async () => {
	const helpers = { nornIcons: () => PROJECT_ICONS };
	const stroke = await render('<norn-icon @name="ring"><span slot="label">Ring</span></norn-icon>', { helpers });
	assert.ok(stroke.includes('<svg viewBox="0 0 32 32" aria-hidden="true" data-project>'));
	assert.ok(stroke.includes('<g fill="none" stroke="currentColor" stroke-width="3"><circle cx="16" cy="16" r="8"/></g>'));
	assert.match(stroke, /<\/svg>\s*<span>Ring<\/span>/, "the label still follows the drawing");
	const filled = await render('<norn-icon @name="solid"></norn-icon>', { helpers });
	assert.ok(filled.includes('<svg viewBox="0 0 20 20" aria-hidden="true" data-project>') && filled.includes('<path fill="currentColor" d="M2 2h16v16H2z"/>'));
	assert.ok(!/<path d=|data-fill|data-mirror/.test(stroke + filled), "no built-in path, and no mirror unless asked");
});

test("norn-icon mirrors a project icon only when it is set to mirror", async () => {
	const helpers = { nornIcons: () => PROJECT_ICONS };
	assert.ok(!(await render('<norn-icon @name="solid"></norn-icon>', { helpers })).includes("data-mirror"));
	assert.ok((await render('<norn-icon @name="arrow-end"></norn-icon>', { helpers })).includes('<svg viewBox="0 0 20 20" aria-hidden="true" data-mirror data-project>'));
});

test("a project icon with a built-in's name replaces it, and the other built-ins stay", async () => {
	const helpers = { nornIcons: () => PROJECT_ICONS };
	const replaced = await render('<norn-icon @name="arrow-end"></norn-icon>', { helpers });
	assert.ok(replaced.includes("M2 8h10V4l6 6l-6 6v-4H2z") && !replaced.includes("M5 12h14M13 6l6 6l-6 6"));
	const kept = await render('<norn-icon @name="check"></norn-icon>', { helpers });
	assert.ok(kept.includes('<svg viewBox="0 0 24 24" aria-hidden="true">') && kept.includes('<path d="M5 12l5 5L20 7"></path>') && !kept.includes("data-project"));
});

test("norn-icon without the plugin draws the built-in icons, and an unknown name lists the built-in and project names", async () => {
	const alone = await render('<norn-icon @name="arrow-end"></norn-icon>');
	assert.ok(alone.includes('<svg viewBox="0 0 24 24" aria-hidden="true" data-mirror>'));
	await assert.rejects(render('<norn-icon @name="ring"></norn-icon>'), /no icon named "ring". Built-in: accessibility, arrow-end[^]*warning. Project: none/);
	await assert.rejects(render('<norn-icon @name="nope"></norn-icon>', { helpers: { nornIcons: () => PROJECT_ICONS } }), /no icon named "nope". Built-in: accessibility[^]*Project: ring, solid, arrow-end/);
});

test("norn-icon takes its size as a prop mapped to the icon tokens, with no custom property of its own", async () => {
	const css = cssOf("norn-icon");
	assert.ok(!/--norn-icon-/.test(css), "no --norn-icon-* property");
	assert.match(css, /& svg \{ inline-size: var\(--norn-ui-icon-s, t\('ui\.icon\.s'\)\); block-size: var\(--norn-ui-icon-s, t\('ui\.icon\.s'\)\);/, "s by default");
	assert.match(css, /&\[data-size="m"\] \{ inline-size: var\(--norn-ui-icon-m, t\('ui\.icon\.m'\)\); block-size: var\(--norn-ui-icon-m, t\('ui\.icon\.m'\)\); \}/, "m from the title token");
	assert.ok(css.includes("stroke-width: 2;"), "a fixed line weight");
	assert.ok(!(await render('<norn-icon @name="check"></norn-icon>')).includes("data-size"), "no size attribute by default");
	assert.ok(!(await render('<norn-icon @name="check" @size="s"></norn-icon>')).includes("data-size"), "none for s either");
	assert.ok((await render('<norn-icon @name="check" @size="m"></norn-icon>')).includes('<svg viewBox="0 0 24 24" aria-hidden="true" data-size="m">'), "m on a built-in icon");
	assert.ok((await render('<norn-icon @name="solid" @size="m"></norn-icon>', { helpers: { nornIcons: () => PROJECT_ICONS } })).includes('aria-hidden="true" data-size="m" data-project>'), "and on a project icon");
	await assert.rejects(render('<norn-icon @name="check" @size="xl"></norn-icon>'), /norn-icon: no size "xl". Sizes: s, m/);
	for (const name of ["norn-notice", "norn-segmented-control"]) assert.ok(!cssOf(name).includes("--norn-icon-size"), `${name} passes the size as a prop`);
	assert.ok((await render('<norn-notice @severity="warning">x</norn-notice>')).includes('data-size="m"'), "a notice's icon is at the title size");
	assert.ok((await render("<norn-segmented-control @name=\"s\" :@options=\"[{ value: 'a', label: 'A', icon: 'sun' }]\"><span slot=\"legend\">S</span></norn-segmented-control>")).includes('data-size="m"'), "and an option's icon");
});

test("norn-icon styles the stroke on built-in icons only, so a project icon keeps its own paint", () => {
	const css = styles(components.find(({ file }) => file === "webc-patterns/components/norn-icon.webc").text);
	assert.match(squash(css), /&:not\(\[data-project\]\) \{ fill: none; stroke: currentcolor;/);
	assert.match(squash(css), /&\[data-project\] \{ fill: currentcolor; \}/);
});

test("a component reads uid between the same two slots or components, so its ids and references agree", () => {
	// WebC hands the uid of each component it meets, slotted ones included, to the component around it.
	for (const { file, text } of components) {
		const markup = withoutDocs(text).replace(/<(script|style)[\s\S]*?<\/\1>/g, "");
		const segments = markup.split(/(?=<slot\b|<(?:norn|oss)-[a-z-]+\b)/).filter((part) => /\buid\b/.test(part));
		assert.ok(segments.length <= 1, `${file}: uid is read on both sides of a slot or a component`);
	}
});

test("a labelled landmark points aria-labelledby at its own name, one id per instance", async () => {
	const icon = '<a href="/"><norn-icon @name="book"></norn-icon>Docs</a>';
	const html = await render(`<norn-header>${icon}</norn-header><norn-header>${icon}</norn-header>`);
	const ids = [...html.matchAll(/<nav aria-labelledby="([^"]+)">/g)].map(([, id]) => id);
	assert.equal(ids.length, 2);
	assert.notEqual(ids[0], ids[1]);
	for (const id of ids) assert.ok(html.includes(`<span data-label id="${id}">Primary</span>`));
});

/** A compiled layout's markup, without its front matter. */
const layoutText = (name) => layouts.find(({ file }) => path.basename(file, ".webc") === name).text.replace(/^---\n[\s\S]*?\n---\n/, "");

test("the six layouts ship compiled: norn-base is a whole page, and every other one extends it", () => {
	assert.deepEqual(layouts.map(({ file }) => path.basename(file, ".webc")).sort(), [...LAYOUTS].sort());
	for (const { file, text } of layouts) {
		const name = path.basename(file, ".webc");
		if (name === "norn-base") assert.ok(text.startsWith("<!doctype html>\n<html") && text.trimEnd().endsWith("</html>"), file);
		else assert.ok(text.startsWith("---\nlayout: norn-base.webc\nnornCompiled: true\n---\n<!---\n/*\n * SPDX-License-Identifier: MPL-2.0"), file);
		assert.ok(text.includes("<!---\n/*\n * SPDX-License-Identifier: MPL-2.0"), `${file} carries the license header`);
		assert.ok(!withoutDocs(text).includes("<!--"), `${file} has no HTML comment`);
	}
});

test("norn-base places the four hooks through the nornHook helper, in page order", () => {
	const text = layoutText("norn-base");
	const at = HOOKS.map((name) => text.indexOf(`<template webc:nokeep @html="nornHook('${name}')"></template>`));
	assert.ok(at.every((index) => index > 0), "each hook once");
	assert.deepEqual([...at].sort((a, b) => a - b), at, "head, banner, cta, credit");
	assert.ok(at[0] < text.indexOf("</head>"), "head: in the head");
	assert.ok(text.indexOf("<norn-skip-link>") < at[1] && at[1] < text.indexOf("<norn-header>"), "banner: after the skip link, before the header");
	assert.ok(text.indexOf('<main id="main" tabindex="-1">') < at[2] && at[2] < text.indexOf("</main>"), "cta: closes main");
	assert.ok(text.indexOf("<norn-footer>") < at[3] && at[3] < text.indexOf("</norn-footer>"), "credit: a footer column");
	assert.ok(!/\$data\.\w*[hH]ook/.test(text), "no page data can change a hook");
});

test("norn-base embeds the base and print styles, and no layout reads site or project data", () => {
	const base = layoutText("norn-base");
	assert.ok(base.includes("<style>/* norn: css/base.css */</style>") && base.includes("<style>/* norn: css/print.css */</style>"), "the plugin fills both");
	assert.ok(base.includes('<meta\n\t\t\twebc:is="norn-head"'), "the head, with the layer order first");
	for (const { file, text } of layouts) {
		const reads = new Set([...text.matchAll(/\$data\.(\w+)/g)].map(([, key]) => key));
		assert.deepEqual([...reads].filter((key) => !["norn", "page", "content"].includes(key)), [], `${file} reads only $data.norn, $data.page, and $data.content`);
	}
});

/** Props for the landing layout, every list given. */
const LANDING = { name: "widget", repo: "https://example.com/widget", license: "MIT", node: "24+", install: "npm install widget", usage: { language: "js", code: "let a = 1;", caption: "a.js" }, nav: [], features: [], packages: [], docs: [], workspaces: [], footer: { badges: [], groups: [] } };

test("a layout renders norn-code-block with the code sample, and <pre><code> without it", async () => {
	const withSample = await render(layoutText("norn-landing"), { data: { norn: LANDING } });
	assert.ok(withSample.includes('<norn-code-block id="usage">') && !withSample.includes("<pre><code>"));
	const without = await render(layoutText("norn-landing"), { data: { norn: LANDING }, codeSample: false });
	assert.ok(!without.includes("<norn-code-block"));
	assert.ok(without.includes('<figure id="usage"><pre dir="ltr" data-language="js"><code>let a = 1;</code></pre><figcaption>a.js</figcaption></figure>'), "the usage sample");
	assert.ok(without.includes('<pre dir="ltr" data-language="sh"><code>npm install widget</code></pre>'), "the install section");
	for (const { text } of layouts) assert.ok(!/nornTokenRanges|<pre\b/.test(withoutDocs(text)), "a layout always calls norn-code-block, and never tests for the code sample");
});

// The plugin registers the plain norn-code-block only without the code sample: `<pre><code>`, with no highlighting and no copy button.
test("the plain norn-code-block keeps the code, the id, and the caption, and takes the real one's props and slots", async () => {
	const html = await render('<norn-code-block id="a" @language="html" @code="<p>&amp;</p>" @caption="a.html"><span slot="copy">Copier</span></norn-code-block><norn-code-block id="b" @code="x"></norn-code-block>', { codeSample: false });
	assert.ok(html.includes('<figure id="a"><pre dir="ltr" data-language="html"><code>&lt;p&gt;&amp;&lt;/p&gt;</code></pre><figcaption>a.html</figcaption></figure>'), html);
	assert.ok(html.includes('<pre dir="ltr" id="b"><code>x</code></pre>'), html);
	assert.ok(!html.includes("Copier"), "no copy button, so no copy text");
	const real = docsOf("webc-code-sample/components/norn-code-block.webc");
	const plain = docsOf("webc-patterns/fallback/norn-code-block.webc");
	const sorted = (names) => [...names].sort();
	// Derived from each source. The plain sample takes these and renders none: it has no frame, no script, and no copy button.
	const unrendered = { props: ["chrome"], slots: ["label", "copy-label", "copy", "copied", "failed"] };
	assert.deepEqual(sorted([...plain.props, ...unrendered.props]), sorted(real.props), "the same props");
	assert.deepEqual(sorted([...plain.slots, ...unrendered.slots]), sorted(real.slots), "the same slots");
});

test("a layout takes its texts from componentStrings under its own name, then English", async () => {
	const english = await render(layoutText("norn-landing"), { data: { norn: LANDING } });
	assert.ok(english.includes("<span>License: MIT</span>") && english.includes('data-variant="secondary">View on GitHub</a>') && english.includes('<span id="norn-landing-actions" hidden>Get started</span>'));
	const strings = { "norn-landing": { license: "Licence : {license}", repo: "Voir le dépôt", actions: "Pour commencer" } };
	const french = await render(layoutText("norn-landing"), { data: { norn: LANDING }, strings });
	assert.ok(french.includes("<span>Licence : MIT</span>") && french.includes('data-variant="secondary">Voir le dépôt</a>') && french.includes('<span id="norn-landing-actions" hidden>Pour commencer</span>'));
	assert.ok(!/View on GitHub|License:/.test(french));
});

/** Helpers `norn-head` needs: the bundle links resolve after the render, so a test stands in for them. */
const HEAD_HELPERS = { getBundleFileUrl: () => "/bundle/x" };

test("norn-head renders og:image, og:image:alt, and a large twitter:card when an image is set", async () => {
	const html = await render('<meta webc:is="norn-head" webc:nokeep @title="Docs" @url="https://example.com/docs/" @og-image="https://cdn.example.com/card.png" @og-image-alt="A widget on a desk" />', { helpers: HEAD_HELPERS });
	assert.ok(html.includes('<meta property="og:image" content="https://cdn.example.com/card.png">'));
	assert.ok(html.includes('<meta property="og:image:alt" content="A widget on a desk">'));
	assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
	assert.equal(html.split('name="twitter:card"').length - 1, 1, "one card");
});

test("norn-head without an image renders no image tags and a summary twitter:card", async () => {
	for (const attrs of ['@url="https://example.com/docs/"', '@url="https://example.com/docs/" @og-image=""', '@url="https://example.com/docs/" @og-image-alt="Orphan alt"']) {
		const html = await render(`<meta webc:is="norn-head" webc:nokeep @title="Docs" ${attrs} />`, { helpers: HEAD_HELPERS });
		assert.ok(!html.includes("og:image"), `no og:image: ${attrs}`);
		assert.ok(html.includes('<meta name="twitter:card" content="summary">'), `summary: ${attrs}`);
	}
	const page = await render('<meta webc:is="norn-head" webc:nokeep @title="Docs" />', { helpers: HEAD_HELPERS, data: { ogImage: { src: "/leak.png" } } });
	assert.ok(!page.includes("og:image"), "page data named ogImage is not read");
});

test("norn-head resolves a relative og-image against the canonical url", async () => {
	const head = (image, url = "") => render(`<meta webc:is="norn-head" webc:nokeep @title="Docs" ${url ? `@url="${url}"` : ""} @og-image="${image}" />`, { helpers: HEAD_HELPERS });
	assert.ok((await head("assets/card.png", "https://example.com/project/docs/")).includes('property="og:image" content="https://example.com/project/docs/assets/card.png"'), "relative to the page");
	assert.ok((await head("/assets/card.png", "https://example.com/project/docs/")).includes('property="og:image" content="https://example.com/assets/card.png"'), "root-relative to the origin");
	assert.ok((await head("../card.png", "https://example.com/project/docs/")).includes('property="og:image" content="https://example.com/project/card.png"'), "up a folder");
	assert.ok((await head("https://cdn.example.com/card.png")).includes('content="https://cdn.example.com/card.png"'), "an absolute image needs no url");
});

test("norn-head warns and leaves out the image tags when a relative og-image has no absolute canonical url", async (t) => {
	const warn = t.mock.method(console, "warn", () => {});
	const head = (url = "") => render(`<meta webc:is="norn-head" webc:nokeep @title="Docs" ${url ? `@url="${url}"` : ""} @og-image="assets/card.png" @og-image-alt="A card" />`, { helpers: HEAD_HELPERS });
	for (const [label, url] of [["no url", ""], ["a relative url", "/docs/"]]) {
		warn.mock.resetCalls();
		const html = await head(url);
		assert.equal(warn.mock.callCount(), 1, `one warning: ${label}`);
		const [message] = warn.mock.calls[0].arguments;
		assert.match(message, /^norn-head: og-image "assets\/card.png" is relative/, label);
		assert.match(message, /Pass an absolute og-image or url/, label);
		assert.ok(!html.includes("og:image"), `no og:image or og:image:alt: ${label}`);
		assert.ok(html.includes('<meta name="twitter:card" content="summary">'), `a summary card: ${label}`);
		assert.ok(html.includes("<title>Docs</title>"), `the rest of the head renders: ${label}`);
	}
	warn.mock.resetCalls();
	await render('<meta webc:is="norn-head" webc:nokeep @title="Docs" @url="https://example.com/" @og-image="card.png" />', { helpers: HEAD_HELPERS });
	assert.equal(warn.mock.callCount(), 0, "no warning when the url is absolute");
});

test("norn-base passes ogImage {src, alt} to the head, and a page without one gets no image tags", async () => {
	const base = { name: "widget", title: "Usage", url: "https://example.com/widget/usage/", lang: "en", nav: [], footer: { badges: [], groups: [] } };
	const helpers = { ...HEAD_HELPERS, nornHook: () => "" };
	const html = await render(layoutText("norn-base"), { helpers, data: { content: "", norn: { ...base, ogImage: { src: "img/card.png", alt: "The widget" } } } });
	assert.ok(html.includes('<meta property="og:image" content="https://example.com/widget/usage/img/card.png">'));
	assert.ok(html.includes('<meta property="og:image:alt" content="The widget">'));
	assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
	const noAlt = await render(layoutText("norn-base"), { helpers, data: { content: "", norn: { ...base, ogImage: { src: "img/card.png" } } } });
	assert.ok(noAlt.includes("og:image") && !noAlt.includes("og:image:alt"), "the alt is optional");
	const without = await render(layoutText("norn-base"), { helpers, data: { content: "", norn: base } });
	assert.ok(!without.includes("og:image") && without.includes('<meta name="twitter:card" content="summary">'));
});

test("the server-only comment never reaches the output: a component, a component with a setup block, a container, and a layout", async () => {
	const LEAK = /SPDX|<!--|-->/;
	const base = { name: "widget", title: "Usage", url: "https://example.com/widget/usage/", lang: "en", nav: [], footer: { badges: [], groups: [] } };
	const page = await render(layoutText("norn-base"), { helpers: { ...HEAD_HELPERS, nornHook: () => "" }, data: { content: "", norn: base } });
	assert.ok(page.startsWith("<!doctype html>"), "the doctype stays first");
	for (const [label, html] of [["norn-skip-link", await render("<norn-skip-link></norn-skip-link>")], ["norn-icon", await render('<norn-icon @name="book"></norn-icon>')], ["norn-callout", await render("<norn-callout><p>x</p></norn-callout>")], ["norn-base", page]]) {
		assert.ok(html.length > 0 && !LEAK.test(html), `${label}: no trace of the comment`);
	}
});

/** Props for norn-base with only a title: every list given, as the plugin hands them. */
const BARE = { title: "Only a title", lang: "en", nav: [], features: [], packages: [], docs: [], workspaces: [], footer: { badges: [], groups: [] } };

/** A rendered page frame. */
const frame = (norn, helpers = {}) => render(layoutText("norn-base"), { helpers: { ...HEAD_HELPERS, nornHook: () => "", ...helpers }, data: { content: "", norn: { ...BARE, ...norn } } });

test("norn-base sets dir on html: the direction given, else rtl for a right-to-left language, else ltr", async () => {
	for (const lang of ["ar", "ar-EG", "fa", "he", "ur", "ps", "yi", "dv", "ckb", "ckb-IQ", "sd", "ug", "AR"]) {
		assert.match(await frame({ lang }), new RegExp(`<html lang="${lang}" dir="rtl">`), lang);
	}
	for (const lang of ["en", "fr-CA", "de", "ja", "arn", "hex", "pt-BR"]) assert.match(await frame({ lang }), new RegExp(`<html lang="${lang}" dir="ltr">`), lang);
	assert.match(await frame({ lang: "en", dir: "rtl" }), /<html lang="en" dir="rtl">/, "an explicit dir wins over a left-to-right language");
	assert.match(await frame({ lang: "ar", dir: "ltr" }), /<html lang="ar" dir="ltr">/, "and over a right-to-left one");
	assert.match(await frame({ lang: "en", dir: "auto" }), /<html lang="en" dir="auto">/);
	assert.match(await frame({ lang: "ar", dir: "sideways" }), /<html lang="ar" dir="rtl">/, "a value that is not a direction falls back to the language");
});

test("norn-base applies the one boolean rule to themeToggle: true, an empty string, and 'true' are on, and 'false' is off", async () => {
	const SCRIPT = 'localStorage.getItem("color-scheme")';
	for (const themeToggle of [true, "", "true"]) assert.ok((await frame({ themeToggle })).includes(SCRIPT), `${JSON.stringify(themeToggle)} is on`);
	for (const themeToggle of ["false", false, undefined, "yes", 1]) assert.ok(!(await frame({ themeToggle })).includes(SCRIPT), `${JSON.stringify(themeToggle)} is off`);
});

test("norn-base leaves out the brand link and the footer name without a logo or a name", async () => {
	const bare = await frame({});
	assert.ok(!bare.includes('rel="home"') && !bare.includes("<strong"), "no empty link and no empty name");
	const named = await frame({ name: "Widget" });
	assert.ok(/<a [^>]*rel="home"[^>]*>\s*<span>Widget<\/span>\s*<\/a>/.test(named) && named.includes("<p><strong>Widget</strong></p>"));
	const logo = await frame({ logo: { src: "/logo.svg", alt: "Widget logo" } });
	assert.ok(/<a [^>]*rel="home"[^>]*>\s*<img[^>]*alt="Widget logo"/.test(logo), "a logo alone is enough for the brand link");
	const footer = await frame({ footer: { name: "Footer name", badges: [], groups: [] } });
	assert.ok(footer.includes("<p><strong>Footer name</strong></p>") && !footer.includes('rel="home"'), "the footer name stands alone");
});

test("the hero layouts leave out an empty h1 and an empty action navigation when they have only a title", async () => {
	for (const name of ["norn-landing", "norn-docs-home", "norn-workspaces-home"]) {
		const bare = await render(layoutText(name), { data: { norn: BARE } });
		assert.ok(!bare.includes("<h1") && !bare.includes("<nav") && !bare.includes(`id="${name}-actions"`), `${name}: no h1, no actions`);
		const named = await render(layoutText(name), { data: { norn: { ...BARE, name: "Widget", tagline: "Does things" } } });
		assert.ok(/<h1>\s*<span>Widget<\/span>\s*<span>Does things<\/span>\s*<\/h1>/.test(named) && !named.includes("<nav"), `${name}: the h1 comes with a name`);
		const linked = await render(layoutText(name), { data: { norn: { ...BARE, repo: "https://example.com/widget" } } });
		assert.ok(linked.includes(`<nav aria-labelledby="${name}-actions">`) && linked.includes("View on GitHub"), `${name}: the actions come with a link to show`);
	}
	const install = await render(layoutText("norn-landing"), { data: { norn: { ...BARE, install: "npm install widget" } } });
	assert.ok(install.includes('<nav aria-labelledby="norn-landing-actions">'), "norn-landing: an install command is an action");
});

test("norn-docs calls norn-toc only with two or more headings, and looks up the pager's neighbors once", async () => {
	const docs = [{ url: "/a/", title: "A" }, { url: "/b/", title: "B" }, { url: "/c/", title: "C" }];
	let lookups = 0;
	const helpers = { nornHeadings: headings, nornAdjacent: (...args) => (lookups++, adjacent(...args)), url: (value) => value };
	const page = (content) => render(layoutText("norn-docs"), { helpers, data: { content, page: { url: "/b/" }, norn: { ...LANDING, title: "B", docs } } });
	const heading = (id) => `<h2 id="${id}"><a href="#${id}">${id}</a></h2>`;
	const one = await page(heading("one"));
	assert.ok(!one.includes("<norn-toc"), "one heading: no contents component, so none of its CSS or JS");
	assert.equal(lookups, 1, "one lookup for both pager links");
	assert.ok(one.includes('rel="prev" href="/a/"') && one.includes('rel="next" href="/c/"'), "both neighbors");
	const two = await page(heading("one") + heading("two"));
	assert.ok(two.includes("<norn-toc>") && two.includes('href="#two"'), "two headings: the contents");
});

test("norn-docs searches the host of url, and a url it cannot parse fails the build naming the layout and the prop", async () => {
	const helpers = { nornHeadings: headings, nornAdjacent: adjacent, url: (value) => value };
	const page = (norn) => render(layoutText("norn-docs"), { helpers, data: { content: "", page: { url: "/" }, norn: { ...LANDING, docs: [], ...norn } } });
	assert.ok((await page({ url: "https://example.com/docs/" })).includes('value="example.com"'), "the host of url");
	assert.ok((await page({ url: "https://", search: { site: "example.org" } })).includes('value="example.org"'), "search.site wins, and url is not read");
	assert.ok(!(await page({ url: "/relative/" })).includes('name="sites"'), "no host from a relative url");
	await assert.rejects(page({ url: "https://" }), /norn-docs: `url` "https:\/\/" is not a valid URL/);
});

test("norn-heading-anchor without a slug fails the build and names the component and the prop, even when a slug helper is registered", async () => {
	for (const helpers of [{}, { slug: (text) => String(text).toLowerCase() }]) {
		const label = Object.keys(helpers).length ? "with a slug helper" : "without one";
		await assert.rejects(render("<norn-heading-anchor>Title</norn-heading-anchor>", { helpers }), /norn-heading-anchor: `@slug` is required/, label);
		await assert.rejects(render('<norn-heading-anchor @slug="" @level="3">Title</norn-heading-anchor>', { helpers }), /norn-heading-anchor: `@slug` is required/, `${label}, empty`);
		await assert.rejects(render('<norn-heading-anchor :@slug="42" @level="4">Title</norn-heading-anchor>', { helpers }), /norn-heading-anchor: `@slug` is required/, `${label}, not a string`);
	}
	const html = await render('<norn-heading-anchor @slug="title" @level="3">Title</norn-heading-anchor>', { helpers: { slug: () => "wrong" } });
	assert.ok(html.includes('<h3 id="title"><a href="#title">Title</a></h3>'), "a slug that is passed wins over the helper");
});

test("norn-icon builds its whole svg in one expression, and the markup stays as it was", async () => {
	const markup = withoutDocs(fs.readFileSync(path.join(PACKAGES, "webc-patterns/components/norn-icon.webc"), "utf8")).replace(/<(script|style)[\s\S]*?<\/\1>/g, "");
	const dynamic = [...markup.matchAll(/\s[:@][\w-]+=/g)].map(([attribute]) => attribute.trim());
	assert.ok(dynamic.length <= 2, `the template has ${dynamic.length} dynamic attributes: ${dynamic.join(" ")}`);
	const compact = (html) => html.replace(/\s*\n\s*/g, "").match(/<svg[\s\S]*?<\/svg>/)[0];
	const helpers = { nornIcons: () => PROJECT_ICONS };
	const cases = [
		['<norn-icon @name="check"></norn-icon>', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>'],
		['<norn-icon @name="arrow-start"></norn-icon>', '<svg viewBox="0 0 24 24" aria-hidden="true" data-mirror><path d="M19 12H5M11 6l-6 6l6 6"></path></svg>'],
		['<norn-icon @name="system"></norn-icon>', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0"></path><path d="M12 3a9 9 0 0 1 0 18z" data-fill></path></svg>'],
		['<norn-icon @name="check"><span slot="label">Done</span></norn-icon>', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>'],
		['<norn-icon @name="ring"></norn-icon>', `<svg viewBox="0 0 32 32" aria-hidden="true" data-project>${PROJECT_ICONS.ring.body}</svg>`],
		['<norn-icon @name="solid"></norn-icon>', `<svg viewBox="0 0 20 20" aria-hidden="true" data-project>${PROJECT_ICONS.solid.body}</svg>`],
		['<norn-icon @name="arrow-end"></norn-icon>', `<svg viewBox="0 0 20 20" aria-hidden="true" data-mirror data-project>${PROJECT_ICONS["arrow-end"].body}</svg>`],
	];
	for (const [source, expected] of cases) assert.equal(compact(await render(source, { helpers })), expected, source);
	assert.match(await render('<norn-icon @name="check"><span slot="label">Done</span></norn-icon>'), /<\/svg>\s*<span>Done<\/span>/, "the label follows the drawing");
});

test("norn-toc emits its escaped outline as it is, and heading text with markup stays text", async () => {
	const markup = withoutDocs(components.find(({ file }) => file === "webc-patterns/components/norn-toc.webc").text).replace(/<(script|style)[\s\S]*?<\/\1>/g, "");
	assert.ok(!/\s@html=/.test(markup) && /\s@raw="outline\(items\)"/.test(markup), "@raw, not @html, which would compile the escaped text again");
	const items = JSON.stringify([
		{ id: "a", text: "Use <b>bold</b> & <script>alert(1)</script>", level: 2 },
		{ id: "b", text: 'The "quoted" part', level: 3 },
	]);
	const html = await render(`<norn-toc :@items='${items.replaceAll("'", "&#39;")}'></norn-toc>`);
	assert.ok(html.includes("Use &lt;b&gt;bold&lt;/b&gt; &amp; &lt;script&gt;alert(1)&lt;/script&gt;"), "escaped text");
	assert.ok(!html.includes("<b>") && !html.includes("<script"), "no element from heading text");
	assert.match(html, /<li><a href="#a">[^]*<ol><li><a href="#b">The (?:"|&quot;)quoted(?:"|&quot;) part<\/a><\/li><\/ol><\/li>/, "nested by level");
});

test("a source reads global tokens and private --_ properties only: no custom property of its own", () => {
	const analyzer = { tokens, helpers: helperNames() };
	const found = {};
	for (const file of sourceFiles()) {
		const owned = analyzeFile(file, analyzer).owned.map(({ name }) => name);
		if (owned.length) found[`${/\/fallback\//.test(file) ? "fallback/" : ""}${path.basename(file, ".webc")}`] = owned;
	}
	assert.deepEqual(found, {}, "a component reads a custom property of its own: read a global token from tokens.json, or a private --_ one");
	// The same check catches a source that adds one.
	const bad = analyzeWebc("<p></p><style>x-a { --_c: var(--norn-text-base, red); color: var(--x-a-fg, var(--_c)); }</style>", analyzer).owned.map(({ name }) => name);
	assert.deepEqual(bad, ["--x-a-fg"]);
});
