/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

/** Where the org's studio assets live when no local checkout is given. */
const RAW = "https://raw.githubusercontent.com/allonsy-studio/.github/main/assets";

/**
 * Read a studio asset from a local checkout of the org's `.github` repository (`STUDIO_ASSETS`, its `assets` folder), else from GitHub.
 *
 * @param {"svg" | "fonts"} kind
 * @param {string} name
 * @returns {Promise<Buffer>}
 */
export async function readAsset(kind, name) {
	const local = process.env.STUDIO_ASSETS;
	if (local) return fs.readFileSync(path.join(local, kind, name));
	const response = await fetch(`${RAW}/${kind}/${name}`);
	if (!response.ok) throw new Error(`${RAW}/${kind}/${name}: ${response.status}. Set STUDIO_ASSETS to a local checkout's assets folder to build offline.`);
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
