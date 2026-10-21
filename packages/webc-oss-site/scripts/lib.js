/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

/** Where the org's assets live when no local checkout is given. */
const RAW = "https://raw.githubusercontent.com/allonsy-studio/.github/main/assets";

/**
 * Read an asset from a local checkout of the org's `.github` repository (`OSS_ASSETS`, its `assets` folder), else from GitHub.
 *
 * @param {"svg" | "fonts"} kind
 * @param {string} name
 * @returns {Promise<Buffer>}
 */
export async function readAsset(kind, name) {
	const local = process.env.OSS_ASSETS;
	if (local) return fs.readFileSync(path.join(local, kind, name));
	const response = await fetch(`${RAW}/${kind}/${name}`);
	if (!response.ok) throw new Error(`${RAW}/${kind}/${name}: ${response.status}. Set OSS_ASSETS to a local checkout's assets folder to build offline.`);
	return Buffer.from(await response.arrayBuffer());
}

/**
 * Prepare an org SVG for inlining: drop the XML prolog, check it is plain markup, and add attributes.
 *
 * @param {string} source - SVG markup from the org's assets
 * @param {string} attributes - Attributes for the inline copy
 * @param {string} [viewBox] - Replaces the SVG's own viewBox, to crop it
 * @returns {string}
 * @throws {Error} When the markup is not a plain SVG
 */
export function prepare(source, attributes, viewBox) {
	const svg = source.replace(/<\?xml[^>]*\?>\s*/, "").trim();
	if (!svg.startsWith("<svg") || !svg.endsWith("</svg>") || /<(script|style|foreignObject)\b|\son\w+=/i.test(svg)) {
		throw new Error("An inline SVG must be plain markup: no script, style, foreignObject, or event handlers.");
	}
	if (viewBox && !/^<svg\b[^>]*\sviewBox="/.test(svg)) throw new Error("The SVG has no viewBox to crop.");
	const cropped = viewBox ? svg.replace(/^<svg\b[^>]*>/, (tag) => tag.replace(/\sviewBox="[^"]*"/, ` viewBox="${viewBox}"`)) : svg;
	return cropped.replace(/^<svg\b/, `<svg ${attributes}`);
}

/** The paint attributes a scheme may change. */
const PAINT = ["fill", "stroke"];

/**
 * Merge a light and a dark copy of one SVG into one that follows the page's color scheme.
 * The copies must be the same drawing: each tag matches its twin, and the only attributes that differ are `fill` and `stroke`. Those move into a `style` that reads `light-dark(light, dark)`.
 *
 * @param {string} light - The light copy, as `prepare` gives it
 * @param {string} dark - The dark copy, with the same attributes
 * @returns {string}
 * @throws {Error} When the copies differ in anything but paint
 */
export function merge(light, dark) {
	const tags = (svg) => svg.match(/<[^>]+>|[^<]+/g) ?? [];
	const [a, b] = [tags(light), tags(dark)];
	if (a.length !== b.length) throw new Error("The light and dark SVGs have a different number of tags.");
	const attributes = (tag) => Object.fromEntries([...tag.matchAll(/\s([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
	return a
		.map((tag, index) => {
			if (tag === b[index]) return tag;
			if (!tag.startsWith("<") || !b[index].startsWith("<")) throw new Error("The light and dark SVGs differ in their text.");
			const [one, two] = [attributes(tag), attributes(b[index])];
			const names = new Set([...Object.keys(one), ...Object.keys(two)]);
			const changed = [...names].filter((name) => one[name] !== two[name]);
			if (!changed.length || changed.some((name) => !PAINT.includes(name)) || tag.replace(/\s[\w:-]+="[^"]*"/g, "") !== b[index].replace(/\s[\w:-]+="[^"]*"/g, "")) throw new Error(`The light and dark SVGs differ in more than paint: ${tag.slice(0, 80)}`);
			const style = changed.map((name) => `${name}:light-dark(${one[name]},${two[name]})`).join(";");
			return tag.replace(new RegExp(`\\s(${changed.join("|")})="[^"]*"`, "g"), "").replace(/\s*(\/?)>$/, ` style="${style}"$1>`);
		})
		.join("");
}
