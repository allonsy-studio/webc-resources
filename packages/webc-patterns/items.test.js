/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// One shape for every item a component or layout takes: `href`, `title`, `description`.
// Each test gives the new shape and the old one, and checks that only the new one renders.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { WebC } from "@11ty/webc";

import { adjacent } from "./index.js";
import { headings } from "./markdown.js";
import { compiles } from "./plugin.js";

/** Compiled `.webc` files in a folder of this package, by tag: run the build first (`yarn test` does). */
const webcIn = (folder) =>
	Object.fromEntries(
		fs
			.readdirSync(path.join(import.meta.dirname, folder))
			.filter((file) => file.endsWith(".webc"))
			.map((file) => [file.slice(0, -5), path.join(import.meta.dirname, folder, file)]),
	);

const components = webcIn("components");
const layouts = webcIn("layouts");

/** The helpers the layouts call, with no plugin. */
const HELPERS = { nornCompiles: compiles, nornAdjacent: adjacent, nornHeadings: headings, nornHook: () => "", url: (value) => value, getBundleFileUrl: () => "/bundle/x" };

/**
 * Compile markup with every component defined and the layout helpers set.
 *
 * @param {string} content - WebC markup
 * @param {object} [data] - Page data
 * @returns {Promise<string>} The HTML
 */
async function render(content, data = {}) {
	const page = new WebC();
	page.setBundlerMode(true);
	for (const [name, helper] of Object.entries(HELPERS)) page.setHelper(name, helper);
	page.defineComponents(components);
	page.setContent(content);
	return (await page.compile({ data: { page: { url: "/here/" }, ...data } })).html;
}

/** Every list prop, empty, as the plugin hands them. */
const LISTS = { lang: "en", nav: [], features: [], packages: [], docs: [], workspaces: [], footer: { badges: [], groups: [] } };

/**
 * A layout's markup, without its front matter, rendered with props.
 *
 * @param {string} name - A layout name, such as `norn-docs`
 * @param {object} norn - The layout props
 * @param {object} [data] - More page data
 */
const layout = (name, norn, data = {}) => render(fs.readFileSync(layouts[name], "utf8").replace(/^---\n[\s\S]*?\n---\n/, ""), { content: "", norn: { ...LISTS, ...norn }, ...data });

/** A WebC attribute value holding a JSON expression. */
const attr = (value) => JSON.stringify(value).replaceAll('"', "&quot;");

test("norn-breadcrumbs links an item by its href, and an item with only url gets no link", async () => {
	const html = await render(`<norn-breadcrumbs :@items="${attr([{ href: "/new/", title: "New" }, { url: "/old/", title: "Old" }])}"></norn-breadcrumbs>`);
	assert.match(html, /<a href="\/new\/">New<\/a>/);
	assert.ok(html.includes(">Old</a>") && !html.includes('href="/old/"'), html);
});

test("norn-base links its header and footer items by href, and an item with only url gets no link", async () => {
	const html = await layout("norn-base", {
		nav: [{ href: "/nav-new/", title: "Nav new" }, { url: "/nav-old/", title: "Nav old" }],
		footer: { badges: [], groups: [{ heading: "Links", links: [{ href: "/foot-new/", title: "Foot new" }, { url: "/foot-old/", title: "Foot old" }] }] },
	});
	assert.match(html, /<a href="\/nav-new\/"><span>Nav new<\/span><\/a>|<a href="\/nav-new\/">Nav new<\/a>/);
	assert.match(html, /<a href="\/foot-new\/">Foot new<\/a>/);
	assert.ok(!html.includes('href="/nav-old/"') && !html.includes('href="/foot-old/"'), "no link from url");
	assert.ok(html.includes("Nav old") && html.includes("Foot old"), "the titles still show");
});
