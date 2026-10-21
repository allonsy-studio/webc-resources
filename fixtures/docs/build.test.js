/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { audit, launch, listsNeedingRole, pagesOf, serve } from "../lib/browser.js";
import { between, buildFixture, labelledBy, namedBetween, pagesIn } from "../lib/build.js";
import { sharedChecks } from "../lib/checks.js";

const here = import.meta.dirname;
const REPO = "https://github.com/allonsy-studio/webc-resources";

describe("docs fixture", () => {
	let output;
	let pages;

	before(() => {
		output = buildFixture(here);
		pages = pagesIn(output);
	});

	sharedChecks({ test, assert, getPages: () => pages, getOutput: () => output });

	test("one page per Markdown file, plus the home page", () => {
		assert.deepEqual(Object.keys(pages).sort(), ["/", "/getting-started/", "/reference/", "/usage/"]);
	});

	test("the pages use the shipped layouts, from the configured layouts folder, with no file of the project's and no layout listed as a page", () => {
		assert.ok(!fs.existsSync(path.join(here, "src", "_layouts")), "the project keeps no layout");
		assert.ok(!fs.existsSync(path.join(output, "src", "_layouts")), "no stray page for a layout outside the input folder");
		assert.ok(pages["/"].includes("<norn-hero>") && pages["/"].includes('<norn-section id="docs">'), "norn-docs-home");
		for (const url of ["/getting-started/", "/usage/", "/reference/"]) assert.ok(pages[url].includes("<norn-sidebar-layout>") && pages[url].includes("<norn-rich-text data-pagefind-body>"), `${url}: norn-docs`);
	});

	test("the home page links the first docs page and indexes every page with its description", () => {
		const html = pages["/"];
		const hero = between(html, "<norn-hero>", "</norn-hero>");
		assert.ok(hero.includes('<a href="/getting-started/" data-variant="primary">Read the docs</a>') && hero.includes(`<a href="${REPO}" data-variant="quiet">View on GitHub</a>`));
		assert.ok(hero.includes('<norn-code-block id="install">') && hero.includes("npm install fixture-docs"));
		const index = between(html, '<norn-section id="docs"', "</norn-section>");
		assert.ok(index.includes("<h2>Documentation</h2>"));
		assert.ok(index.includes("<dl data-norn-contents>") && !index.includes("<norn-card"), "a contents list, not cards");
		assert.deepEqual([...index.matchAll(/<dt><a href="([^"]+)">([^<]+)<\/a><\/dt>/g)].map((match) => [match[1], match[2]]), [
			["/getting-started/", "Getting started"],
			["/usage/", "Usage"],
			["/reference/", "Reference"],
		]);
		assert.ok(index.includes("Install the project and run it once.") && !index.includes("--norn-card-title-face"));
	});

	test("the sidebar marks the current page, and the pager links the neighbors", () => {
		for (const [url, title] of [["/getting-started/", "Getting started"], ["/usage/", "Usage"], ["/reference/", "Reference"]]) {
			const html = pages[url];
			const nav = namedBetween(html, "nav", "Documentation", "</nav>");
			assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1);
			assert.ok(nav.includes(`<a href="${url}" aria-current="page"><span>${title}</span></a>`));
			assert.ok(html.includes(`<h1>${title}</h1>`));
		}
		assert.ok(pages["/getting-started/"].includes('rel="next" href="/usage/"') && !pages["/getting-started/"].includes('rel="prev"'));
		assert.ok(pages["/usage/"].includes('rel="prev" href="/getting-started/"') && pages["/usage/"].includes('rel="next" href="/reference/"'));
		assert.ok(pages["/reference/"].includes('rel="prev" href="/usage/"') && !pages["/reference/"].includes('rel="next"'));
	});

	test("GitHub-style alerts in Markdown render as callouts", () => {
		const html = pages["/getting-started/"];
		assert.match(html, /<norn-callout>\s*<div role="note" data-variant="tip">/);
		assert.match(html, /<div role="note" data-variant="warning">[\s\S]*?<p>Node 22 or later is required\.<\/p>/);
		assert.ok(!html.includes("[!TIP]") && !html.includes("[!WARNING]"));
	});

	test("a docs page keeps the compiled Markdown as it is: norn-base does not render it twice", () => {
		const html = pages["/getting-started/"];
		assert.equal((html.match(/<norn-callout>/g) ?? []).length, 2);
		assert.equal((html.match(/<div role="note"/g) ?? []).length, 2);
		assert.equal((html.match(/<norn-code-block>/g) ?? []).length, 1);
		assert.equal((html.match(/<figure>/g) ?? []).length, 1);
		assert.equal((html.match(/<norn-copy-button>/g) ?? []).length, 1);
		assert.equal((html.match(/<h1>/g) ?? []).length, 1);
	});

	test("a docs page has search above the sidebar list, indexes only its body, and lists its sections when it has two or more", () => {
		for (const url of ["/getting-started/", "/usage/", "/reference/"]) {
			const nav = namedBetween(pages[url], "nav", "Documentation", "</nav>");
			assert.ok(labelledBy(nav, "search", "Search the docs") !== -1 && labelledBy(nav, "search", "Search the docs") < nav.indexOf("<ul>"), `${url}: search comes first`);
			assert.ok(nav.includes('<input type="hidden" name="sites" value="projects.allons-y.studio">'));
			assert.equal((pages[url].match(/data-pagefind-body/g) ?? []).length, 1);
			assert.ok(pages[url].includes("<norn-rich-text data-pagefind-body>"));
		}
		const toc = namedBetween(pages["/reference/"], "nav", "On this page", "</nav>");
		assert.ok(toc.includes('<a href="#options">Options</a>') && toc.includes('<a href="#install-with-your-package-manager">Install with your package manager</a>'));
		assert.ok(pages["/reference/"].includes('<h2 id="options"><a href="#options">Options</a></h2>'));
		assert.ok(!pages["/usage/"].includes("On this page"), "no contents for a page with fewer than two sections");
	});

	test("the props mapping sets a relative share image, which resolves against the canonical URL", () => {
		for (const html of Object.values(pages)) {
			assert.ok(html.includes('<meta property="og:image" content="https://projects.allons-y.studio/webc-resources/assets/img/card.png">'));
			assert.ok(html.includes('<meta property="og:image:alt" content="The docs fixture">'));
			assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
		}
	});

	test("the header links the docs and the repository", () => {
		const nav = namedBetween(pages["/usage/"], "nav", "Primary", "</nav>");
		assert.deepEqual([...nav.matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)].map((match) => match[2].replace(/<norn-icon>[\s\S]*?<\/norn-icon>/, "").trim()), ["Docs", "GitHub"]);
		assert.match(nav, /<a href="\/getting-started\/"><norn-icon>\s*<svg [^>]*aria-hidden="true"/, "Docs carries the book icon");
	});

	test("a released package shows its npm version and download badges in the project accent", () => {
		const footer = between(pages["/"], "<norn-footer>", "</norn-footer>");
		const badges = between(footer, "<p data-badges>", "</p>");
		assert.ok(badges.includes('<img alt="npm version of fixture-docs" src="https://img.shields.io/npm/v/fixture-docs?logo=npm&amp;labelColor=black&amp;color=%232346d4" width="105" height="20" loading="lazy">'));
		assert.ok(badges.includes('alt="weekly npm downloads of fixture-docs" src="https://img.shields.io/npm/dw/fixture-docs?'));
		assert.equal((badges.match(/ width="\d+" height="20"/g) ?? []).length, 2, "both badges reserve their size");
		assert.ok(footer.indexOf("<p data-badges>") > footer.indexOf("<strong>") && footer.indexOf("<p data-badges>") < footer.indexOf("Licensed under"));
	});

	test("conduct and security links come from the project's own files, not Allons-y Studio's", () => {
		const help = between(pages["/"], "<strong>Help</strong>", "</nav>");
		assert.ok(help.includes(`<a href="${REPO}/blob/main/CODE_OF_CONDUCT.md">Code of conduct</a>`));
		assert.ok(help.includes(`<a href="${REPO}/blob/main/SECURITY.md">Security policy</a>`));
		assert.ok(!help.includes("allonsy-studio/.github"));
	});

	test("the Markdown body renders with its prose, fences, and literal template syntax", () => {
		assert.ok(pages["/reference/"].includes("<table>") && pages["/reference/"].includes("<blockquote>"));
		assert.ok(pages["/reference/"].includes('<code>plain &lt;text&gt; &amp; "quotes"\n</code>'), "a fence with no language stays plain");
		assert.ok(pages["/usage/"].includes("{{ not liquid }}"));
		assert.ok(pages["/usage/"].includes("<code>{{ not liquid }}</code>") || pages["/usage/"].includes("<code>{{ not liquid }}"));
		assert.equal((pages["/usage/"].match(/<norn-code-block>/g) ?? []).length, 2);
	});
});

describe("docs fixture in a browser", () => {
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

	test("without the Clipboard API there is no copy button, and nothing throws", async () => {
		const page = await browser.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }));
		await page.goto(server.url + "/getting-started/");
		assert.ok((await page.locator("norn-code-block").count()) > 0);
		assert.equal(await page.locator("norn-code-block button:visible").count(), 0);
		assert.deepEqual(errors, []);
		await page.close();
	});

	test("a sample with malformed token data stays plain and the others keep their copy button", async () => {
		const page = await browser.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.route("**/getting-started/", async (route) => {
			const response = await route.fetch();
			await route.fulfill({ response, body: (await response.text()).replace(/data-tokens="[^"]*"/, 'data-tokens="not json"') });
		});
		await page.goto(server.url + "/getting-started/");
		assert.equal(await page.locator("norn-code-block button:visible").count(), await page.locator("norn-code-block").count());
		assert.deepEqual(errors, []);
		await page.close();
	});

	test("the copy button strips the shell prompt", async () => {
		const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
		const page = await context.newPage();
		await page.goto(server.url + "/getting-started/");
		const button = page.locator("norn-code-block button").first();
		await button.click();
		assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "npm install @allons-y/fixture-docs\n");
		assert.equal((await button.textContent()).trim(), "Copied");
		assert.equal(await page.locator("norn-code-block norn-copy-button [role=status]").first().textContent(), "Copied");
		await context.close();
	});

	test("a wide Markdown table scrolls in its own named box, and the page never scrolls sideways", async () => {
		const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
		await page.goto(server.url + "/reference/");
		await page.$eval("norn-data-table table tr", (row) => row.append(...Array.from({ length: 6 }, () => Object.assign(document.createElement("td"), { textContent: "a_long_option_name" }))));
		await page.waitForFunction(() => document.querySelector("norn-data-table > div").getAttribute("role") === "region", null, { timeout: 5000 });
		assert.deepEqual(await page.$eval("norn-data-table > div", (box) => [box.tabIndex, box.getAttribute("aria-label")]), [0, "Option, Default"]);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
		await page.$$eval("norn-data-table td", (cells) => cells.filter((cell) => cell.textContent === "a_long_option_name").forEach((cell) => cell.remove()));
		await page.waitForFunction(() => !document.querySelector("norn-data-table > div").hasAttribute("tabindex"), null, { timeout: 5000 });
		await page.close();
	});

	test("norn-code-tabs: tabs over the samples, moved with the arrow keys, kept in step by group, and remembered", async () => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await context.newPage();
		await page.goto(server.url + "/reference/");
		const [install, remove] = [page.locator("norn-code-tabs").nth(0), page.locator("norn-code-tabs").nth(1)];
		assert.deepEqual(await install.getByRole("tab").allTextContents(), ["npm", "yarn", "pnpm"]);
		assert.equal(await remove.getByRole("tablist", { name: "Uninstall commands", exact: true }).count(), 1);
		assert.equal(await install.getByRole("tablist", { name: "Code samples", exact: true }).count(), 1, "the English default");
		const shown = (tabs) => tabs.locator("norn-code-block:visible").getAttribute("data-tab");
		assert.equal(await shown(install), "npm");
		await install.getByRole("tab", { name: "npm", exact: true }).focus();
		await page.keyboard.press("ArrowRight");
		assert.equal(await shown(install), "yarn");
		assert.equal(await page.evaluate(() => document.activeElement.textContent), "yarn");
		assert.equal(await shown(remove), "yarn", "the same group follows");
		await page.keyboard.press("End");
		assert.equal(await shown(install), "pnpm");
		assert.equal(await install.getByRole("tab", { name: "pnpm" }).getAttribute("tabindex"), "0");
		assert.equal(await install.getByRole("tab", { name: "npm", exact: true }).getAttribute("tabindex"), "-1");
		await page.reload();
		assert.equal(await shown(page.locator("norn-code-tabs").nth(0)), "pnpm", "remembered");
		await context.close();
	});

	test("the docs search lists results from the Pagefind index as the visitor types", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.route("**/pagefind/pagefind.js", (route) =>
			route.fulfill({
				contentType: "text/javascript",
				body: `export async function options() {}
export async function debouncedSearch() {
	return { results: [{ data: async () => ({ url: "/usage/", meta: { title: "Usage" }, excerpt: "Call the <mark>project</mark> from code." }) }] };
}`,
			}),
		);
		await page.goto(server.url + "/getting-started/");
		await page.waitForFunction(() => document.querySelector("norn-search").hasAttribute("data-live"));
		await page.getByRole("searchbox", { name: "Search the docs" }).fill("project");
		await page.locator("norn-search li a").first().waitFor();
		assert.deepEqual(await page.locator("norn-search li a").allTextContents(), ["Usage"]);
		assert.equal(await page.locator("norn-search [role=status]").textContent(), "1 result");
		await page.close();
	});

	test("without an index the docs search stays a plain form", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/getting-started/");
		await page.waitForTimeout(300);
		assert.equal(await page.locator("norn-search").getAttribute("data-live"), null);
		assert.equal(await page.getByRole("button", { name: "Search the docs" }).isVisible(), true);
		await page.close();
	});

	test("norn-code-tabs without a script shows every sample, stacked", async () => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto(server.url + "/reference/");
		assert.equal(await page.locator("norn-code-tabs").first().locator("norn-code-block:visible").count(), 3);
		assert.equal(await page.getByRole("tablist").count(), 0);
		await context.close();
	});

	test("the copy button sits above the code, never over it, and the code reads left to right in a right-to-left page", async () => {
		const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1280, height: 800 } });
		const page = await context.newPage();
		await page.goto(server.url + "/getting-started/");
		await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
		for (const sample of await page.locator("norn-code-block").all()) {
			const [button, pre] = [await sample.locator("button").boundingBox(), await sample.locator("pre").boundingBox()];
			assert.ok(button.y + button.height <= pre.y, "above the code");
			assert.equal(await sample.locator("pre").evaluate((pre) => getComputedStyle(pre).direction), "ltr");
		}
		await context.close();
	});
});
