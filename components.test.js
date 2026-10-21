/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import { WebC } from "@11ty/webc";

import { tokenRanges } from "./packages/webc-code-sample/index.js";
import { componentStrings, defaultStrings } from "./packages/webc-patterns/index.js";
import { HOOKS, LAYOUTS } from "./packages/webc-patterns/plugin.js";
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
const stylesheets = filesIn("css", ".css");

/** The sources everything compiled comes from: components, layouts, and stylesheets. */
const sources = [...filesIn("src"), ...filesIn("src/layouts"), ...filesIn("src/css", ".css")];

/** Every compiled file, by the source it comes from. */
const compiledFrom = (file) => file.replace(/\/src\/layouts\//, "/layouts/").replace(/\/src\/css\//, "/css/").replace(/\/src\//, "/components/");

const squash = (value) => value.replace(/\s+/g, " ").trim();

/** The server-only comment, `<!--- … --->`, which holds a file's license header and JSDoc. WebC drops it at render. */
const SERVER_COMMENT = /<!---[\s\S]*?--->/g;

/** A file's markup, scripts, and styles without its server-only comment, so the JSDoc's examples are not read as markup. */
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
			assert.equal(file, "webc-oss-site/src/css/tokens.css", `${file}: ${name} is set only in the Allons-y Studio brand`);
		}
	}
});

test("every token in tokens.json is read by a component, a layout, or the base styles", () => {
	const all = sources.map(({ file, text }) => styles(text, file)).join("\n");
	for (const { path: tokenPath } of tokens) assert.ok(all.includes(`t('${tokenPath}')`), `${tokenPath} is unused`);
});

test("the compiled components, layouts, and stylesheets keep no t() and no @tokens rule", () => {
	const compiled = [...components, ...layouts, ...stylesheets];
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
	assert.ok(toc.includes("color: var(--norn-toc-link, var(--norn-text-muted, light-dark(#4b5160, #a4abba)));"), "a component token falls back to the shared one");
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

test("the base styles draw one focus ring from the focus tokens, with no narrower exception, and one body line height", () => {
	const base = squash(stylesheets.find(({ file }) => file === "webc-patterns/css/base.css").text);
	assert.ok(base.includes("outline: var(--norn-ui-focus-width, 2px) solid var(--norn-text-accent,"), "the ring reads the width token");
	assert.ok(base.includes("outline-offset: var(--norn-ui-focus-offset, 2px)"), "and the offset token");
	assert.ok(!/outline-width/.test(base), "no ring of another width");
	assert.equal([...base.matchAll(/line-height: ([\d.]+)/g)].map(([, value]) => value).join(" "), "1.5 1.15", "the body 1.5, the headings 1.15, and no other");
	assert.ok(!/(^|[ }])p \{/.test(base), "the paragraph takes the body's line height");
});

test("norn-callout and norn-notice share the status tokens and one recipe: a tint and a 3px bar, with no border on the notice", () => {
	const [callout, notice] = ["norn-callout", "norn-notice"].map((name) => squash(styles(sources.find(({ file }) => file === `webc-patterns/src/${name}.webc`).text)));
	for (const [label, css] of [["norn-callout", callout], ["norn-notice", notice]]) {
		assert.ok(!/light-dark\(#/.test(css), `${label}: no hard-coded color pair`);
		assert.ok(css.includes("border-inline-start: 3px solid var(--_color)"), `${label}: the bar`);
		assert.ok(css.includes("color-mix(in oklab, var(--_color) 8%, var(--norn-surface-base,"), `${label}: the tint`);
		assert.ok(!/border: |border-inline-start-width|border-color/.test(css.replace(/@media \(forced-colors: active\) \{.*$/, "")), `${label}: no other border`);
	}
	for (const status of ["info", "success", "warning", "danger"]) assert.ok(callout.includes(`t('status.${status}')`), `norn-callout reads status.${status}`);
	for (const status of ["info", "success", "warning", "danger"]) assert.ok(notice.includes(`t('status.${status}')`), `norn-notice reads status.${status}`);
	assert.ok(callout.includes("--norn-text-accent, t('text.accent')") && !callout.includes("#6b2fc2"), "important maps to the accent");
});

/** A source's CSS, squashed, by component name. */
const cssOf = (name) => squash(styles(sources.find(({ file }) => file.endsWith(`/${name}.webc`)).text));

test("norn-segmented-control draws no thumb, counts no options, and fills its checked option itself in forced colors", () => {
	const css = cssOf("norn-segmented-control");
	assert.ok(!/::before|::after/.test(css), "no pseudo-element");
	assert.ok(!/--_(index|count)|translate|nth-of-type/.test(css), "no thumb math, so no cap on the options");
	assert.ok(!/outline: 3px/.test(css) && css.includes("outline: var(--norn-ui-focus-width,"), "the one ring, inset");
	const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
	assert.match(forced, /label:has\(input:checked\) \{ background-color: Highlight; color: HighlightText; forced-color-adjust: none;/, "the label itself is filled");
	assert.ok(css.includes("--norn-segmented-control-current") && !css.includes("--norn-segmented-control-thumb") && !css.includes("--norn-segmented-control-border"), "the tint replaces the thumb and the border");
});

test("norn-link-button has primary, secondary, and quiet, and any other value is primary", async () => {
	for (const [variant, expected] of [["primary", "primary"], ["secondary", "secondary"], ["quiet", "quiet"], ["outline", "primary"], [undefined, "primary"]]) {
		const html = await render(`<norn-link-button @href="/" ${variant ? `@variant="${variant}"` : ""}>Go</norn-link-button>`);
		assert.ok(html.includes(`<a href="/" data-variant="${expected}">Go</a>`), `${variant}: ${html}`);
	}
	const css = cssOf("norn-link-button");
	assert.ok(!/text-decoration: underline/.test(css), "no underline on hover or focus");
	assert.ok(!/outline-width/.test(css), "the ring is the base ring");
	assert.match(css, /a\[data-variant="primary"\] \{ border-color: LinkText; background-color: LinkText; color: Canvas; forced-color-adjust: none;/, "primary stays filled in forced colors");
	assert.ok(css.includes("&:active"), "a pressed state");
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

test("norn-code-block overlays a compact copy button, and its terminal frame is flat, with no dots, no shadow, and no border", async () => {
	const css = cssOf("norn-code-block");
	assert.ok(!/border: 1px|--norn-code-block-border|radial-gradient|box-shadow|--norn-code-block-(dot|shadow)|::before/.test(css), "no border, dots, or shadow");
	assert.ok(css.includes("@container style(--norn-chrome: terminal)"), "the frame is still there for whoever sets it");
	assert.ok(css.includes("block-size: 2rem"), "a 2rem header");
	assert.match(css, /norn-copy-button \{[^}]*grid-area: 2 \/ 1;[^}]*justify-self: end;[^}]*align-self: start;/, "over the top end corner of the code");
	assert.ok(unid(await render('<norn-code-block @language="js" @code="x"></norn-code-block>')).includes("<norn-copy-button"), "the button is still part of the sample");
	assert.ok((await render('<norn-code-block @language="js" @code="x"></norn-code-block>')).includes("data-compact"), "and compact");
	assert.ok(!cssOf("norn-hero").includes("--norn-chrome"), "a hero no longer turns the frame on");
});

test("norn-search has a field edge from the strong border, a leading magnifier, and floating results on the raised surface with the shadow and no border", async () => {
	const css = cssOf("norn-search");
	assert.ok(css.includes("var(--norn-search-border, var(--norn-ui-border-strong,"), "the field's edge is 3:1");
	const results = css.match(/& ol \{[^}]*\}/)[0];
	assert.ok(results.includes("box-shadow: var(--norn-ui-shadow,"), "the results float on a shadow");
	assert.ok(!/border:/.test(results), "and have no border");
	assert.ok(results.includes("background: var(--norn-search-results, var(--norn-surface-raised,"), "on the raised surface");
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
		for (const [, value] of styles(text, file).matchAll(/font-size:\s*([^;]+);/g)) {
			assert.ok(!/\d(\.\d+)?rem/.test(value) || value.startsWith("clamp(") || value.startsWith("var(--norn-font-size-"), `${file}: font-size: ${value}`);
		}
	}
});

test("norn-card has a fill and no band, border, or underline at rest, and its heading link covers the card", async () => {
	const css = cssOf("norn-card");
	assert.ok(!/::before/.test(css), "no band");
	assert.ok(!/border: 1px|--norn-card-border/.test(css.replace(/@media \(forced-colors: active\) \{.*$/, "")), "no border, but in forced colors, which drop the fill");
	assert.ok(css.includes("border-block-start: 2px solid var(--norn-card-accent);"), "a set accent draws a 2px line, and unset draws nothing");
	assert.ok(css.includes("&::after { content: \"\"; position: absolute; inset: 0; }"), "the link reaches over the card");
	assert.ok(css.includes("&:has(a:hover)") && css.includes("&:has(a:focus-visible)"), "the card takes the hover layer and the ring");
	assert.match(css, /a \{ color: var\(--norn-card-link, [^;]+; text-decoration: none;/, "no underline at rest");
	const grid = cssOf("norn-card-grid");
	assert.ok(!/ActiveText|VisitedText|GrayText|accent|feature/.test(grid + sources.find(({ file }) => file.endsWith("/norn-card-grid.webc")).text), "no accent cycle and no system color");
});

test("the build writes the @supports not at-rule(@scope) copy of norn-rich-text from its @scope rules, pseudo-elements outside the :where()", () => {
	const source = sources.find(({ file }) => file.endsWith("/norn-rich-text.webc")).text;
	assert.ok(!/@supports/.test(styles(source).replace(/\/\*[\s\S]*?\*\//g, "")), "the source holds only the @scope");
	const compiled = squash(styles(components.find(({ file }) => file.endsWith("/norn-rich-text.webc")).text));
	const fallback = compiled.slice(compiled.lastIndexOf("@supports not at-rule(@scope)"));
	assert.ok(fallback.startsWith("@supports not at-rule(@scope) { norn-rich-text { & :where(h2), & :where(h3)"), "the copy follows the scope");
	assert.ok(fallback.includes("& :where(:is(h1, h2, h3, h4, h5, h6):has(> a))::before {"), "a pseudo-element stays outside");
	assert.ok(/@media \(hover: hover\) and \(min-width: 70rem\) \{ & :where\(:is\(h1, h2, h3, h4, h5, h6\):has\(> a\)\)::before/.test(fallback), "an at-rule inside is copied with its rules moved");
	const scoped = compiled.slice(0, compiled.lastIndexOf("@supports not at-rule(@scope)"));
	const rules = (css) => [...css.matchAll(/\{ ([^{}]*?) \}/g)].length;
	assert.equal(rules(fallback.slice(fallback.indexOf("norn-rich-text {"))), rules(scoped.slice(scoped.indexOf("@scope"))) , "a rule for each rule");
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

test("norn-sidebar-layout folds its navigation into a closed details with a summary from the slot, the registry, then English", async () => {
	const html = unid(await render("<norn-sidebar-layout><norn-side-nav slot=\"nav\" :@items=\"[]\"></norn-side-nav><h1>T</h1></norn-sidebar-layout>"));
	assert.match(html, /<details>\s*<summary>Menu<\/summary>\s*<norn-side-nav/, "closed, and named in English");
	assert.ok(unid(await render("<norn-sidebar-layout><span slot=\"summary\">Pages</span></norn-sidebar-layout>")).includes("<summary><span>Pages</span></summary>"), "the slot");
	assert.ok(unid(await render("<norn-sidebar-layout></norn-sidebar-layout>", { strings: { "norn-sidebar-layout": { summary: "Navigation" } } })).includes("<summary>Navigation</summary>"), "the registry");
	assert.equal(defaultStrings["norn-sidebar-layout"].summary, "Menu");
});

test("norn-toc folds under its title through a details, and the title names the landmark", async () => {
	const html = unid(await render("<norn-toc :@items=\"[{ id: 'a', text: 'A', level: 2 }, { id: 'b', text: 'B', level: 2 }]\"></norn-toc>"));
	assert.match(html, /<nav>\s*<details>\s*<summary><span>On this page<\/span><\/summary>\s*<ol><li><a href="#a">/);
});

test("the JSDoc never names a token with a stray number after it", () => {
	for (const { file, text } of components) assert.ok(!/--norn-[a-z0-9-]+\.\d/.test(text), `${file}: a token name runs into a decimal`);
});

const CATEGORIES = ["layout", "landmark", "container", "component", "template", "document"];

test("every component and layout names its category in its JSDoc", () => {
	for (const { file, text } of [...components, ...layouts]) {
		const category = text.match(/^ \* @category (\w+)$/m)?.[1];
		assert.ok(CATEGORIES.includes(category), `${file}: @category is one of ${CATEGORIES.join(", ")}`);
	}
});

test("every component and layout keeps its license header and JSDoc in one server-only comment, and its setup block holds only code", () => {
	for (const { file, text } of sources.filter(({ file }) => file.endsWith(".webc"))) {
		const comments = text.match(SERVER_COMMENT) ?? [];
		assert.equal(comments.length, 1, `${file}: one <!--- … ---> comment`);
		const [comment] = comments;
		assert.ok(comment.startsWith("<!---\n/*\n * SPDX-License-Identifier: MPL-2.0\n"), `${file}: the comment opens with the license header`);
		assert.ok(/\n \* @category \w+\n \*\/\n--->$/.test(comment), `${file}: the JSDoc ends the comment`);
		// A closer inside the comment ends it early, and WebC then prints the rest.
		assert.ok(!/--!?>/.test(comment.slice(0, -"--->".length)), `${file}: the comment holds no --> or --!>`);
		for (const [, code] of text.matchAll(/<script webc:setup>([\s\S]*?)<\/script>/g)) {
			assert.ok(code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").trim() !== "", `${file}: a webc:setup block holds code, not only comments`);
			assert.ok(!code.includes("SPDX-License-Identifier") && !code.includes("@category"), `${file}: the license header and JSDoc sit in the top comment`);
		}
		const shipped = [...components, ...layouts].find((entry) => entry.file === compiledFrom(file));
		assert.deepEqual(shipped.text.match(SERVER_COMMENT), comments, `${file}: the build keeps the comment as written`);
	}
});

test("a landmark component renders a landmark element, or one that does", () => {
	for (const { file, text } of components) {
		if (text.match(/^ \* @category (\w+)$/m)?.[1] !== "landmark") continue;
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
		if (!["layout", "landmark", "container"].includes(text.match(/^ \* @category (\w+)$/m)?.[1])) continue;
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
		["norn-section", "norn-section section", "section"],
		["norn-section", "norn-section section > h2", "section"],
		["norn-card", "norn-card article", "article"],
		["norn-card", "norn-card article > :is(h2, h3, h4, h5, h6) a", "article"],
		["norn-footer", "norn-footer footer > div:first-child > * > ul", "footer"],
	]) {
		assert.equal(leak(selector, treeOf(name), name), step, selector);
	}
	for (const [name, selector] of [
		["norn-card-grid", "norn-card-grid > ul > li > *"],
		["norn-section", "norn-section > section > h2"],
		["norn-card", "norn-card > article > :is(h2, h3, h4, h5, h6) a"],
		["norn-footer", "norn-footer > footer > div:first-child > :is(div, nav) > ul"],
		["norn-footer", "norn-footer :where(p)"],
	]) {
		assert.equal(leak(selector, treeOf(name), name), undefined, selector);
	}
});

/**
 * Compile markup with every package component defined, and optionally a `componentStrings` table, a page `lang`, more page data,
 * and, with `codeSample: false`, without the code sample's helper, as when it is not installed.
 */
async function render(content, { strings, lang, data = {}, codeSample = true, helpers = {} } = {}) {
	const page = new WebC();
	page.setBundlerMode(true);
	for (const [name, helper] of Object.entries(helpers)) page.setHelper(name, helper);
	if (codeSample) page.setHelper("nornTokenRanges", tokenRanges);
	if (strings) page.setHelper("nornComponentStrings", componentStrings(strings));
	page.defineComponents(Object.fromEntries(components.map(({ file }) => [path.basename(file, ".webc"), path.join(PACKAGES, file)])));
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

test("norn-code-tabs holds its tab list name and fallback tab name as hidden text, in English or from its slots", async () => {
	const html = unid(await render("<norn-code-tabs></norn-code-tabs>"));
	assert.ok(html.includes('<span data-string="label">Code samples</span>') && html.includes('<span data-string="sample">Sample {n}</span>'));
	const own = unid(await render('<norn-code-tabs><span slot="label">Commandes</span><span slot="sample">Exemple {n}</span></norn-code-tabs>'));
	assert.ok(own.includes('<span data-string="label"><span>Commandes</span></span>') && own.includes('<span data-string="sample"><span>Exemple {n}</span></span>'));
	assert.ok(!/data-(label|sample)=/.test(html + own));
});

/** Each component's documented `@slot` names. */
const slotsOf = (text) => new Set([...text.matchAll(/^ \* @slot ([a-z-]+) - /gm)].map(([, name]) => name));

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
		const text = components.find(({ file }) => path.basename(file, ".webc") === component).text;
		const slots = slotsOf(text);
		for (const key of Object.keys(keys)) {
			const slot = SLOT_OF[component] ?? key;
			assert.ok(slots.has(slot), `${component}: no @slot ${slot}`);
			assert.ok(!new RegExp(`^ \\* @prop \\{[^}]*\\} \\[?${slot}\\b`, "m").test(text), `${component}: ${slot} is still a prop`);
			const pattern = new RegExp(`<slot name="${slot}">(?:(?!</slot>)[\\s\\S])*nornComponentStrings\\?\\.\\('${component}', ${SLOT_OF[component] ? "" : `'${key}'`}`);
			assert.match(text, pattern, `${component}: the ${slot} slot falls back to the registry`);
		}
	}
	for (const { file, text } of components) {
		const documented = slotsOf(text);
		for (const [, name] of withoutDocs(text).matchAll(/<slot name="([a-z-]+)"/g)) assert.ok(documented.has(name), `${file}: <slot name="${name}"> has no @slot line`);
	}
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
	const notice = await render('<norn-notice @severity="error"><span slot="prefix">Erreur : </span><p>x</p></norn-notice>', { strings: FRENCH });
	assert.ok(notice.includes("<span data-prefix><span>Erreur : </span></span>"));
	const callout = await render('<norn-callout @variant="tip"><span slot="heading">Conseil</span><p>x</p></norn-callout>', { strings: FRENCH });
	assert.ok(callout.includes("<span>Conseil</span></p>") && !callout.includes("Astuce"));
	const strings = { "norn-skip-link": { label: "Skip ahead" }, fr: { "norn-skip-link": { label: "Aller au contenu" } }, de: { "norn-skip-link": { label: "Zum Inhalt" } } };
	assert.ok((await render("<norn-skip-link></norn-skip-link>", { strings, lang: "fr-CA" })).includes(">Aller au contenu</a>"));
	assert.ok((await render("<norn-skip-link></norn-skip-link>", { strings, lang: "de" })).includes(">Zum Inhalt</a>"));
	assert.ok((await render("<norn-skip-link></norn-skip-link>", { strings, lang: "es" })).includes(">Skip ahead</a>"));
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
		else assert.ok(text.startsWith("---\nlayout: norn-base.webc\n---\n<!---\n/*\n * SPDX-License-Identifier: MPL-2.0"), file);
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
		const allowed = file.endsWith("norn-base.webc") ? ["norn", "page", "content", "layout"] : ["norn", "page", "content"];
		assert.deepEqual([...reads].filter((key) => !allowed.includes(key)), [], `${file} reads only $data.norn, $data.page, and $data.content (and norn-base, $data.layout)`);
	}
});

/** Props for the landing layout, every list given. */
const LANDING = { name: "widget", repo: "https://example.com/widget", license: "MIT", node: "24+", install: "npm install widget", usage: { language: "js", code: "let a = 1;", caption: "a.js" }, nav: [], features: [], packages: [], docs: [], workspaces: [], footer: { badges: [], groups: [] } };

test("a layout renders norn-code-block with the code sample, and <pre><code> without it", async () => {
	const withSample = await render(layoutText("norn-landing"), { data: { norn: LANDING } });
	assert.ok(withSample.includes('<norn-code-block id="usage">') && !withSample.includes("<pre><code>"));
	const without = await render(layoutText("norn-landing"), { data: { norn: LANDING }, codeSample: false });
	assert.ok(!without.includes("<norn-code-block"));
	assert.ok(without.includes('<figure id="usage"><pre><code>let a = 1;</code></pre><figcaption>a.js</figcaption></figure>'), "the usage sample");
	assert.ok(without.includes("<pre><code>npm install widget</code></pre>"), "the install section");
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

test("the server-only comment never reaches the output: a component, a component with a setup block, and a layout", async () => {
	const LEAK = /SPDX|@prop\b|@slot\b|@cssprop\b|@category\b|<!--|-->/;
	const base = { name: "widget", title: "Usage", url: "https://example.com/widget/usage/", lang: "en", nav: [], footer: { badges: [], groups: [] } };
	const page = await render(layoutText("norn-base"), { helpers: { ...HEAD_HELPERS, nornHook: () => "" }, data: { content: "", norn: base } });
	assert.ok(page.startsWith("<!doctype html>"), "the doctype stays first");
	for (const [label, html] of [["norn-skip-link", await render("<norn-skip-link></norn-skip-link>")], ["norn-icon", await render('<norn-icon @name="book"></norn-icon>')], ["norn-base", page]]) {
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
