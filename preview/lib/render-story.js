/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// The default renderer for CSF stories: a component tag and its args, written as the WebC a page would hold.
// Eleventy's WebC processor compiles the result, so a story renders the real component.

/** The argType categories, as `table.category` names them. */
export const PROPS = "props";
export const SLOTS = "slots";
export const CSS_PROPS = "css custom properties";

/** Escape a value for a double-quoted attribute. */
const attribute = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Indent every line of a block by one tab, unless it holds preformatted text, whose whitespace is content. */
const indent = (text) => (/<(pre|textarea)\b/.test(text) ? text : text.replace(/^(?=.)/gm, "\t"));

/** A string as a single-quoted JavaScript literal, the way a story writes a multi-line value by hand. */
const literal = (text) => `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;

/**
 * One prop as WebC writes it: a string is `@name="…"`, `true` is a bare `@name`, any other value is a `:@name` expression.
 * A string with a line break is a `:@name` string literal, so the markup stays on one line. `false`, `null`, and `undefined` are left out.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {string}
 */
function prop(name, value) {
	if (value === undefined || value === null || value === false) return "";
	if (value === true) return `@${name}`;
	if (typeof value === "string") return value.includes("\n") ? `:@${name}="${attribute(literal(value))}"` : `@${name}="${attribute(value)}"`;
	// An object literal as a whole expression reads as a block, so it is wrapped.
	const expression = JSON.stringify(value);
	return `:@${name}="${attribute(typeof value === "object" ? `(${expression})` : expression)}"`;
}

/**
 * Write a component tag with its args: props as attributes, custom properties as a `style`, each named slot as a
 * `<template slot>`, then the `default` slot. Slot args are HTML strings.
 *
 * @param {string} tag - The component's tag
 * @param {Record<string, unknown>} args
 * @param {Record<string, { table?: { category?: string } }>} argTypes
 * @returns {string} The WebC source
 * @throws {Error} When an arg has no argType
 */
export function renderStory(tag, args = {}, argTypes = {}) {
	const attributes = [];
	const styles = [];
	const named = [];
	let body = "";
	for (const [name, value] of Object.entries(args)) {
		const category = argTypes[name]?.table?.category;
		if (!category) throw new Error(`${tag}: the arg "${name}" has no argType.`);
		if (category === PROPS) attributes.push(prop(name, value));
		else if (category === CSS_PROPS && value !== undefined && value !== "") styles.push(`${name}: ${value}`);
		else if (category === SLOTS && value !== undefined && value !== "") {
			if (name === "default") body = String(value);
			else named.push(`<template slot="${name}" webc:nokeep>${value}</template>`);
		}
	}
	if (styles.length) attributes.push(`style="${attribute(styles.join("; "))}"`);
	const open = [tag, ...attributes.filter(Boolean)].join(" ");
	const children = [...named, body].filter(Boolean).join("\n");
	if (!children) return `<${open}></${tag}>`;
	if (!children.includes("\n")) return `<${open}>${children}</${tag}>`;
	return `<${open}>\n${indent(children)}\n</${tag}>`;
}

/**
 * The cells of a component's matrix: one per option of every prop with `options`, and both values of every boolean prop,
 * each varied alone from the baseline args.
 *
 * @param {{ args?: object, argTypes?: Record<string, { options?: unknown[], control?: string | { type: string }, type?: { name?: string }, table?: { category?: string } }> }} meta
 * @param {{ args?: object }} [base] - The `Default` story
 * @returns {{ label: string, args: object }[]}
 */
export function matrixCells(meta, base = {}) {
	const baseline = { ...meta.args, ...base.args };
	const cells = [];
	for (const [name, argType] of Object.entries(meta.argTypes ?? {})) {
		if (argType.table?.category !== PROPS) continue;
		const control = typeof argType.control === "object" ? argType.control?.type : argType.control;
		const values = Array.isArray(argType.options) ? argType.options : control === "boolean" || argType.type?.name === "boolean" ? [true, false] : [];
		for (const value of values) cells.push({ label: `${name} = ${value}`, args: { ...baseline, [name]: value } });
	}
	return cells;
}

/**
 * The matrix as one WebC page: each cell's label, then the component with the cell's args.
 *
 * @param {string} tag
 * @param {{ label: string, args: object }[]} cells
 * @param {object} argTypes
 * @returns {string}
 */
export function renderMatrix(tag, cells, argTypes) {
	const cell = ({ label, args }) => `<div style="display: grid; gap: 0.5rem">\n\t<p><code>${label.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></p>\n\t<div>\n${indent(indent(renderStory(tag, args, argTypes)))}\n\t</div>\n</div>`;
	return `<div style="display: grid; gap: 1.5rem">\n${cells.map((entry) => indent(cell(entry))).join("\n")}\n</div>`;
}
