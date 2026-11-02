/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// The WebC analyzer: each inference rule on a small source, then the edge cases the real components hold.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { analyzeFile, analyzeWebc, compareOwned, derivedArgTypes, helperNames, kebab } from "./scripts/analyze-webc.js";
import { PACKAGES } from "./scripts/build-components.js";

const TOKENS = [
	{ name: "--norn-text-accent", path: "text.accent", resolved: "blue" },
	{ name: "--norn-space-m", path: "space.m", resolved: "1.25rem" },
	{ name: "--norn-surface-raised", path: "surface.raised", resolved: "#eee" },
];
const HELPERS = ["nornComponentStrings"];

/** Analyze a source with the test tokens and helpers. */
const analyze = (source, options = {}) => analyzeWebc(source, { tokens: TOKENS, helpers: HELPERS, ...options });

/** One prop of an analysis, by name. */
const propOf = (analysis, name) => analysis.props.find((entry) => entry.name === name);

/** The prop names of an analysis. */
const names = (analysis) => analysis.props.map(({ name }) => name);

test("a prop is a free identifier of an expression, kebab-cased", () => {
	const analysis = analyze('<a :href="href" :title="linkTitle"><span @text="label"></span></a><p webc:if="shown"></p><b @html="body"></b><i @raw="raw"></i><x-a :@items="list"></x-a>');
	assert.deepEqual(names(analysis), ["href", "link-title", "label", "shown", "body", "raw", "list"]);
	assert.equal(kebab("ogImageAlt"), "og-image-alt");
});

test("setup names, loop variables, JavaScript globals, WebC built-ins, plugin helpers, and names only called are not props", () => {
	const source = `<script webc:setup>const LABELS = { a: "A" }; function fmt(value) { return value; }</script>
<li webc:for="(item, index) of items" :data-index="index" @text="fmt(item.title) + String(uid) + $data.page.url + nornComponentStrings?.('x-a', 'k', $data.page) + getBundleFileUrl('css') + LABELS.a"></li>`;
	assert.deepEqual(names(analyze(source)), ["items"]);
	assert.deepEqual(names(analyze(source, { helpers: [] })), ["items"], "a helper is called, so it is not a prop either way");
	assert.deepEqual(names(analyze('<p @text="nornComponentStrings"></p>', { helpers: [] })), ["norn-component-strings"]);
	assert.deepEqual(names(analyze('<p @text="nornComponentStrings"></p>')), [], "a registered helper is not a prop");
	assert.ok(helperNames().includes("nornComponentStrings"), "the helper names come from plugin.js");
});

test("slot content handed to another component reads that component's props, not this one's", () => {
	assert.deepEqual(names(analyze('<x-b :@tone="tone"><span @text="label"></span></x-b>')), ["tone"]);
});

test("a default comes from ||, ??, and a conditional that falls back to a literal", () => {
	const analysis = analyze('<a :href="href || \'#main\'" :data-size="size ?? 3" :data-mode="mode === undefined ? \'auto\' : mode" :data-empty="empty || \'\'"></a>');
	assert.equal(propOf(analysis, "href").default, "#main");
	assert.equal(propOf(analysis, "size").default, 3);
	assert.equal(propOf(analysis, "mode").default, "auto");
	assert.equal(propOf(analysis, "empty").default, undefined, "an empty string is not a default");
});

test("options come from comparisons, .includes(), and a setup table's keys", () => {
	const analysis = analyze(`<script webc:setup>const TONES = { calm: 1, loud: 2 }; const SIZES = ["s", "m"];</script>
<p :data-a="kind === 'x' || kind === 'y' ? kind : 'z'" :data-b="['ltr', 'rtl'].includes(dir) ? dir : 'ltr'" :data-c="TONES[tone]" :data-d="SIZES.includes(size)" :data-e="Object.hasOwn(TONES, other)" :data-f="third in TONES" :data-g="blank !== ''"></p>`);
	assert.deepEqual(propOf(analysis, "kind").options, ["z", "x", "y"]);
	assert.equal(propOf(analysis, "kind").default, "z");
	assert.deepEqual(propOf(analysis, "dir").options, ["ltr", "rtl"]);
	assert.deepEqual(propOf(analysis, "tone").options, ["calm", "loud"]);
	assert.deepEqual(propOf(analysis, "size").options, ["s", "m"]);
	assert.deepEqual(propOf(analysis, "other").options, ["calm", "loud"]);
	assert.deepEqual(propOf(analysis, "third").options, ["calm", "loud"]);
	assert.equal(propOf(analysis, "blank").options, undefined, "an empty string is not an option");
});

test("options come from attribute selectors in the CSS when the markup sets that attribute from the prop", () => {
	const css = '<style>x-a { & [data-tone="soft"] { color: red; } & [data-tone="hard"] { color: blue; } & [aria-current="page"] { color: green; } }</style>';
	const analysis = analyze(`<p :data-tone="tone"></p><a :aria-current="index === items.length ? 'page' : undefined"></a>${css}`);
	assert.deepEqual(propOf(analysis, "tone").options, ["soft", "hard"]);
	assert.equal(propOf(analysis, "items").options, undefined, "a prop read only in a test does not set the attribute");
});

test("a prop through a setup function: its options, default, and the attribute it sets", () => {
	const analysis = analyze(`<script webc:setup>
const KINDS = { note: 1, tip: 2 };
const kind = (variant) => (Object.hasOwn(KINDS, variant) ? variant : "note");
const icon = (variant) => kind(variant);
</script><div :data-variant="icon(variant)"></div><style>x-a { & [data-variant="tip"] { color: red; } }</style>`);
	assert.deepEqual(propOf(analysis, "variant"), { name: "variant", options: ["note", "tip"], default: "note", type: "string", how: propOf(analysis, "variant").how });
});

test("a boolean prop is the one boolean rule, and its comparisons are not options", () => {
	const analysis = analyze("<p :data-on=\"on === true || on === '' || on === 'true' ? '' : undefined\" :data-half=\"half === true || half === 'true' ? '' : undefined\"></p>");
	assert.equal(propOf(analysis, "on").boolean, true);
	assert.equal(propOf(analysis, "on").type, "boolean");
	assert.equal(propOf(analysis, "on").options, undefined);
	assert.equal(propOf(analysis, "half").boolean, undefined, "a partial rule is not the boolean rule");
});

test("a type comes from Number(), typeof, text and attributes, a loop, and member access", () => {
	const analysis = analyze("<h3 webc:if=\"Number(level) === 3\"></h3><p webc:if=\"typeof count === 'number'\" :data-n=\"Number(size)\"></p><p :data-lang=\"typeof lang === 'string' ? lang : undefined\" @text=\"caption\"></p><li webc:for=\"item of items\" @text=\"item\"></li><a :href=\"link.url\"></a>");
	assert.equal(propOf(analysis, "level").type, "number");
	assert.deepEqual(propOf(analysis, "level").options, [3]);
	assert.equal(propOf(analysis, "count").type, "number");
	assert.equal(propOf(analysis, "size").type, "number");
	assert.equal(propOf(analysis, "lang").type, "string");
	assert.equal(propOf(analysis, "caption").type, "string");
	assert.equal(propOf(analysis, "items").type, "array");
	assert.equal(propOf(analysis, "link").type, "object");
});

test("a prop is required when a setup function throws without it, and not when the throw depends on another prop", () => {
	const analysis = analyze(`<script webc:setup>
const required = (value) => { if (typeof value !== "string" || !value) throw new Error("x-a: slug"); return value; };
const grouped = (options, name) => { if (options && !name) throw new Error("x-a: name"); return options; };
</script><h2 :id="required(slug)"></h2><p webc:if="grouped(options, name)"></p>`);
	assert.equal(propOf(analysis, "slug").required, true);
	assert.equal(propOf(analysis, "name").required, undefined);
});

test("slots: each named slot, the default slot, a slot after webc:else, and a layout's content", () => {
	assert.deepEqual(
		analyze('<p><slot name="heading"><span>Fallback</span></slot></p><slot></slot><span slot="label">Not a slot</span>').slots.map(({ name }) => name),
		["heading", "default"],
	);
	assert.deepEqual(analyze('<template webc:if="items"></template><slot webc:else></slot>').slots.map(({ name }) => name), ["default"]);
	assert.deepEqual(analyze('<main><template webc:nokeep @html="$data.content"></template></main>', { layout: true }).slots.map(({ name }) => name), ["default"]);
	assert.deepEqual(analyze('<main><template webc:nokeep @html="content"></template></main>', { layout: true }).slots.map(({ name }) => name), ["default"]);
	assert.deepEqual(analyze('<main><template webc:nokeep @html="content"></template></main>').slots, [], "a component's content is a prop, not its body");
});

test("a layout's props are $data.norn members, a parent layout's props are left to it, and a setup function may read them", () => {
	const source = `---
layout: x-base.webc
---
<script webc:setup>const site = (norn) => norn.search || norn.url;</script>
<h1 @text="$data.norn.title || ''"></h1><p @text="$data.norn.lede || $data.norn.description" :data-site="site($data.norn)"></p><a :href="url('/x/')"></a>`;
	const analysis = analyze(source, { layout: true, inherited: ["title", "url", "description"] });
	assert.deepEqual(names(analysis), ["lede", "search"]);
	assert.deepEqual(analysis.inherited.sort(), ["description", "title", "url"]);
	assert.equal(propOf(analysis, "lede").type, "string");
});

test("custom properties: a global token is used, a private one is skipped, and any other is owned by the component", () => {
	const analysis = analyze(`<p></p><style>
x-a {
	--_bg: var(--x-a-bg, var(--norn-surface-raised, t('surface.raised')));
	padding: var(--norn-space-m, t('space.m'));
	background: var(--_bg);
	color: var(--x-a-color, var(--norn-text-accent, t('text.accent')));
	border-width: var(--x-a-border, 1px);
	@container style(--x-a-face: mono) { font-family: monospace; }
}
</style>`);
	assert.deepEqual(analysis.tokens, [
		{ name: "--norn-text-accent", path: "text.accent", kind: "color", type: "<color>", value: "blue", properties: ["color"] },
		{ name: "--norn-space-m", path: "space.m", kind: "space", type: "<length>", value: "1.25rem", properties: ["padding"] },
		{ name: "--norn-surface-raised", path: "surface.raised", kind: "color", type: "<color>", value: "#eee", properties: ["--_bg"] },
	]);
	assert.deepEqual(analysis.private, ["--_bg"]);
	assert.deepEqual(analysis.owned, [
		{ name: "--x-a-bg", properties: ["--_bg"], fallback: "--norn-surface-raised" },
		{ name: "--x-a-color", properties: ["color"], fallback: "--norn-text-accent" },
		{ name: "--x-a-border", properties: ["border-width"], fallback: "1px" },
		{ name: "--x-a-face", properties: [], query: ["mono"] },
	]);
});

test("the argTypes an analysis gives: props with their facts, then slots, and no custom property", () => {
	const argTypes = derivedArgTypes(analyze("<a :href=\"href\" :data-v=\"variant === 'b' ? variant : 'a'\" :data-on=\"on === true || on === '' || on === 'true' ? '' : undefined\"><slot></slot></a><style>x-a { color: var(--x-a-color); }</style>"));
	assert.deepEqual(argTypes, {
		href: { control: "text", table: { category: "props", type: { summary: "string" } } },
		variant: { control: "select", options: ["a", "b"], table: { category: "props", type: { summary: "string" }, defaultValue: { summary: "a" } } },
		on: { control: "boolean", table: { category: "props", type: { summary: "boolean" } } },
		default: { control: "text", table: { category: "slots" } },
	});
});

test("the owned custom properties against an allowlist: one added, and one the code no longer reads", () => {
	assert.deepEqual(compareOwned({ "x-a": ["--x-a-bg"] }, { "x-a": ["--x-a-bg"] }), { added: [], stale: [] });
	assert.deepEqual(compareOwned({ "x-a": ["--x-a-bg", "--x-a-fg"] }, { "x-a": ["--x-a-bg", "--x-a-gap"] }), { added: ["x-a --x-a-fg"], stale: ["x-a --x-a-gap"] });
});

/** A source file of a package. */
const source = (...parts) => path.join(PACKAGES, ...parts);

test("real components: norn-callout's variant through a setup function and a table, norn-link-button's through a conditional and the CSS", () => {
	const callout = analyzeFile(source("webc-patterns", "src", "norn-callout.webc"));
	assert.deepEqual(callout.props.map(({ name, options, default: fallback }) => ({ name, options, default: fallback })), [{ name: "variant", options: ["note", "tip", "important", "warning", "caution"], default: "note" }]);
	assert.deepEqual(callout.slots.map(({ name }) => name), ["heading", "default"]);
	const button = analyzeFile(source("webc-patterns", "src", "norn-link-button.webc"));
	assert.deepEqual(propOf(button, "variant").options, ["primary", "secondary", "quiet"]);
	assert.equal(propOf(button, "variant").default, "primary");
	assert.ok(button.tokens.some(({ name }) => name === "--norn-ui-accent"), "a token read in a fallback is used");
});

test("real components: norn-code-block's code and language, norn-icon's required name, norn-head's camel-cased props", () => {
	const block = analyzeFile(source("webc-code-sample", "src", "norn-code-block.webc"));
	assert.deepEqual(names(block).sort(), ["caption", "code", "language"]);
	assert.equal(propOf(block, "language").default, undefined, "a `''` fallback is no default");
	assert.deepEqual(block.slots.map(({ name }) => name), ["copy-label", "copy", "copied", "failed", "label"]);
	assert.ok(block.tokens.some(({ name }) => name === "--norn-code-comment"), "the syntax colors are global tokens");
	const icon = analyzeFile(source("webc-patterns", "src", "norn-icon.webc"));
	assert.equal(propOf(icon, "name").required, true);
	assert.ok(propOf(icon, "name").options.includes("arrow-end"));
	const head = analyzeFile(source("webc-patterns", "src", "norn-head.webc"));
	assert.deepEqual(names(head).sort(), ["description", "og-image", "og-image-alt", "og-title", "theme-color", "theme-toggle", "title", "url"]);
	assert.equal(propOf(head, "theme-toggle").boolean, true, "a webc:if on a script is read");
});

test("real layouts: norn-landing leaves norn-base's props to it, and renders its body", () => {
	const landing = analyzeFile(source("webc-patterns", "src", "layouts", "norn-landing.webc"));
	assert.deepEqual(names(landing).sort(), ["features", "install", "lede", "license", "node", "packages", "repo", "usage"]);
	assert.deepEqual(landing.inherited.sort(), ["description", "name", "tagline"]);
	assert.deepEqual(landing.slots.map(({ name }) => name), ["default"]);
	const docs = analyzeFile(source("webc-patterns", "src", "layouts", "norn-docs.webc"));
	assert.deepEqual(names(docs).sort(), ["docs", "next", "prev", "search"]);
});
