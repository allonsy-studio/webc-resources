/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Read a component's API from its WebC source: the props its expressions read, the slots its markup renders,
// and the custom properties its CSS reads. The preview and the tests document a component from this, so a CSF file
// carries only what code cannot say. Run `node scripts/analyze-webc.js` to print the analysis of every source.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as csstree from "css-tree";
import * as eslintScope from "eslint-scope";
import * as espree from "espree";
import * as parse5 from "parse5";

import { PACKAGES, readTokens } from "./build-components.js";

/** The globals of the plain JavaScript context WebC runs an expression in. */
const JS_GLOBALS = new Set(vm.runInNewContext("Object.getOwnPropertyNames(globalThis)"));

/** What WebC itself puts in an expression's scope (`dataCascade.js`, `ast.js`). */
const WEBC_BUILTINS = new Set(["$data", "webc", "uid"]);

/** The Norn plugin, which registers the helpers components call. */
const PLUGIN_FILE = path.join(PACKAGES, "webc-patterns", "plugin.js");

/**
 * The helper names the Norn plugin registers with `addJavaScriptFunction`, read from its source.
 *
 * @param {string} [file]
 * @returns {string[]}
 */
export const helperNames = (file = PLUGIN_FILE) => [...fs.readFileSync(file, "utf8").matchAll(/addJavaScriptFunction\(\s*["'](\w+)["']/g)].map(([, name]) => name);

/**
 * Whether a free identifier in an expression is never a prop. The one list of exclusions:
 * a name the `webc:setup` block declares, a `webc:for` variable in scope, a JavaScript global, a WebC built-in
 * (`$data`, `webc`, `uid`), a helper the plugin registers, and a name only ever called, which is a helper
 * (Eleventy's `getBundleFileUrl`, for one). A layout reads its props as `$data.norn`, so in a layout every other free
 * name is page data or a helper.
 *
 * @param {string} name
 * @param {{ declared: Set<string>, locals: Set<string>, helpers: Set<string> }} scope
 */
const excluded = (name, { declared, locals, helpers }) => declared.has(name) || locals.has(name) || JS_GLOBALS.has(name) || WEBC_BUILTINS.has(name) || helpers.has(name);

/** `iconOnly` is `icon-only`: WebC camel-cases a prop name for data. */
export const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** What a shared token looks like, from its path: the preview's swatches and the custom property types follow it. */
export const kindOf = (tokenPath) => {
	if (tokenPath.startsWith("space.")) return "space";
	if (tokenPath.startsWith("font.size.")) return "length";
	if (tokenPath.startsWith("font.")) return "font";
	if (tokenPath === "ui.border.radius" || tokenPath === "ui.radius.s") return "radius";
	if (tokenPath === "ui.shadow") return "shadow";
	if (tokenPath === "text.measure" || tokenPath === "layout.width") return "measure";
	if (["ui.focus.width", "ui.focus.offset", "ui.control.height", "ui.icon.s", "ui.icon.m"].includes(tokenPath)) return "length";
	if (tokenPath.startsWith("ui.state.")) return "percentage";
	if (tokenPath === "ui.motion.duration") return "time";
	if (tokenPath === "ui.motion.easing") return "easing";
	return "color";
};

/** The CSS type of each kind of shared token. */
export const KIND_TYPES = { color: "<color>", space: "<length>", length: "<length>", radius: "<length>", measure: "<length>", percentage: "<percentage>", time: "<time>", font: "<font-family>", shadow: "<shadow>", easing: "<easing-function>" };

const PARSE = { ecmaVersion: espree.latestEcmaVersion, sourceType: "script", range: true };
const SCOPE = { ecmaVersion: 2022, sourceType: "script" };

/** Every child node of an ESTree node. */
const childrenOf = (node) => (espree.VisitorKeys[node.type] ?? []).flatMap((key) => [node[key]].flat()).filter((child) => child && typeof child.type === "string");

/** Each node's parent. */
function parentsOf(ast) {
	const parents = new Map();
	const visit = (node, parent) => {
		parents.set(node, parent);
		for (const child of childrenOf(node)) visit(child, node);
	};
	visit(ast, null);
	return parents;
}

/**
 * Whether an expression's value is the node's own: it reaches the top through either side of `||` or `??`, the end of an `&&`,
 * or a branch of a conditional.
 */
function isValueOf(node, parents) {
	let top = node;
	for (let parent = parents.get(top); parent; parent = parents.get(top)) {
		const passes = (parent.type === "LogicalExpression" && (parent.operator !== "&&" || parent.right === top)) || (parent.type === "ConditionalExpression" && parent.test !== top);
		if (!passes) break;
		top = parent;
	}
	return ["Program", "ExpressionStatement"].includes(parents.get(top)?.type);
}

/** Every node under one, itself included. */
const nodesIn = (node) => [node, ...childrenOf(node).flatMap(nodesIn)];

/** A literal an option or a default can be: a number, or a string that is not empty. An empty string is a test for nothing, not a value. */
const isValue = (node) => node?.type === "Literal" && ((typeof node.value === "string" && node.value !== "") || typeof node.value === "number");

/** The identifiers in a node that read a variable: not a property name or an object key. */
const readsIn = (node, parents) =>
	nodesIn(node).filter((child) => {
		if (child.type !== "Identifier") return false;
		const parent = parents.get(child);
		if (parent?.type === "MemberExpression" && parent.property === child && !parent.computed) return false;
		if (parent?.type === "Property" && parent.key === child && !parent.computed && !parent.shorthand) return false;
		return true;
	});

/**
 * The `webc:setup` block: the names it declares, its object and array constants, and its functions.
 *
 * @param {string} code
 */
function readSetup(code) {
	const ast = espree.parse(code, PARSE);
	const manager = eslintScope.analyze(ast, SCOPE);
	const declared = new Set();
	const objects = new Map();
	const arrays = new Map();
	const functions = new Map();
	for (const statement of ast.body) {
		if (statement.type === "FunctionDeclaration" && statement.id) {
			declared.add(statement.id.name);
			functions.set(statement.id.name, statement);
		}
		if (statement.type === "ClassDeclaration" && statement.id) declared.add(statement.id.name);
		if (statement.type !== "VariableDeclaration") continue;
		for (const { id, init } of statement.declarations) {
			for (const name of nodesIn(id).filter((node) => node.type === "Identifier")) declared.add(name.name);
			if (id.type !== "Identifier" || !init) continue;
			if (init.type === "ObjectExpression") objects.set(id.name, init.properties.filter((property) => property.type === "Property" && !property.computed).map(({ key }) => (key.type === "Identifier" ? key.name : key.value)));
			if (init.type === "ArrayExpression" && init.elements.every(isValue)) arrays.set(id.name, init.elements.map(({ value }) => value));
			if (["ArrowFunctionExpression", "FunctionExpression"].includes(init.type)) functions.set(id.name, init);
		}
	}
	return { ast, manager, parents: parentsOf(ast), declared, objects, arrays, functions };
}

const EMPTY_SETUP = { ast: undefined, manager: undefined, parents: new Map(), declared: new Set(), objects: new Map(), arrays: new Map(), functions: new Map() };

/** A `webc:for` value: the names it declares and the expression it loops over (`looping.js`). */
function readLoop(value) {
	const [keys, content] = value.includes(" in ") ? value.split(" in ") : value.split(" of ");
	const names = keys
		.trim()
		.replace(/^\(|\)$/g, "")
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	return { names, content: content ?? "" };
}

/** Every element of a parse5 tree in document order, with the loop names in scope and whether it sits in another component's children. */
function* elements(node, locals = new Set(), nested = false) {
	for (const child of [...(node.childNodes ?? []), ...(node.content?.childNodes ?? [])]) {
		if (!child.tagName) continue;
		const loop = child.attrs.find(({ name }) => name === "webc:for");
		const scope = loop ? new Set([...locals, ...readLoop(loop.value).names]) : locals;
		yield { element: child, locals: scope, nested };
		yield* elements(child, scope, nested || (child.tagName.includes("-") && child.tagName !== "webc-null"));
	}
}

/** The CSS of the `<style>` blocks of a parse5 tree. */
const stylesOf = (document) => [...elements(document)].filter(({ element }) => element.tagName === "style").map(({ element }) => element.childNodes.map((text) => text.value ?? "").join(""));

/**
 * Analyze one WebC source.
 *
 * @param {string} source - The `.webc` file as written in `src/`, with `t()` fallbacks
 * @param {object} [options]
 * @param {boolean} [options.layout] - A layout reads its props as `$data.norn` and its body as `$data.content`
 * @param {{ name: string, path: string, resolved: string }[]} [options.tokens] - The shared tokens, from `readTokens()`
 * @param {string[]} [options.helpers] - The plugin's helper names, from `helperNames()`
 * @param {string[]} [options.inherited] - Props of the parent layout, which a child layout reads and does not own
 * @returns {{
 *   props: { name: string, type?: string, default?: string|number, options?: (string|number)[], boolean?: true, required?: true, how: string[] }[],
 *   slots: { name: string, how: string }[],
 *   tokens: { name: string, path: string, kind: string, type: string, value: string, properties: string[] }[],
 *   owned: { name: string, properties: string[], fallback?: string, query?: string[] }[],
 *   private: string[],
 *   inherited: string[],
 * }}
 */
export function analyzeWebc(source, { layout = false, tokens = [], helpers = [], inherited = [] } = {}) {
	const text = source.replace(/^---\n[\s\S]*?\n---\n/, "");
	const document = parse5.parse(text);
	const all = [...elements(document)];
	const setupElement = all.find(({ element }) => element.tagName === "script" && element.attrs.some(({ name }) => name === "webc:setup"));
	const setup = setupElement ? readSetup(setupElement.element.childNodes.map((node) => node.value ?? "").join("")) : EMPTY_SETUP;
	const helperSet = new Set(helpers);
	const inheritedSet = new Set(inherited);

	/** @type {Map<string, { name: string, how: Set<string>, types: string[], defaults: (string|number)[], lookups: (string|number)[], compared: { value: unknown, chain: object }[], css: string[], required?: boolean }>} */
	const props = new Map();
	const slots = new Map();
	const skipped = new Set();
	/** Attribute name to the props its value is computed from. */
	const mapped = new Map();
	const prop = (name) => {
		if (!props.has(name)) props.set(name, { name, how: new Set(), types: [], defaults: [], lookups: [], compared: [], css: [] });
		return props.get(name);
	};
	const slot = (name, how) => slots.has(name) || slots.set(name, { name, how });

	/**
	 * Read what the code around one reference to a prop says about it.
	 *
	 * @param {object} ref - The identifier, or the `$data.norn.x` member expression in a layout
	 * @param {Map<object, object>} parents
	 * @param {ReturnType<typeof prop>} entry
	 * @param {{ kind: string, mentions: (node: object) => boolean, allowed?: (name: string) => boolean }} context
	 */
	const inspect = (ref, parents, entry, context) => {
		let node = ref;
		let parent = parents.get(node);
		if (parent?.type === "CallExpression" && parent.arguments[0] === node && parent.callee.type === "Identifier" && parent.callee.name === "Number") {
			entry.types.push("number");
			entry.how.add("type from Number()");
			node = parent;
			parent = parents.get(node);
		}
		if (parent?.type === "BinaryExpression" && ["===", "==", "!==", "!="].includes(parent.operator)) {
			const other = parent.left === node ? parent.right : parent.left;
			if (other.type === "Literal" && ["string", "number", "boolean"].includes(typeof other.value)) {
				if (typeof other.value === "string") entry.types.push("string");
				let chain = parent;
				while (parents.get(chain)?.type === "LogicalExpression" && parents.get(chain).operator === "||") chain = parents.get(chain);
				entry.compared.push({ value: other.value, chain });
			}
		}
		if (parent?.type === "UnaryExpression" && parent.operator === "typeof") {
			const test = parents.get(parent);
			const other = test?.type === "BinaryExpression" && (test.left === parent ? test.right : test.left);
			if (other?.type === "Literal" && ["string", "number"].includes(other.value)) {
				entry.types.push(other.value);
				entry.how.add(`type from typeof === '${other.value}'`);
			}
		}
		if (parent?.type === "CallExpression" && parent.arguments.includes(node) && parent.callee.type === "MemberExpression" && !parent.callee.computed) {
			const { object, property } = parent.callee;
			if (property.name === "includes" && parent.arguments[0] === node) {
				const values = object.type === "ArrayExpression" && object.elements.every(isValue) ? object.elements.map(({ value }) => value) : object.type === "Identifier" ? setup.arrays.get(object.name) : undefined;
				if (values) {
					entry.lookups.push(...values);
					entry.how.add("options from .includes()");
				}
			}
			if (property.name === "hasOwn" && object.type === "Identifier" && object.name === "Object" && parent.arguments[1] === node && parent.arguments[0].type === "Identifier" && setup.objects.has(parent.arguments[0].name)) {
				entry.lookups.push(...setup.objects.get(parent.arguments[0].name));
				entry.how.add(`options from the keys of ${parent.arguments[0].name}`);
			}
			if (["replace", "replaceAll"].includes(property.name) && parent.arguments[1] === node) {
				entry.types.push("string");
				entry.how.add("type from a string replacement");
			}
		}
		if (parent?.type === "BinaryExpression" && parent.operator === "in" && parent.left === node && parent.right.type === "Identifier" && setup.objects.has(parent.right.name)) {
			entry.lookups.push(...setup.objects.get(parent.right.name));
			entry.how.add(`options from the keys of ${parent.right.name}`);
		}
		if (parent?.type === "MemberExpression" && parent.computed && parent.property === node && parent.object.type === "Identifier" && setup.objects.has(parent.object.name)) {
			entry.lookups.push(...setup.objects.get(parent.object.name));
			entry.how.add(`options from the keys of ${parent.object.name}`);
		}
		if (parent?.type === "LogicalExpression" && ["||", "??"].includes(parent.operator) && parent.left === node && isValue(parent.right)) {
			entry.defaults.push(parent.right.value);
			entry.how.add(`default from ${parent.operator}`);
		}
		if (parent?.type === "ConditionalExpression" && parent.test !== node && context.mentions(parent.test)) {
			const other = parent.consequent === node ? parent.alternate : parent.consequent;
			if (isValue(other)) {
				entry.defaults.push(other.value);
				entry.how.add("default from a conditional");
			}
		}
		if (parent?.type === "MemberExpression" && parent.object === node) {
			const array = !parent.computed && ["length", "map", "some", "every", "filter", "forEach", "find", "slice"].includes(parent.property.name);
			entry.types.push(array ? "array" : "object");
		}
		if (parent?.type === "BinaryExpression" && parent.operator === "+" && [parent.left, parent.right].some((side) => side !== node && side.type === "Literal" && typeof side.value === "string")) {
			entry.types.push("string");
			entry.how.add("type from a string concatenation");
		}
		if (parent?.type === "LogicalExpression" && ["||", "??"].includes(parent.operator) && parent.left === node && parent.right.type === "Literal" && ["boolean", "string"].includes(typeof parent.right.value)) entry.types.push(typeof parent.right.value);
		// Rendered as it is: text or an attribute value is a string, and a loop's source is an array.
		if (isValueOf(node, parents)) {
			if (context.kind === "text" || context.kind === "attr") {
				entry.types.push("string");
				entry.how.add("type from rendering it as text or an attribute");
			}
			if (context.kind === "loop") {
				entry.types.push("array");
				entry.how.add("type from webc:for");
			}
		}
		// A setup function that throws unless the value is there makes the prop required.
		if (context.kind === "setup") {
			let statement = node;
			while (statement && !/Statement$|Declaration$/.test(statement.type)) statement = parents.get(statement);
			const throws = (branch) => branch?.type === "ThrowStatement" || (branch?.type === "BlockStatement" && branch.body.some(({ type }) => type === "ThrowStatement"));
			if (statement?.type === "IfStatement" && nodesIn(statement.test).includes(ref) && throws(statement.consequent) && readsIn(statement.test, parents).every(({ name }) => context.allowed(name))) {
				entry.required = true;
				entry.how.add("required: a setup function throws without it");
			}
		}
	};

	/** Follow a prop into a setup function it is passed to: the function's parameter reads the prop. */
	const followed = new Set();
	const follow = (fn, index, target) => {
		const key = `${fn}:${index}:${target.prop ?? "norn"}`;
		const node = setup.functions.get(fn);
		const param = node?.params[index];
		if (followed.has(key) || param?.type !== "Identifier") return;
		followed.add(key);
		const variable = setup.manager.getDeclaredVariables(node).find(({ name }) => name === param.name);
		const allowed = (name) => name === param.name || setup.declared.has(name) || JS_GLOBALS.has(name);
		for (const { identifier } of variable?.references ?? []) {
			const parent = setup.parents.get(identifier);
			if (parent?.type === "CallExpression" && parent.callee.type === "Identifier" && setup.functions.has(parent.callee.name) && parent.arguments.includes(identifier)) follow(parent.callee.name, parent.arguments.indexOf(identifier), target);
			if (target.prop) {
				inspect(identifier, setup.parents, prop(target.prop), { kind: "setup", allowed, mentions: (test) => readsIn(test, setup.parents).some(({ name }) => name === param.name) });
			} else if (parent?.type === "MemberExpression" && parent.object === identifier && !parent.computed) {
				const name = parent.property.name;
				if (inheritedSet.has(name)) skipped.add(name);
				else inspect(parent, setup.parents, prop(name), { kind: "setup", allowed, mentions: () => false });
			}
		}
	};

	/** Read one expression of the markup. */
	const expression = (code, { kind, attribute, locals }) => {
		let ast;
		try {
			ast = espree.parse(`(${code}\n)`, PARSE);
		} catch {
			return;
		}
		const parents = parentsOf(ast);
		const scope = { declared: setup.declared, locals, helpers: helperSet };
		const through = eslintScope.analyze(ast, SCOPE).globalScope.through.map(({ identifier }) => identifier);
		const isNorn = (node) => node?.type === "MemberExpression" && !node.computed && node.property.name === "norn" && node.object.type === "Identifier" && node.object.name === "$data";
		/** The props this expression reads, each with the node that reads it. */
		const refs = [];
		for (const identifier of through) {
			const parent = parents.get(identifier);
			const name = identifier.name;
			if (layout) {
				if (name === "content" && !locals.has(name)) slot("default", "the layout renders content");
				if (name !== "$data" || parent?.type !== "MemberExpression" || parent.computed) continue;
				if (parent.property.name === "content") slot("default", "the layout renders $data.content");
				const member = parents.get(parent);
				if (isNorn(parent) && member?.type === "MemberExpression" && member.object === parent && !member.computed) refs.push({ name: member.property.name, node: member });
				continue;
			}
			if (excluded(name, scope)) continue;
			if (parent?.type === "CallExpression" && parent.callee === identifier) continue;
			refs.push({ name: kebab(name), node: identifier });
		}
		const mentions = (test) => refs.some(({ node }) => nodesIn(test).includes(node));
		for (const { name, node } of refs) {
			if (inheritedSet.has(name)) {
				skipped.add(name);
				continue;
			}
			const entry = prop(name);
			entry.how.add(`read in ${kind === "attr" ? `:${attribute}` : kind}`);
			inspect(node, parents, entry, { kind, mentions });
			const call = parents.get(node);
			const flows = isValueOf(node, parents) || (call?.type === "CallExpression" && call.callee.type === "Identifier" && setup.functions.has(call.callee.name) && isValueOf(call, parents));
			if (kind === "attr" && flows) mapped.set(attribute, new Set([...(mapped.get(attribute) ?? []), name]));
		}
		for (const call of nodesIn(ast).filter((node) => node.type === "CallExpression" && node.callee.type === "Identifier" && setup.functions.has(node.callee.name))) {
			call.arguments.forEach((argument, index) => {
				const ref = refs.find(({ node }) => node === argument);
				if (ref && !inheritedSet.has(ref.name)) follow(call.callee.name, index, { prop: ref.name });
				if (layout && isNorn(argument)) follow(call.callee.name, index, {});
			});
		}
	};

	for (const { element, locals, nested } of all) {
		if (element.tagName === "slot") slot(element.attrs.find(({ name }) => name === "name")?.value ?? "default", "<slot>");
		// Slot content handed to another component is compiled with that component's props: only a layout's `$data` reaches it.
		if (nested && !layout) continue;
		for (const { name, value } of element.attrs) {
			if (name.startsWith(":@")) expression(value, { kind: "prop", locals });
			else if (name.startsWith(":")) expression(value, { kind: "attr", attribute: name.slice(1), locals });
			else if (["@text", "@html", "@raw"].includes(name)) expression(value, { kind: "text", locals });
			else if (["webc:if", "webc:elseif"].includes(name)) expression(value, { kind: "test", locals });
			else if (name === "webc:for") expression(readLoop(value).content, { kind: "loop", locals: new Set([...locals].filter((local) => !readLoop(value).names.includes(local))) });
		}
	}

	// The CSS: every custom property read with var() or tested in a style() query, and the attribute values the selectors test.
	const tokensByName = new Map(tokens.map((token) => [token.name, token]));
	const used = new Map();
	const owned = new Map();
	const privates = new Set();
	const selectorValues = new Map();
	const read = (name, property, fallback) => {
		if (name.startsWith("--_")) return privates.add(name);
		if (tokensByName.has(name)) {
			if (!used.has(name)) used.set(name, new Set());
			if (property) used.get(name).add(property);
			return;
		}
		if (!owned.has(name)) owned.set(name, { name, properties: new Set(), fallbacks: new Set(), query: new Set() });
		if (property) owned.get(name).properties.add(property);
		if (fallback) owned.get(name).fallbacks.add(fallback);
	};
	/** Every var() in a declaration's value, the ones in a fallback included. */
	const scan = (value, property) =>
		csstree.walk(value, {
			visit: "Function",
			enter(node) {
				const [first, , fallback] = node.children.toArray();
				if (node.name !== "var" || first?.type !== "Identifier") return;
				const text = fallback ? csstree.generate(fallback) : "";
				read(first.name, property, text.match(/^var\((--[\w-]+)/)?.[1] ?? (text || undefined));
			},
		});
	for (const css of stylesOf(document)) {
		const ast = csstree.parse(css, { parseCustomProperty: true });
		csstree.walk(ast, {
			enter(node) {
				if (node.type === "Declaration") scan(node.value, node.property);
				if (node.type === "Atrule" && node.name === "container" && node.prelude) {
					for (const [, name, value] of csstree.generate(node.prelude).matchAll(/style\(\s*(--[\w-]+)\s*:\s*([^)]+?)\s*\)/g)) {
						read(name);
						owned.get(name)?.query.add(value);
					}
				}
				if (node.type === "AttributeSelector" && node.value) {
					const value = node.value.type === "String" ? node.value.value : node.value.name;
					if (!selectorValues.has(node.name.name)) selectorValues.set(node.name.name, []);
					selectorValues.get(node.name.name).push(value);
				}
			},
		});
	}
	for (const [attribute, names] of mapped) for (const name of names) prop(name).css.push(...(selectorValues.get(attribute) ?? []));

	return {
		props: [...props.values()].map(finish),
		slots: [...slots.values()],
		// In tokens.json order, so every component lists its tokens the same way.
		tokens: [...used]
			.sort(([a], [b]) => tokens.indexOf(tokensByName.get(a)) - tokens.indexOf(tokensByName.get(b)))
			.map(([name, properties]) => {
				const { path: tokenPath, resolved } = tokensByName.get(name);
				const kind = kindOf(tokenPath);
				return { name, path: tokenPath, kind, type: KIND_TYPES[kind] ?? "", value: resolved.replace(/\s+/g, " ").trim(), properties: [...properties] };
			}),
		owned: [...owned.values()].map(({ name, properties, fallbacks, query }) => ({ name, properties: [...properties], ...(fallbacks.size ? { fallback: [...fallbacks].join(" | ") } : {}), ...(query.size ? { query: [...query] } : {}) })),
		private: [...privates],
		inherited: [...skipped],
	};
}

/** The values the boolean rule compares a prop with: `x === true || x === '' || x === 'true'`. */
const BOOLEAN_RULE = [true, "", "true"];

/** Turn what was gathered about a prop into its inferred facts. */
function finish({ name, how, types, defaults, lookups, compared, css, required }) {
	const chains = new Map();
	for (const { value, chain } of compared) chains.set(chain, [...(chains.get(chain) ?? []), value]);
	const booleanChains = [...chains].filter(([, values]) => BOOLEAN_RULE.every((value) => values.includes(value))).map(([chain]) => chain);
	const boolean = booleanChains.length > 0;
	const values = compared.filter(({ chain, value }) => !booleanChains.includes(chain) && typeof value !== "boolean" && value !== "").map(({ value }) => value);
	const result = { name };
	if (boolean) {
		result.boolean = true;
		result.type = "boolean";
		how.add("boolean from the boolean rule");
	} else {
		if (values.length) how.add("options from comparisons");
		if (css.length) how.add("options from attribute selectors in the CSS");
		const fallback = defaults[0];
		const options = [...new Set([...lookups, ...(lookups.length || values.length || css.length ? (fallback === undefined ? [] : [fallback]) : []), ...values, ...css])];
		if (options.length) result.options = options;
		if (fallback !== undefined) result.default = fallback;
		if (types.includes("number") || values.some((value) => typeof value === "number")) result.type = "number";
		else if (options.length || types.includes("string") || typeof fallback === "string") result.type = "string";
		else if (types.includes("array")) result.type = "array";
		else if (types.includes("boolean")) result.type = "boolean";
		else if (types.includes("object")) result.type = "object";
	}
	if (required) result.required = true;
	result.how = [...how];
	return result;
}

/** A layout's parent, from its front matter: `layout: norn-base.webc`. */
const parentOf = (source) => source.match(/^---\n[\s\S]*?^layout:\s*(\S+)\s*$[\s\S]*?\n---\n/m)?.[1];

/**
 * Analyze a source file: a layout under `src/layouts/` reads `$data.norn`, and leaves the props of the layout it extends to that one.
 *
 * @param {string} file - A `.webc` file in a package's `src/`
 * @param {{ tokens?: object[], helpers?: string[] }} [options] - Read from tokens.json and the plugin by default
 * @returns {ReturnType<typeof analyzeWebc>}
 */
export function analyzeFile(file, { tokens = readTokens(), helpers = helperNames() } = {}) {
	const source = fs.readFileSync(file, "utf8");
	const layout = path.basename(path.dirname(file)) === "layouts";
	const parent = layout && parentOf(source);
	const parentProps = (analysis) => [...analysis.props.map(({ name }) => name), ...analysis.inherited];
	const inherited = parent && fs.existsSync(path.join(path.dirname(file), parent)) ? parentProps(analyzeFile(path.join(path.dirname(file), parent), { tokens, helpers })) : [];
	return analyzeWebc(source, { layout, tokens, helpers, inherited });
}

/**
 * The argTypes an analysis gives, in the CSF shape: props, then slots. A CSF file adds the descriptions and the few
 * facts code cannot say. Custom properties are not API, so there are none.
 *
 * @param {ReturnType<typeof analyzeWebc>} analysis
 * @returns {Record<string, object>}
 */
export function derivedArgTypes({ props, slots }) {
	const argTypes = {};
	const controls = { boolean: "boolean", number: "number", string: "text", array: "object", object: "object" };
	for (const entry of props) {
		const table = { category: "props" };
		if (entry.type) table.type = { summary: entry.type };
		if (entry.default !== undefined) table.defaultValue = { summary: String(entry.default) };
		const argType = {};
		const control = entry.options ? "select" : controls[entry.type];
		if (control) argType.control = control;
		if (entry.options) argType.options = [...entry.options];
		if (entry.required) argType.type = { name: entry.type || "string", required: true };
		argTypes[entry.name] = { ...argType, table };
	}
	for (const { name } of slots) argTypes[name] = { control: "text", table: { category: "slots" } };
	return argTypes;
}

/** Every component, layout, and fallback source in `packages/*\/src`. */
export const sourceFiles = () =>
	fs
		.readdirSync(PACKAGES)
		.flatMap((folder) => ["src", "src/layouts", "src/fallback"].map((dir) => path.join(PACKAGES, folder, dir)))
		.filter((dir) => fs.existsSync(dir))
		.flatMap((dir) =>
			fs
				.readdirSync(dir)
				.filter((file) => file.endsWith(".webc"))
				.sort()
				.map((file) => path.join(dir, file)),
		);

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const tokens = readTokens();
	const helpers = helperNames();
	for (const file of sourceFiles()) console.log(JSON.stringify({ file: path.relative(PACKAGES, file), ...analyzeFile(file, { tokens, helpers }) }));
}
