/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { audit, launch, listsNeedingRole, pagesOf, serve } from "../lib/browser.js";
import { between, buildFixture, namedBetween, pagesIn } from "../lib/build.js";
import { sharedChecks } from "../lib/checks.js";

const here = import.meta.dirname;

describe("workspaces fixture", () => {
	let output;
	let pages;

	before(() => {
		output = buildFixture(here);
		pages = pagesIn(output);
	});

	sharedChecks({ test, assert, getPages: () => pages, getOutput: () => output });

	test("one page per workspace, and none for the excluded one", () => {
		assert.deepEqual(Object.keys(pages).sort(), ["/", "/plugin-a/", "/plugin-b/"]);
		assert.ok(!Object.values(pages).some((html) => html.includes("@example/internal")));
	});

	test("the home page indexes the workspaces in the mono face", () => {
		const html = pages["/"];
		const hero = between(html, "<norn-hero>", "</norn-hero>");
		assert.ok(hero.includes('<a href="#packages" data-variant="primary">Browse packages</a>') && hero.includes('<norn-code-block id="install">'));
		const index = between(html, '<norn-section id="packages"', "</norn-section>");
		assert.ok(index.includes('style="--norn-card-title-face: mono"'));
		assert.deepEqual([...index.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((match) => [match[1], match[2]]), [
			["/plugin-a/", "@example/plugin-a"],
			["/plugin-b/", "@example/plugin-b"],
		]);
		assert.ok(index.includes("The first plugin.") && index.includes("The second plugin."));
	});

	test("a workspace page renders its README without the front matter or the first heading", () => {
		const html = pages["/plugin-a/"];
		assert.ok(html.includes("<h1>@example/plugin-a</h1>") && html.includes("<p>The first plugin.</p>"));
		assert.ok(html.includes("The first plugin's readme."));
		assert.ok(!html.includes("ignored") && !html.includes("<h1>plugin-a</h1>"));
		assert.equal((html.match(/<norn-code-block>/g) ?? []).length, 1);
	});

	test("a workspace page prefers SKILL.md to README.md", () => {
		const html = pages["/plugin-b/"];
		assert.ok(html.includes("The second plugin's skill page, preferred over the readme."));
		assert.ok(!html.includes("loses to SKILL.md"));
	});

	test("the sidebar lists the workspaces and marks the current one", () => {
		const nav = namedBetween(pages["/plugin-b/"], "nav", "Packages", "</nav>");
		assert.deepEqual([...nav.matchAll(/<a href="([^"]+)"[^>]*><span>([^<]+)<\/span><\/a>/g)].map((match) => match[2]), ["@example/plugin-a", "@example/plugin-b"]);
		assert.ok(nav.includes('<a href="/plugin-b/" aria-current="page"><span>@example/plugin-b</span></a>'));
	});
});

describe("workspaces fixture in a browser", () => {
	let output;
	let server;
	let browser;

	before(async () => {
		output = buildFixture(here);
		server = await serve(output);
		browser = await launch();
	});

	after(async () => {
		await browser?.close();
		await server?.close();
	});

	test("lists that lose their markers keep their list semantics", async () => {
		const page = await browser.newPage();
		for (const url of pagesOf(output)) {
			await page.goto(server.url + url);
			assert.deepEqual(await listsNeedingRole(page), [], url);
		}
		await page.close();
	});

	test("every page passes axe in light, dark, and forced colors", async () => {
		assert.deepEqual(await audit(browser, server.url, pagesOf(output)), []);
	});
});
