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

/** A WebC attribute value holding a JSON expression, in parentheses so an object does not read as a block. */
const attr = (value) => `(${JSON.stringify(value).replaceAll('"', "&quot;")})`;

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

test("norn-side-nav links an item and its children by href, marks the current one, and an item with only url gets no link", async () => {
	const items = [
		{ href: "/here/", title: "New", children: [{ href: "/child-new/", title: "Child new" }, { url: "/child-old/", title: "Child old" }] },
		{ url: "/old/", title: "Old", children: [{ url: "/here/", title: "Old child" }] },
	];
	const html = await render(`<norn-side-nav :@items="${attr(items)}"></norn-side-nav>`);
	assert.match(html, /<a href="\/here\/" aria-current="page">/);
	assert.match(html, /<a href="\/child-new\/">/);
	for (const old of ["/old/", "/child-old/"]) assert.ok(!html.includes(`href="${old}"`), old);
	assert.equal(html.match(/aria-current=/g).length, 1, "an old child with the page's url marks nothing");
});

test("norn-pager links prev and next by href, and a neighbor with only url gets no link", async () => {
	const html = await render(`<norn-pager :@prev="${attr({ href: "/prev/", title: "Prev" })}" :@next="${attr({ href: "/next/", title: "Next" })}"></norn-pager>`);
	assert.ok(html.includes('<a rel="prev" href="/prev/">') && html.includes('<a rel="next" href="/next/">'), html);
	const old = await render(`<norn-pager :@prev="${attr({ url: "/prev/", title: "Prev" })}" :@next="${attr({ url: "/next/", title: "Next" })}"></norn-pager>`);
	assert.ok(old.includes('<a rel="prev">') && old.includes('<a rel="next">') && !old.includes("href="), old);
});

test("norn-docs links its docs, prev, and next by href, and nornAdjacent finds the neighbors by href", async () => {
	const docs = [{ href: "/a/", title: "A" }, { href: "/here/", title: "Here" }, { href: "/c/", title: "C" }];
	const html = await layout("norn-docs", { title: "Here", docs }, { page: { url: "/here/" } });
	assert.match(html, /<a href="\/here\/" aria-current="page">/, "the sidebar marks the page");
	assert.ok(html.includes('rel="prev" href="/a/"') && html.includes('rel="next" href="/c/"'), "the neighbors from docs");
	const given = await layout("norn-docs", { title: "Here", docs, prev: { href: "/p/", title: "P" }, next: { href: "/n/", title: "N" } }, { page: { url: "/here/" } });
	assert.ok(given.includes('rel="prev" href="/p/"') && given.includes('rel="next" href="/n/"'), "prev and next given");
	const old = await layout("norn-docs", { title: "Here", docs: docs.map(({ href: url, title }) => ({ url, title })) }, { page: { url: "/here/" } });
	assert.ok(!old.includes('href="/a/"') && !old.includes('href="/c/"') && !old.includes('rel="prev"') && !old.includes("aria-current"), "url items link nothing and have no neighbors");
});

test("norn-docs-home links its docs by href, and a page with only url gets no link", async () => {
	const html = await layout("norn-docs-home", { docs: [{ href: "/start/", title: "Start", description: "Begin." }, { url: "/old/", title: "Old" }] });
	assert.match(html, /<a href="\/start\/"[^>]*>[\s\S]*?Read the docs/, "the first page is the docs action");
	assert.ok(html.includes('<a href="/start/">Start</a>') && html.includes("<dd>Begin.</dd>"), "the contents list");
	assert.ok(!html.includes('href="/old/"'), "no link from url");
});

test("norn-workspaces-home lists its workspaces by href and title, and an old { url, name } item shows neither", async () => {
	const html = await layout("norn-workspaces-home", { workspaces: [{ href: "/alpha/", title: "@acme/alpha", description: "First." }, { url: "/zed/", name: "@acme/zed", description: "Last." }] });
	assert.match(html, /<h3><a href="\/alpha\/">@acme\/alpha<\/a><\/h3>/);
	assert.ok(!html.includes('href="/zed/"') && !html.includes("@acme/zed"), "no link and no label from url and name");
});

test("norn-workspace lists the workspaces in its sidebar by href and title, and an old { url, name } item shows neither", async () => {
	const workspaces = [{ href: "/here/", title: "@acme/alpha" }, { url: "/zed/", name: "@acme/zed" }];
	const html = await layout("norn-workspace", { workspaces, workspace: { name: "@acme/alpha", description: "First." } }, { page: { url: "/here/" } });
	assert.match(html, /<a href="\/here\/" aria-current="page"><span>@acme\/alpha<\/span><\/a>/);
	assert.ok(!html.includes('href="/zed/"') && !html.includes("@acme/zed"), "no link and no label from url and name");
	assert.match(html, /<h1>@acme\/alpha<\/h1>/, "the heading is the workspace's package name");
});

test("norn-landing titles its package cards by title, and a card with only name shows no label", async () => {
	const html = await layout("norn-landing", { packages: [{ title: "@acme/core", description: "The core.", href: "/core/" }, { name: "@acme/old", description: "The old one.", href: "/old/" }] });
	assert.ok(html.includes('<a href="/core/">@acme/core</a>') && html.includes("The core."), "the new card");
	assert.ok(!html.includes("@acme/old"), "no label from name");
});
