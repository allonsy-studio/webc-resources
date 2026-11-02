/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// The CSF files: one per component and layout, beside its source, holding its docs and stories as data.
// The analyzer derives the props and slots from the source; a CSF file adds the descriptions and the few facts code cannot say.
// While the move from JSDoc is under way, a component without a CSF file keeps its JSDoc instead.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { WebC } from "@11ty/webc";

import { tokenRanges } from "./packages/webc-code-sample/index.js";
import { CATEGORIES, csfFile, effectiveArgTypes, HEAD_COMPONENTS, readCsf } from "./preview/lib/catalog.js";
import { matrixCells, PROPS, renderStory, SLOTS } from "./preview/lib/render-story.js";
import { analyzeFile, analyzeWebc, derivedArgTypes, helperNames } from "./scripts/analyze-webc.js";
import { readTokens } from "./scripts/build-components.js";

const PACKAGES = path.join(import.meta.dirname, "packages");

const META_KEYS = ["title", "component", "args", "argTypes", "parameters", "tags"];
const STORY_KEYS = ["name", "args", "argTypes", "parameters", "tags"];
const ARG_CATEGORIES = [PROPS, SLOTS];
const KINDS = CATEGORIES.map(({ id }) => id);

/** The title group of the OSS site package, which holds components of any kind. */
const OSS_GROUP = "OSS site";

const analyzer = { tokens: readTokens(), helpers: helperNames() };

/** Every component and layout source, with its CSF file if it has one. */
const sources = fs.readdirSync(PACKAGES).flatMap((folder) =>
	[false, true].flatMap((layout) => {
		const dir = path.join(PACKAGES, folder, "src", ...(layout ? ["layouts"] : []));
		if (!fs.existsSync(dir)) return [];
		return fs
			.readdirSync(dir)
			.filter((file) => file.endsWith(".webc"))
			.map((file) => {
				const name = file.slice(0, -".webc".length);
				const stories = csfFile(path.join(PACKAGES, folder), name, layout);
				return { folder, name, layout, head: HEAD_COMPONENTS.has(name), file: path.join(dir, file), text: fs.readFileSync(path.join(dir, file), "utf8"), stories: fs.existsSync(stories) ? stories : undefined };
			});
	}),
);

const withCsf = await Promise.all(
	sources
		.filter(({ stories }) => stories)
		.map(async (source) => {
			const csf = await readCsf(source.stories);
			const derived = derivedArgTypes(analyzeFile(source.file, analyzer));
			return { ...source, csf, derived, argTypes: effectiveArgTypes(derived, csf.meta.argTypes), csfText: fs.readFileSync(source.stories, "utf8") };
		}),
);

/** Each leaf of a value, by its dotted path: an array is one leaf. */
const leaves = (value, trail = "") => (value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value).flatMap(([key, child]) => leaves(child, trail ? `${trail}.${key}` : key)) : [[trail, value]]);

/** The field an override sets, as a CSF file's `parameters.webc.overrides` names it (`<arg> <field>`): `type`, `options`, `table.type`, `table.defaultValue`. */
const fieldOf = (leaf) => (leaf.startsWith("table.") ? leaf.split(".").slice(0, 2).join(".") : leaf.split(".")[0]);

/** Every path in a value that holds a function. */
const functionsIn = (value, trail = "") => {
	if (typeof value === "function") return [trail || "(root)"];
	if (!value || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([key, child]) => functionsIn(child, `${trail}.${key}`));
};

/**
 * What is wrong with one CSF file, as a list of messages: its shape, its title and category, its argTypes against what the
 * analyzer derives from the source, and its stories.
 *
 * @param {{ name: string, folder: string, layout: boolean, head: boolean, csf: Awaited<ReturnType<typeof readCsf>>, derived: Record<string, object> }} entry
 * @param {Record<string, string>} [overrides] - Extra allowed overrides, as `component arg field`; each file also carries its own in `parameters.webc.overrides`
 * @returns {string[]}
 */
function problems({ name, folder, layout, head, csf, derived }, overrides = {}) {
	const found = [];
	const { meta, stories, order, exports } = csf;
	if (!meta || typeof meta !== "object") return [`${name}: no default export`];
	const own = Object.fromEntries(Object.entries(meta.parameters?.webc?.overrides ?? {}).map(([key, reason]) => [`${name} ${key}`, reason]));
	const allowed = { ...overrides, ...own };
	for (const key of Object.keys(meta)) if (!META_KEYS.includes(key)) found.push(`${name}: meta key "${key}" is not allowed`);
	for (const where of functionsIn(meta)) found.push(`${name}: meta${where} is a function`);
	if (meta.component !== name) found.push(`${name}: component is "${meta.component}", not the file's name`);
	const [group, tag, ...rest] = String(meta.title).split("/");
	if (!group || tag !== name || rest.length) found.push(`${name}: the title "${meta.title}" is not "<Group>/${name}"`);
	const oss = folder === "webc-oss-site";
	if (oss) {
		if (group !== OSS_GROUP) found.push(`${name}: an OSS site component is titled "${OSS_GROUP}/${name}"`);
		if (!KINDS.includes(meta.parameters?.webc?.category)) found.push(`${name}: parameters.webc.category is one of ${KINDS.join(", ")}`);
	} else {
		if (!KINDS.includes(group?.toLowerCase())) found.push(`${name}: the title's group "${group}" is not a category`);
		if (meta.parameters?.webc?.category !== undefined) found.push(`${name}: the category comes from the title, so parameters.webc.category is not set`);
	}
	const written = meta.argTypes ?? {};
	for (const [arg, argType] of Object.entries(written)) {
		if (arg.startsWith("--") || argType.table?.category === "css custom properties") {
			found.push(`${name}: "${arg}" is a custom property, and a component surfaces none of its own: document the global tokens it reads instead`);
			continue;
		}
		if (!derived[arg]) {
			found.push(`${name}: the argType "${arg}" is stale: the analyzer finds no such prop or slot in the source`);
			continue;
		}
		const facts = new Map(leaves(derived[arg]));
		for (const [leaf, value] of leaves(argType).filter(([leaf]) => leaf !== "description")) {
			const key = `${name} ${arg} ${fieldOf(leaf)}`;
			if (facts.has(leaf) && JSON.stringify(facts.get(leaf)) === JSON.stringify(value)) found.push(`${name}: the argType "${arg}" restates ${leaf}, which the analyzer derives from the source`);
			else if (!allowed[key]) found.push(`${name}: the argType "${arg}" sets ${leaf}, an override with no reason in parameters.webc.overrides ("${key.slice(name.length + 1)}")`);
		}
	}
	const argTypes = effectiveArgTypes(derived, written);
	for (const [arg, argType] of Object.entries(argTypes)) {
		if (typeof argType.description !== "string" || !argType.description.trim()) found.push(`${name}: the ${argType.table?.category === SLOTS ? "slot" : "prop"} "${arg}" is in the source and has no description in the CSF file`);
		if (!ARG_CATEGORIES.includes(argType.table?.category)) found.push(`${name}: argType "${arg}" has table.category "${argType.table?.category}", not one of ${ARG_CATEGORIES.join(", ")}`);
		const control = typeof argType.control === "object" ? argType.control?.type : argType.control;
		if (control === "select" && !(Array.isArray(argType.options) && argType.options.length)) found.push(`${name}: argType "${arg}" is a select with no options`);
	}
	for (const story of exports.filter((key) => !order.includes(key))) found.push(`${name}: the story ${story} is not a plain \`export const\`, so its order is unknown`);
	if (head && stories.length) found.push(`${name}: a head component has no stories`);
	if (layout && stories.length) found.push(`${name}: a layout's stories are pages`);
	const declared = (story) => ({ ...argTypes, ...story?.argTypes });
	for (const arg of Object.keys(meta.args ?? {})) if (!argTypes[arg]) found.push(`${name}: meta arg "${arg}" has no argType`);
	for (const story of stories) {
		if (!/^[A-Z][A-Za-z0-9]*$/.test(story.exportName)) found.push(`${name}: the export "${story.exportName}" is not PascalCase`);
		for (const key of Object.keys(story)) if (key !== "exportName" && !STORY_KEYS.includes(key)) found.push(`${name}: story ${story.exportName} has the key "${key}", which is not allowed`);
		for (const where of functionsIn(story)) found.push(`${name}: ${story.exportName}${where} is a function`);
		for (const arg of Object.keys(story.args ?? {})) if (!declared(story)[arg]) found.push(`${name}: ${story.exportName} sets "${arg}", which has no argType`);
	}
	return found;
}

test("every component and layout has a CSF file, or keeps its JSDoc until it moves, and never both", () => {
	for (const { folder, name, text, stories } of sources) {
		const jsdoc = /<!---[\s\S]*?\/\*\*[\s\S]*?--->/.test(text);
		assert.ok(stories || jsdoc, `${folder}/${name}: no CSF file and no JSDoc`);
		assert.ok(!(stories && jsdoc), `${folder}/${name}: the docs live in the CSF file, so the comment holds the license header alone`);
	}
});

test("every CSF file has the strict CSF 3 shape and agrees with its component", () => {
	assert.deepEqual(withCsf.flatMap((entry) => problems(entry)), []);
});

test("every override a CSF file gives a reason for is one it sets", () => {
	const unused = withCsf.flatMap(({ name, csf }) => {
		const set = new Set(Object.entries(csf.meta.argTypes ?? {}).flatMap(([arg, argType]) => leaves(argType).filter(([leaf]) => leaf !== "description").map(([leaf]) => `${arg} ${fieldOf(leaf)}`)));
		return Object.entries(csf.meta.parameters?.webc?.overrides ?? {}).flatMap(([key, reason]) => [...(set.has(key) ? [] : [`${name}: the override "${key}" is not set by any argType`]), ...(typeof reason === "string" && reason.trim() ? [] : [`${name}: the override "${key}" has no reason`])]);
	});
	assert.deepEqual(unused, []);
});

test("CSF titles are unique", () => {
	const titles = withCsf.map(({ csf }) => csf.meta.title);
	assert.deepEqual(titles.filter((title, index) => titles.indexOf(title) !== index), []);
});

test("a CSF file holds no render function and no play, decorator, loader, or hook, in the meta or a story", () => {
	for (const { name, csfText } of withCsf) assert.ok(!/\b(render|play|decorators|loaders|beforeEach)\s*:/.test(csfText), `${name}: stories are data`);
});

test("the CSF check catches each kind of mistake", () => {
	const markup = '<!---\n--->\n<div :data-tone="tone === \'a\' || tone === \'b\' ? tone : \'a\'" :data-size="size"><slot name="heading"></slot><slot></slot></div>\n<style>x-a { color: var(--x-a-color, var(--norn-text-accent, red)); }</style>';
	const derived = derivedArgTypes(analyzeWebc(markup, analyzer));
	assert.deepEqual(Object.keys(derived), ["tone", "size", "heading", "default"], "the analyzer derives the props and slots");
	const meta = {
		title: "Component/x-a",
		component: "x-a",
		argTypes: { tone: { description: "Tone." }, size: { description: "Size." }, heading: { description: "Heading." }, default: { description: "Body." } },
	};
	const entry = (change = {}, stories = [{ exportName: "Default", args: { tone: "a" } }]) => ({ name: "x-a", folder: "webc-patterns", layout: false, head: false, derived, csf: { meta: { ...meta, ...change }, stories, order: stories.map(({ exportName }) => exportName), exports: stories.map(({ exportName }) => exportName) } });
	const argTypes = (change) => ({ argTypes: { ...meta.argTypes, ...change } });
	assert.deepEqual(problems(entry()), [], "a good file passes");
	const cases = [
		[entry({ render: "x" }), /meta key "render"/],
		[entry({ args: { tone: () => "a" } }), /meta\.args\.tone is a function/],
		[entry({ title: "Component/x-b" }), /is not "<Group>\/x-a"/],
		[entry({ title: "Widgets/x-a" }), /is not a category/],
		[entry({ component: "x-b" }), /component is "x-b"/],
		[entry({ argTypes: { tone: meta.argTypes.tone, size: meta.argTypes.size, default: meta.argTypes.default } }), /the slot "heading" is in the source and has no description in the CSF file/],
		[entry(argTypes({ footer: { description: "Footer." } })), /"footer" is stale/],
		[entry(argTypes({ tone: { description: "Tone.", options: ["a", "b"] } })), /"tone" restates options/],
		[entry(argTypes({ heading: { description: "Heading.", table: { category: SLOTS } } })), /"heading" restates table.category/],
		[entry(argTypes({ tone: { description: "Tone.", table: { defaultValue: { summary: "b" } } } })), /"tone" sets table.defaultValue.summary, an override with no reason in parameters.webc.overrides \("tone table.defaultValue"\)/],
		[entry(argTypes({ "--x-a-color": { description: "Color." } })), /"--x-a-color" is a custom property, and a component surfaces none of its own/],
		[entry(argTypes({ size: { description: "Size.", control: "select" } })), /"size" is a select with no options/],
		[entry(argTypes({ size: { description: "Size.", table: { category: "attributes" } } })), /table.category "attributes"/],
		[entry({}, [{ exportName: "default_story", args: {} }]), /not PascalCase/],
		[entry({}, [{ exportName: "Default", render: "x" }]), /the key "render"/],
		[entry({}, [{ exportName: "Default", args: { width: "l" } }]), /sets "width", which has no argType/],
		[{ ...entry(), csf: { ...entry().csf, exports: ["Default", "Other"] } }, /Other is not a plain `export const`/],
	];
	for (const [broken, message] of cases) assert.match(problems(broken).join("\n"), message);
	assert.deepEqual(problems(entry({ ...argTypes({ tone: { description: "Tone.", table: { defaultValue: { summary: "b" } } } }), parameters: { webc: { overrides: { "tone table.defaultValue": "A reason." } } } })), [], "an override with a reason in the file passes");
	const oss = { ...entry({ title: "OSS site/x-a" }), folder: "webc-oss-site" };
	assert.match(problems(oss).join("\n"), /parameters.webc.category/, "an OSS site component names its category");
});

/** Compile markup with every compiled package component defined. */
async function render(content) {
	const page = new WebC();
	page.setBundlerMode(true);
	page.setHelper("nornTokenRanges", tokenRanges);
	for (const folder of fs.readdirSync(PACKAGES)) {
		const dir = path.join(PACKAGES, folder, "components");
		if (fs.existsSync(dir)) page.defineComponents(Object.fromEntries(fs.readdirSync(dir).filter((file) => file.endsWith(".webc")).map((file) => [file.slice(0, -".webc".length), path.join(dir, file)])));
	}
	page.setContent(content);
	return (await page.compile({ data: { page: {} } })).html;
}

/** The text a slot arg holds, without its tags. */
const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Check one rendered story: it compiles, leaves no `undefined`, renders the host, and shows the text its slots were given. */
async function checkRender(label, tag, args, argTypes) {
	const html = await render(renderStory(tag, args, argTypes));
	assert.ok(!html.includes("undefined"), `${label}: no undefined`);
	const visible = textOf(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ""));
	for (const [arg, value] of Object.entries(args)) {
		if (argTypes[arg]?.table?.category !== SLOTS || !textOf(String(value))) continue;
		assert.ok(visible.includes(textOf(String(value))), `${label}: the ${arg} slot's text is in the output`);
	}
	if (/<style\b/.test(fs.readFileSync(path.join(PACKAGES, sources.find(({ name }) => name === tag).folder, "src", `${tag}.webc`), "utf8"))) assert.ok(html.includes(`<${tag}`), `${label}: the host renders`);
}

test("every CSF story and every matrix cell renders through WebC with the compiled components", async () => {
	for (const { name, layout, head, csf, argTypes } of withCsf) {
		if (layout || head) continue;
		for (const story of csf.stories) await checkRender(`${name} ${story.exportName}`, name, { ...csf.meta.args, ...story.args }, { ...argTypes, ...story.argTypes });
		for (const cell of matrixCells({ ...csf.meta, argTypes }, csf.stories.find(({ exportName }) => exportName === "Default"))) {
			await checkRender(`${name} matrix ${cell.label}`, name, cell.args, argTypes);
		}
	}
});

test("the matrix varies one prop at a time: every option of a select, and both values of a boolean", () => {
	const meta = {
		args: { size: "m" },
		argTypes: {
			tone: { control: "select", options: ["a", "b"], table: { category: PROPS } },
			compact: { control: "boolean", table: { category: PROPS } },
			size: { table: { category: PROPS } },
			default: { table: { category: SLOTS } },
		},
	};
	const cells = matrixCells(meta, { args: { default: "x" } });
	assert.deepEqual(
		cells.map(({ label }) => label),
		["tone = a", "tone = b", "compact = true", "compact = false"],
	);
	assert.deepEqual(cells[0].args, { size: "m", default: "x", tone: "a" }, "the baseline is the meta's args and the Default story's");
	assert.deepEqual(matrixCells({ argTypes: { size: { table: { category: PROPS } } } }), [], "nothing enumerable, no matrix");
});

test("the default renderer writes props and slots the way a page would", () => {
	const argTypes = { variant: { table: { category: PROPS } }, open: { table: { category: PROPS } }, hidden: { table: { category: PROPS } }, items: { table: { category: PROPS } }, code: { table: { category: PROPS } }, heading: { table: { category: SLOTS } }, default: { table: { category: SLOTS } } };
	assert.equal(renderStory("x-a", { variant: 'a "b" & c', open: true, hidden: false }, argTypes), '<x-a @variant="a &quot;b&quot; &amp; c" @open></x-a>');
	assert.equal(renderStory("x-a", { items: [{ url: "#" }] }, argTypes), '<x-a :@items="([{&quot;url&quot;:&quot;#&quot;}])"></x-a>');
	assert.equal(renderStory("x-a", { code: "a\n'b'\n" }, argTypes), "<x-a :@code=\"'a\\n\\'b\\'\\n'\"></x-a>");
	assert.equal(renderStory("x-a", { default: "<p>a</p>\n<p>b</p>", heading: "<span>H</span>" }, argTypes), '<x-a>\n\t<template slot="heading" webc:nokeep><span>H</span></template>\n\t<p>a</p>\n\t<p>b</p>\n</x-a>');
	assert.equal(renderStory("x-a", { default: "Go" }, argTypes), "<x-a>Go</x-a>");
	assert.throws(() => renderStory("x-a", { size: "l" }, argTypes), /the arg "size" has no argType/);
});
