/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

import markdownIt from "markdown-it";

import { callouts, scrollTables } from "../markdown.js";

/** The code sample's Markdown add-on, when `@allons-y/webc-code-sample` is installed: fences render as `norn-code-block`. Without it they stay `<pre><code>`. */
const highlightFences = await import("@allons-y/webc-code-sample/markdown").then(
	(markdown) => markdown.highlightFences,
	(error) => {
		if (error?.code === "ERR_MODULE_NOT_FOUND" && String(error.message).includes("@allons-y/webc-code-sample")) return null;
		throw error;
	},
);

/** @param {string} file */
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** Manifests matched by workspace patterns, relative to the root. */
const manifests = (root, patterns) =>
	fs.globSync(
		patterns.map((pattern) => `${pattern}/package.json`),
		{ cwd: root, exclude: (name) => name === "node_modules" },
	);

/** Front matter and the first heading come off: the page has its own title. */
const body = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^\s*# .*\n/, "");

/**
 * One entry per workspace of the repository: its package.json and its page,
 * the workspace's SKILL.md or else its README.md, rendered with the Markdown add-ons.
 *
 * @param {{ root: string }} options - The project root, where the `workspaces` field lives
 * @returns {{ name: string, title: string, description?: string, slug: string, url: string, html: string }[]}
 */
export function buildWorkspaces({ root }) {
	const md = markdownIt();
	highlightFences?.(md);
	scrollTables(md);
	callouts(md);
	const { workspaces = [] } = read(path.join(root, "package.json"));
	const patterns = Array.isArray(workspaces) ? workspaces : (workspaces.packages ?? []);
	const excluded = new Set(manifests(root, patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1))));
	return manifests(
		root,
		patterns.filter((pattern) => !pattern.startsWith("!")),
	)
		.filter((file) => !excluded.has(file))
		.sort()
		.map((file) => {
			const pkg = read(path.join(root, file));
			const dir = path.join(root, path.dirname(file));
			const source = ["SKILL.md", "README.md"].map((name) => path.join(dir, name)).find(fs.existsSync);
			const slug = pkg.name.split("/").pop();
			return {
				name: pkg.name,
				title: pkg.name,
				description: pkg.description,
				slug,
				url: `/${slug}/`,
				html: source ? md.render(body(fs.readFileSync(source, "utf8"))) : "",
			};
		});
}
