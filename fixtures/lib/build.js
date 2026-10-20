/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const eleventy = path.resolve(path.dirname(createRequire(import.meta.url).resolve("@11ty/eleventy")), "..", "cmd.cjs");

/**
 * Build a fixture project in its own process, which Eleventy needs for a clean bundle state.
 *
 * @param {string} fixture - The fixture's project directory
 * @param {{ output?: string, prefix?: string, env?: Record<string, string>, config?: string }} [options] - `output` is relative to the site directory; `config` is relative to the fixture
 * @returns {string} The output directory
 */
export function buildFixture(fixture, { output = "_site", prefix = "", env = {}, config = "src/eleventy.config.js" } = {}) {
	const out = path.join(fixture, "src", output);
	fs.rmSync(out, { recursive: true, force: true });
	execFileSync(process.execPath, [eleventy, `--config=${config}`, "--quiet"], {
		cwd: fixture,
		env: { ...process.env, PATH_PREFIX: prefix, SITE_OUTPUT: output, ...env },
		stdio: "pipe",
	});
	return out;
}

/** Read a built file. */
export const read = (output, ...parts) => fs.readFileSync(path.join(output, ...parts), "utf8");

/** Every page's HTML by URL path, such as `/usage/`. */
export function pagesIn(output) {
	const pages = {};
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) walk(path.join(dir, entry.name));
			else if (entry.name === "index.html") pages[`/${path.relative(output, dir).split(path.sep).join("/")}/`.replace("//", "/")] = fs.readFileSync(path.join(dir, entry.name), "utf8");
		}
	};
	walk(output);
	return pages;
}

/** The stylesheets a page links, in head order. */
export const sheets = (html) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((match) => match[1]);

/** The page's bundle stylesheets as text: the foundation bucket first, then the page's own. */
export const bundles = (output, html) => sheets(html).filter((href) => href.startsWith("/bundle/")).map((href) => read(output, href));

/** All of a page's CSS, bundles and project sheet. */
export const allCss = (output, html) => sheets(html).map((href) => read(output, href)).join("\n");

/** The contents of `<head>`. */
export const headOf = (html) => html.match(/<head>([\s\S]*?)<\/head>/)[1];

/** Matches `<name` for each opening tag in the markup. */
export const tagNames = (html) => [...html.matchAll(/<([a-z][a-z0-9-]*)/g)].map((match) => match[1]);

/** The text of an element by its opening tag, such as `<footer>`. */
export const between = (html, open, close) => html.slice(html.indexOf(open), html.indexOf(close, html.indexOf(open)) + close.length);

/** The text of the element with this id, with its tags stripped and its spaces collapsed, or undefined without one. */
export function textOf(html, id) {
	const at = html.indexOf(` id="${id}"`);
	if (at === -1) return undefined;
	const start = html.lastIndexOf("<", at);
	const name = html.slice(start + 1).match(/^[a-z][a-z0-9-]*/)[0];
	const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, "g");
	tags.lastIndex = start;
	let depth = 0;
	for (const tag of html.matchAll(tags)) {
		if (tag.index < start) continue;
		depth += tag[1] ? -1 : 1;
		if (depth === 0) {
			const inner = html.slice(html.indexOf(">", start) + 1, tag.index);
			return inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
		}
	}
	return undefined;
}

/** Where the first `<tag>` named through `aria-labelledby` by this text opens, or -1. */
export function labelledBy(html, tag, name) {
	for (const match of html.matchAll(new RegExp(`<${tag}\\b[^>]*\\saria-labelledby="([^"]+)"`, "g"))) {
		if (textOf(html, match[1]) === name) return match.index;
	}
	return -1;
}

/** The markup of the `<tag>` named through `aria-labelledby` by this text, up to `close`, as `between` gives it. */
export function namedBetween(html, tag, name, close) {
	const start = labelledBy(html, tag, name);
	return start === -1 ? "" : html.slice(start, html.indexOf(close, start) + close.length);
}
