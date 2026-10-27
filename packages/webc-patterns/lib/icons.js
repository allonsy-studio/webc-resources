/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

/** A lowercase kebab name: `chevron-up`, `x2`. */
const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** The viewBox of a file that has none, and no numeric width and height. */
const VIEW_BOX = "0 0 24 24";

/** Presentation attributes of the root `<svg>` that move to a `<g>`, so a file's own paint survives. */
const PAINT = new Set([
	"clip-rule",
	"fill",
	"fill-opacity",
	"fill-rule",
	"opacity",
	"stroke",
	"stroke-dasharray",
	"stroke-dashoffset",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-miterlimit",
	"stroke-opacity",
	"stroke-width",
]);

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const ROOT = /<svg((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/i;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const quoted = (name) => `"${name}"`;

/** The attributes of a tag's attribute text, as `[name, value][]`. */
const attributes = (text) => [...text.matchAll(ATTRIBUTE)].map(([, name, double, single, bare]) => [name, double ?? single ?? bare ?? ""]);

/**
 * The parts of one SVG file an icon keeps: its viewBox, and its drawing as markup.
 * The viewBox is the file's own, else `0 0 width height` from a numeric `width` and `height`, else `0 0 24 24`.
 * The `<title>` and `<desc>` go, as the drawing is hidden from assistive tech. Scripts, `on*` attributes, and `javascript:` links go too.
 *
 * @param {string} text - The file's text
 * @param {string} file - The file's path, for errors
 * @returns {{ viewBox: string, body: string }}
 * @throws {Error} When the file has no `<svg>` element
 */
function parse(text, file) {
	const source = text.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/gi, "");
	const root = ROOT.exec(source);
	if (!root) throw new Error(`norn: icons: ${file} has no <svg> element.`);
	const own = attributes(root[1]);
	const size = (key) => own.find(([name]) => name.toLowerCase() === key)?.[1].trim().replace(/px$/, "");
	const [width, height] = [size("width"), size("height")];
	const sized = /^[\d.]+$/.test(width ?? "") && /^[\d.]+$/.test(height ?? "") ? `0 0 ${width} ${height}` : VIEW_BOX;
	const viewBox = size("viewbox") || sized;
	if (!/^\s*-?[\d.]+(?:[\s,]+-?[\d.]+){3}\s*$/.test(viewBox)) throw new Error(`norn: icons: ${file} has the viewBox "${viewBox}", which is not four numbers.`);
	const paint = own.filter(([name]) => PAINT.has(name.toLowerCase())).map(([name, value]) => ` ${name.toLowerCase()}="${value.replaceAll('"', "&quot;")}"`);
	let inner = "";
	if (!root[2]) {
		const start = root.index + root[0].length;
		const end = source.toLowerCase().lastIndexOf("</svg");
		inner = end < start ? "" : source.slice(start, end);
	}
	inner = inner
		.replace(/<(title|desc|script)\b[\s\S]*?<\/\1\s*>/gi, "")
		.replace(/<(?:title|desc|script)\b[^>]*\/>/gi, "")
		.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
		.replace(/\s+((?:xlink:)?href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, "")
		.trim();
	if (!inner) throw new Error(`norn: icons: ${file} has no drawing.`);
	return { viewBox, body: paint.length ? `<g${paint.join("")}>${inner}</g>` : inner };
}

/**
 * Give every id in an icon's drawing, and each reference to it, a prefix made from the icon's name.
 * Inlined icons share the page's one id space, so two icons that each define `id="a"`, as SVGO's `cleanupIds` leaves them, would clip, mask, and fill each other:
 * a reference resolves to the first element with the id, whichever icon it is in. The prefix is the same every time, so an icon used twice repeats its ids only with itself.
 * References are `url(#id)`, `href` and `xlink:href`, and the `#id` selectors of a `<style>` in the drawing.
 *
 * @param {string} markup - The drawing
 * @param {string} name - The icon's name, a lowercase kebab name
 * @returns {string}
 */
function scopeIds(markup, name) {
	const ids = [...new Set([...markup.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(([, double, single]) => double ?? single))].filter(Boolean);
	if (!ids.length) return markup;
	const prefix = `norn-icon-${name}-`;
	// The longest first, so an id that starts another is not matched as the shorter one.
	const any = ids
		.sort((a, b) => b.length - a.length)
		.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("|");
	const scoped = (_, before, id) => `${before}${prefix}${id}`;
	return markup
		.replace(new RegExp(`(\\sid\\s*=\\s*["'])(${any})(?=["'])`, "gi"), scoped)
		.replace(new RegExp(`(url\\(\\s*["']?#)(${any})(?=["']?\\s*\\))`, "gi"), scoped)
		.replace(new RegExp(`((?:xlink:)?href\\s*=\\s*["']#)(${any})(?=["'])`, "gi"), scoped)
		.replace(/<style\b[\s\S]*?<\/style\s*>/gi, (style) => style.replace(new RegExp(`(#)(${any})(?![\\w-])`, "g"), scoped));
}

/** The `{ src, mirror }` of one record entry, or an error naming the icon. */
function entry(name, value) {
	if (!NAME.test(name)) throw new Error(`norn: icons: ${quoted(name)} is not a lowercase kebab name, such as "chevron-up".`);
	const spec = typeof value === "string" ? { src: value } : value;
	if (!isObject(spec) || typeof spec.src !== "string" || !spec.src) throw new Error(`norn: icons: ${quoted(name)} must be a path to an SVG file, or { src, mirror }.`);
	const unknown = Object.keys(spec).filter((key) => key !== "src" && key !== "mirror");
	if (unknown.length) throw new Error(`norn: icons: ${quoted(name)} has an unknown option ${unknown.map(quoted).join(", ")}. Options: src, mirror.`);
	if (spec.mirror !== undefined && typeof spec.mirror !== "boolean") throw new Error(`norn: icons: the mirror option of ${quoted(name)} must be true or false.`);
	return { src: spec.src, mirror: spec.mirror === true };
}

/**
 * The icons an `icons` option names, read from disk.
 * A glob, or a list of globs, names each file after its basename without `.svg`. A record names each icon and gives its path, or `{ src, mirror }`.
 *
 * @param {unknown} option - The plugin's `icons` option
 * @param {string} root - The folder paths resolve against
 * @returns {Record<string, { viewBox: string, body: string, mirror: boolean }>} Icons by name
 * @throws {Error} On a bad option, a missing or unreadable file, a name that is not lowercase kebab, or two files with one name
 */
export function readIcons(option, root = process.cwd()) {
	if (option === undefined) return {};
	/** @type {Map<string, { src: string, file: string, mirror: boolean }>} */
	const found = new Map();
	const add = (name, src, file, mirror) => {
		if (found.has(name)) throw new Error(`norn: icons: two files are named ${quoted(name)}: ${found.get(name).src} and ${src}.`);
		found.set(name, { src, file, mirror });
	};

	if (typeof option === "string" || Array.isArray(option)) {
		const globs = [option].flat();
		if (!globs.length || globs.some((glob) => typeof glob !== "string" || !glob)) throw new Error("norn: `icons` must be a glob, a list of globs, or a record of icon names to SVG files.");
		for (const glob of globs) {
			for (const match of fs.globSync(glob, { cwd: root }).sort()) {
				const file = path.resolve(root, match);
				if (fs.statSync(file).isDirectory()) continue;
				if (path.extname(file).toLowerCase() !== ".svg") throw new Error(`norn: icons: ${match} is not an SVG file. Match .svg files only.`);
				const name = path.basename(file, path.extname(file));
				if (!NAME.test(name)) throw new Error(`norn: icons: ${match} names the icon ${quoted(name)}, which is not a lowercase kebab name. Rename the file, or use a record.`);
				add(name, match, file, false);
			}
		}
	} else if (isObject(option)) {
		for (const [name, value] of Object.entries(option)) {
			const { src, mirror } = entry(name, value);
			const file = path.resolve(root, src);
			if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`norn: icons: ${quoted(name)} points at ${src}, which is not a file.`);
			add(name, src, file, mirror);
		}
	} else {
		throw new Error("norn: `icons` must be a glob, a list of globs, or a record of icon names to SVG files.");
	}

	return Object.fromEntries(
		[...found].map(([name, { src, file, mirror }]) => {
			const { viewBox, body } = parse(fs.readFileSync(file, "utf8"), src);
			return [name, { viewBox, body: scopeIds(body, name), mirror }];
		}),
	);
}
