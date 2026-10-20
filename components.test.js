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
	const toc = compiled.get("webc-patterns/components/norn-page-toc.webc");
	assert.ok(toc.includes("gap: var(--norn-space-xs, 0.5rem);"), "a spacing step");
	assert.ok(toc.includes("color: var(--norn-page-toc-link, var(--norn-text-muted, light-dark(#4b5160, #a4abba)));"), "a component token falls back to the shared one");
});

test("the base styles define no token: base.css sets color-scheme, norn-page-head declares the layer order, and the components carry the defaults", () => {
	const base = stylesheets.find(({ file }) => file === "webc-patterns/css/base.css").text;
	assert.ok(/^@layer norn\.base \{\s*:root \{\s*color-scheme: light dark;/m.test(base));
	const head = components.find(({ file }) => file === "webc-patterns/components/norn-page-head.webc").text;
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
	for (const [, close, name, , selfClose] of markup.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*?)(\/?)>/g)) {
		if (close) {
			while (stack.length > 1 && stack.pop().name !== name);
			continue;
		}
		const node = { name, children: [] };
		stack.at(-1).children.push(node);
		if (!selfClose && !VOID.has(name)) stack.push(node);
	}
	return root;
}

const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);
const holdsSlot = (node) => descendants(node).some((child) => child.name === "slot");

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

/** The step of `selector` that can reach slotted content without `:where()` or a child path, if any. */
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
			if (!["norn-call-out", "norn-page-notice"].includes(component)) assert.ok(looked.has(`${component}.${key}`), `${component}.${key} is never looked up`);
		}
	}
});

test("every component string is a named slot with the registry as its fallback, and none is a prop", () => {
	const SLOT_OF = { "norn-call-out": "heading", "norn-page-notice": "prefix" };
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
	"norn-page-toc": { label: "Sur cette page" },
	"norn-search": { label: "Rechercher", none: "Aucun résultat", "results-one": "{count} résultat", "results-other": "{count} résultats" },
	"norn-call-out": { tip: "Astuce" },
	"norn-page-notice": { warning: "Attention : " },
	"norn-code-block": { label: "code {language}", "copy-label": "Copier le {name}" },
	"norn-copy-button": { copy: "Copier", copied: "Copié", failed: "Échec" },
	"norn-theme-toggle": { label: "Thème", light: "Clair", system: "Système", dark: "Sombre" },
	"norn-skip-link": { label: "Aller au contenu" },
	"norn-header": { label: "Principal" },
};

test("componentStrings fills every component's slot fallbacks from one table", async () => {
	const strings = FRENCH;
	const items = "[{ id: 'a', text: 'A', level: 2 }, { id: 'b', text: 'B', level: 2 }]";
	const toc = await render(`<norn-page-toc :@items="${items}"></norn-page-toc>`, { strings });
	const [, tocId] = toc.match(/<nav aria-labelledby="([^"]+)">/);
	assert.ok(toc.includes(`<p id="${tocId}">Sur cette page</p>`), "the title names the landmark");
	const search = unid(await render("<norn-search></norn-search>", { strings }));
	assert.ok(search.includes("<span>Rechercher</span>") && search.includes('<span data-string="none">Aucun résultat</span>'));
	assert.ok(search.includes('<span data-string="results-one">{count} résultat</span>') && search.includes('<span data-string="results-other">{count} résultats</span>'));
	assert.match(await render('<norn-call-out @variant="tip"><p>x</p></norn-call-out>', { strings }), /<span>Astuce<\/span>/);
	assert.ok((await render('<norn-page-notice @severity="warning"><p>x</p></norn-page-notice>', { strings })).includes("<span data-prefix>Attention : </span>"));
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
	assert.ok(unid(await render("<norn-breadcrumb-nav :@items=\"[{ url: '/', title: 'Accueil' }]\"></norn-breadcrumb-nav>", { strings: FRENCH })).includes("<span data-label>Breadcrumb</span>"), "a string the table leaves out keeps the English default");
	const notice = await render('<norn-page-notice @severity="error"><span slot="prefix">Erreur : </span><p>x</p></norn-page-notice>', { strings: FRENCH });
	assert.ok(notice.includes("<span data-prefix><span>Erreur : </span></span>"));
	const callout = await render('<norn-call-out @variant="tip"><span slot="heading">Conseil</span><p>x</p></norn-call-out>', { strings: FRENCH });
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
	assert.match(await render('<norn-call-out @variant="warning">\n\t<p>x</p>\n</norn-call-out>'), /<span>Warning<\/span><\/p>/);
	const search = unid(await render("<norn-search>\n</norn-search>"));
	assert.ok(search.includes('<span data-string="results-other">{count} results</span>') && search.includes('<span data-string="results-one">{count} result</span>'));
});

test("norn-search leaves results-one empty when the registry sets only results-other, so the script uses that", async () => {
	const html = unid(await render("<norn-search></norn-search>", { strings: { "norn-search": { "results-other": "{count} 件" } } }));
	assert.ok(html.includes('<span data-string="results-one"></span>') && html.includes('<span data-string="results-other">{count} 件</span>'));
});

/** Project icons as the plugin hands them to norn-svg-icon: a stroke icon, a filled one, and a directional one. */
const PROJECT_ICONS = {
	ring: { viewBox: "0 0 32 32", body: '<g fill="none" stroke="currentColor" stroke-width="3"><circle cx="16" cy="16" r="8"/></g>', mirror: false },
	solid: { viewBox: "0 0 20 20", body: '<path fill="currentColor" d="M2 2h16v16H2z"/>', mirror: false },
	"arrow-end": { viewBox: "0 0 20 20", body: '<path fill="currentColor" d="M2 8h10V4l6 6l-6 6v-4H2z"/>', mirror: true },
};

test("norn-svg-icon draws a project icon with its own viewBox and paint, hidden from assistive tech, and marks it as a project icon", async () => {
	const helpers = { nornIcons: () => PROJECT_ICONS };
	const stroke = await render('<norn-svg-icon @name="ring"><span slot="label">Ring</span></norn-svg-icon>', { helpers });
	assert.ok(stroke.includes('<svg viewBox="0 0 32 32" aria-hidden="true" data-project>'));
	assert.ok(stroke.includes('<g fill="none" stroke="currentColor" stroke-width="3"><circle cx="16" cy="16" r="8"/></g>'));
	assert.match(stroke, /<\/svg>\s*<span>Ring<\/span>/, "the label still follows the drawing");
	const filled = await render('<norn-svg-icon @name="solid"></norn-svg-icon>', { helpers });
	assert.ok(filled.includes('<svg viewBox="0 0 20 20" aria-hidden="true" data-project>') && filled.includes('<path fill="currentColor" d="M2 2h16v16H2z"/>'));
	assert.ok(!/<path d=|data-fill|data-mirror/.test(stroke + filled), "no built-in path, and no mirror unless asked");
});

test("norn-svg-icon mirrors a project icon only when it is set to mirror", async () => {
	const helpers = { nornIcons: () => PROJECT_ICONS };
	assert.ok(!(await render('<norn-svg-icon @name="solid"></norn-svg-icon>', { helpers })).includes("data-mirror"));
	assert.ok((await render('<norn-svg-icon @name="arrow-end"></norn-svg-icon>', { helpers })).includes('<svg viewBox="0 0 20 20" aria-hidden="true" data-mirror data-project>'));
});

test("a project icon with a built-in's name replaces it, and the other built-ins stay", async () => {
	const helpers = { nornIcons: () => PROJECT_ICONS };
	const replaced = await render('<norn-svg-icon @name="arrow-end"></norn-svg-icon>', { helpers });
	assert.ok(replaced.includes("M2 8h10V4l6 6l-6 6v-4H2z") && !replaced.includes("M5 12h14M13 6l6 6l-6 6"));
	const kept = await render('<norn-svg-icon @name="check"></norn-svg-icon>', { helpers });
	assert.ok(kept.includes('<svg viewBox="0 0 24 24" aria-hidden="true">') && kept.includes('<path d="M5 12l5 5L20 7"></path>') && !kept.includes("data-project"));
});

test("norn-svg-icon without the plugin draws the built-in icons, and an unknown name lists the built-in and project names", async () => {
	const alone = await render('<norn-svg-icon @name="arrow-end"></norn-svg-icon>');
	assert.ok(alone.includes('<svg viewBox="0 0 24 24" aria-hidden="true" data-mirror>'));
	await assert.rejects(render('<norn-svg-icon @name="ring"></norn-svg-icon>'), /no icon named "ring". Built-in: accessibility, arrow-end[^]*warning. Project: none/);
	await assert.rejects(render('<norn-svg-icon @name="nope"></norn-svg-icon>', { helpers: { nornIcons: () => PROJECT_ICONS } }), /no icon named "nope". Built-in: accessibility[^]*Project: ring, solid, arrow-end/);
});

test("norn-svg-icon styles the stroke on built-in icons only, so a project icon keeps its own paint", () => {
	const css = styles(components.find(({ file }) => file === "webc-patterns/components/norn-svg-icon.webc").text);
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
	const icon = '<a href="/"><norn-svg-icon @name="book"></norn-svg-icon>Docs</a>';
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
	assert.ok(base.includes('<meta\n\t\t\twebc:is="norn-page-head"'), "the head, with the layer order first");
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
	assert.ok(english.includes("<span>License: MIT</span>") && english.includes('data-variant="quiet">View on GitHub</a>') && english.includes('<span id="norn-landing-actions" hidden>Get started</span>'));
	const strings = { "norn-landing": { license: "Licence : {license}", repo: "Voir le dépôt", actions: "Pour commencer" } };
	const french = await render(layoutText("norn-landing"), { data: { norn: LANDING }, strings });
	assert.ok(french.includes("<span>Licence : MIT</span>") && french.includes('data-variant="quiet">Voir le dépôt</a>') && french.includes('<span id="norn-landing-actions" hidden>Pour commencer</span>'));
	assert.ok(!/View on GitHub|License:/.test(french));
});

/** Helpers a page head needs: the bundle links resolve after the render, so a test stands in for them. */
const HEAD_HELPERS = { getBundleFileUrl: () => "/bundle/x" };

test("norn-page-head renders og:image, og:image:alt, and a large twitter:card when an image is set", async () => {
	const html = await render('<meta webc:is="norn-page-head" webc:nokeep @title="Docs" @url="https://example.com/docs/" @og-image="https://cdn.example.com/card.png" @og-image-alt="A widget on a desk" />', { helpers: HEAD_HELPERS });
	assert.ok(html.includes('<meta property="og:image" content="https://cdn.example.com/card.png">'));
	assert.ok(html.includes('<meta property="og:image:alt" content="A widget on a desk">'));
	assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
	assert.equal(html.split('name="twitter:card"').length - 1, 1, "one card");
});

test("norn-page-head without an image renders no image tags and a summary twitter:card", async () => {
	for (const attrs of ['@url="https://example.com/docs/"', '@url="https://example.com/docs/" @og-image=""', '@url="https://example.com/docs/" @og-image-alt="Orphan alt"']) {
		const html = await render(`<meta webc:is="norn-page-head" webc:nokeep @title="Docs" ${attrs} />`, { helpers: HEAD_HELPERS });
		assert.ok(!html.includes("og:image"), `no og:image: ${attrs}`);
		assert.ok(html.includes('<meta name="twitter:card" content="summary">'), `summary: ${attrs}`);
	}
	const page = await render('<meta webc:is="norn-page-head" webc:nokeep @title="Docs" />', { helpers: HEAD_HELPERS, data: { ogImage: { src: "/leak.png" } } });
	assert.ok(!page.includes("og:image"), "page data named ogImage is not read");
});

test("norn-page-head resolves a relative og-image against the canonical url", async () => {
	const head = (image, url = "") => render(`<meta webc:is="norn-page-head" webc:nokeep @title="Docs" ${url ? `@url="${url}"` : ""} @og-image="${image}" />`, { helpers: HEAD_HELPERS });
	assert.ok((await head("assets/card.png", "https://example.com/project/docs/")).includes('property="og:image" content="https://example.com/project/docs/assets/card.png"'), "relative to the page");
	assert.ok((await head("/assets/card.png", "https://example.com/project/docs/")).includes('property="og:image" content="https://example.com/assets/card.png"'), "root-relative to the origin");
	assert.ok((await head("../card.png", "https://example.com/project/docs/")).includes('property="og:image" content="https://example.com/project/card.png"'), "up a folder");
	assert.ok((await head("https://cdn.example.com/card.png")).includes('content="https://cdn.example.com/card.png"'), "an absolute image needs no url");
});

test("norn-page-head warns and leaves out the image tags when a relative og-image has no absolute canonical url", async (t) => {
	const warn = t.mock.method(console, "warn", () => {});
	const head = (url = "") => render(`<meta webc:is="norn-page-head" webc:nokeep @title="Docs" ${url ? `@url="${url}"` : ""} @og-image="assets/card.png" @og-image-alt="A card" />`, { helpers: HEAD_HELPERS });
	for (const [label, url] of [["no url", ""], ["a relative url", "/docs/"]]) {
		warn.mock.resetCalls();
		const html = await head(url);
		assert.equal(warn.mock.callCount(), 1, `one warning: ${label}`);
		const [message] = warn.mock.calls[0].arguments;
		assert.match(message, /^norn-page-head: og-image "assets\/card.png" is relative/, label);
		assert.match(message, /Pass an absolute og-image or url/, label);
		assert.ok(!html.includes("og:image"), `no og:image or og:image:alt: ${label}`);
		assert.ok(html.includes('<meta name="twitter:card" content="summary">'), `a summary card: ${label}`);
		assert.ok(html.includes("<title>Docs</title>"), `the rest of the head renders: ${label}`);
	}
	warn.mock.resetCalls();
	await render('<meta webc:is="norn-page-head" webc:nokeep @title="Docs" @url="https://example.com/" @og-image="card.png" />', { helpers: HEAD_HELPERS });
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
	for (const [label, html] of [["norn-skip-link", await render("<norn-skip-link></norn-skip-link>")], ["norn-svg-icon", await render('<norn-svg-icon @name="book"></norn-svg-icon>')], ["norn-base", page]]) {
		assert.ok(html.length > 0 && !LEAK.test(html), `${label}: no trace of the comment`);
	}
});
