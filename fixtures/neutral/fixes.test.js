/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* global document, getComputedStyle, requestAnimationFrame, scrollY, window */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { audit, launch, serve } from "../lib/browser.js";

const here = import.meta.dirname;
const eleventy = path.resolve(path.dirname(createRequire(import.meta.url).resolve("@11ty/eleventy")), "..", "cmd.cjs");
const output = path.join(here, "_site-fixes");
const read = (...parts) => fs.readFileSync(path.join(output, ...parts), "utf8");

/** The computed values of some properties of the first element a selector finds. */
const computed = (page, selector, properties) =>
	page.$eval(
		selector,
		(element, names) => {
			const style = getComputedStyle(element);
			return Object.fromEntries(names.map((name) => [name, style[name]]));
		},
		properties,
	);

/** What a list, a section, an article, or a column sets on itself, apart from its width. */
const BOX = ["display", "position", "listStyleType", "paddingBlockStart", "paddingBlockEnd", "paddingInlineStart", "marginBlockStart", "marginBlockEnd", "rowGap", "columnGap", "gridTemplateRows", "gridRowStart", "gridRowEnd", "flexDirection", "borderBlockStartWidth", "backgroundColor", "textAlign"];

describe("the component fixes, built from content with only the data a page names", () => {
	let server;
	let browser;

	before(async () => {
		fs.rmSync(output, { recursive: true, force: true });
		execFileSync(process.execPath, [eleventy, "--config=variants/fixes/eleventy.config.js", "--quiet"], { cwd: here, env: { ...process.env, PATH_PREFIX: "" }, stdio: "pipe" });
		server = await serve(output);
		browser = await launch();
	});

	after(async () => {
		await browser?.close();
		await server?.close();
		fs.rmSync(output, { recursive: true, force: true });
	});

	/** Open a built page, run the check, and close it. */
	async function onPage(url, check, options = {}) {
		const page = await browser.newPage(options);
		try {
			await page.goto(server.url + url);
			await check(page);
		} finally {
			await page.close();
		}
	}

	test("a list, a section, an article, and a fact-list column inside card-grid, a section in main, card, and footer keep their standalone styles", async () => {
		await onPage("/containers/", async (page) => {
			for (const [label, plain, nested] of [
				["a list in a card of a card-grid", "#plain-ul", "#grid-ul"],
				["its items", "#plain-li", "#grid-li"],
				["and what the items hold", "#plain-span", "#grid-span"],
				["a section in a section", "#plain-section", "#section-section"],
				["an article in a card", "#plain-article", "#card-article"],
				["a fact-list column in a footer", "#plain-tags", "#footer-tags"],
				["its list", "#plain-tags > ul", "#footer-tags > ul"],
			]) {
				assert.deepEqual(await computed(page, nested, BOX), await computed(page, plain, BOX), label);
			}
		});
	});

	test("norn-toc marks the section in view, for an id with a non-ASCII letter or a literal percent sign too", async () => {
		await onPage("/toc-ids/", async (page) => {
			await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
			const frames = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
			const current = () => page.$$eval('norn-toc a[aria-current="location"]', (links) => links.map((link) => link.textContent));
			for (const [id, text] of [["first", "First"], ["über-uns", "Über uns"], ["100%-sure", "A literal percent sign"], ["last", "Last"]]) {
				await page.evaluate((target) => window.scrollTo(0, document.getElementById(target).getBoundingClientRect().top + scrollY), id);
				await frames();
				assert.deepEqual(await current(), [text], `with "${id}" at the top`);
			}
		});
	});

	test("the containers still style the markup they own", async () => {
		await onPage("/containers/", async (page) => {
			assert.equal((await computed(page, "#grid > ul", ["display"])).display, "grid", "the card-grid's own list");
			assert.equal((await computed(page, "#section", ["paddingBlockStart"])).paddingBlockStart, "32px", "a section in main has the section padding");
			assert.equal((await computed(page, "#card > article", ["paddingBlockStart"])).paddingBlockStart, "20px", "the card's own article");
			assert.equal((await computed(page, "#footer > footer > div:first-child", ["display"])).display, "grid", "the footer's own columns");
		});
	});

	test("a callout or a notice inside another keeps its own color, and the one around it keeps its", async () => {
		await onPage("/nested/", async (page) => {
			// A callout draws its color in the label, a notice in its bar.
			const rule = (selector) => computed(page, selector, ["borderInlineStartColor"]);
			const label = (selector) => computed(page, `${selector} > div > p:first-child`, ["color"]);
			assert.deepEqual(await label("#note-outer"), await label("#note-alone"), "a note around a tip is still a note");
			assert.deepEqual(await label("#tip-inner"), await label("#tip-alone"), "and the tip inside it is a tip");
			assert.notDeepEqual(await label("#note-alone"), await label("#tip-alone"), "the two differ");
			assert.deepEqual(await rule("#info-outer > div"), await rule("#info-alone > div"), "information around a warning is still information");
			assert.deepEqual(await rule("#warning-inner > div"), await rule("#warning-alone > div"), "and the warning inside it is a warning");
			assert.notDeepEqual(await rule("#info-alone > div"), await rule("#warning-alone > div"), "the two differ");
		});
	});

	test("a segmented control and a theme toggle are as wide with reduced motion as without", async () => {
		const widths = {};
		for (const reducedMotion of ["reduce", "no-preference"]) {
			await onPage(
				"/segmented/",
				async (page) => {
					widths[reducedMotion] = await page.evaluate(() => [...document.querySelectorAll("#control, #control label, #toggle, #toggle label")].map((element) => element.getBoundingClientRect().width));
				},
				{ reducedMotion },
			);
		}
		assert.ok(widths.reduce.length === 8 && widths.reduce.every((width) => width > 0), "the labels and the controls are there");
		assert.deepEqual(widths.reduce, widths["no-preference"]);
	});

	test("each layout with only a title has no link without a name, no empty heading, and no empty landmark", async () => {
		const layouts = ["base", "docs", "docs-home", "landing", "workspaces", "workspace"];
		const violations = await audit(
			browser,
			server.url,
			layouts.map((layout) => `/bare-${layout}/`),
		);
		assert.deepEqual(
			violations.filter((line) => / (link-name|empty-heading|landmark-[a-z-]+|region|aria-[a-z-]+):/.test(line)),
			[],
		);
		for (const layout of layouts) {
			const html = read(`bare-${layout}`, "index.html");
			assert.ok(!/<a [^>]*rel="home"/.test(html), `${layout}: no brand link`);
			assert.ok(!/<h1>\s*<span>\s*<\/span>/.test(html) && !/<strong>\s*<\/strong>/.test(html), `${layout}: no empty name`);
		}
	});

	test("a page in a right-to-left language gets dir=rtl, any other gets ltr, and a dir prop wins", async () => {
		assert.ok(read("lang-ar", "index.html").includes('<html lang="ar" dir="rtl">'));
		assert.ok(read("lang-en", "index.html").includes('<html lang="en" dir="ltr">'));
		assert.ok(read("lang-ar-ltr", "index.html").includes('<html lang="ar" dir="ltr">'), "an explicit ltr on an Arabic page");
		assert.ok(read("dir-rtl", "index.html").includes('<html lang="en" dir="rtl">'), "an explicit rtl on an English page");
		await onPage("/lang-ar/", async (page) => {
			assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).direction), "rtl");
			assert.equal(await page.evaluate(() => document.documentElement.matches(":dir(rtl)")), true);
		});
	});

	test("Markdown heading ids keep their script, and stay unique across two Markdown blocks on one page", () => {
		const ids = [...read("md-blocks", "index.html").matchAll(/<h2 id="([^"]+)"/g)].map((match) => match[1]);
		assert.deepEqual(ids, ["مرحبا-بالعالم", "same", "日本語の見出し", "same-2"]);
	});

	test("the theme toggle script comes with true and 'true', and not with 'false'", () => {
		const SCRIPT = 'localStorage.getItem("color-scheme")';
		assert.ok(read("toggle-true", "index.html").includes(SCRIPT));
		assert.ok(read("toggle-string", "index.html").includes(SCRIPT));
		assert.ok(!read("toggle-false", "index.html").includes(SCRIPT));
	});

	test("code samples in the same language get distinct tab names, and one panel shows at a time", async () => {
		await onPage("/tabs/", async (page) => {
			const state = (id) =>
				page.$eval(
					id,
					(element) => ({
						tabs: [...element.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent),
						selected: [...element.querySelectorAll('[role="tab"]')].map((tab) => tab.getAttribute("aria-selected")),
						shown: [...element.querySelectorAll('[role="tabpanel"]')].map((panel) => !panel.hidden),
					}),
				);
			assert.deepEqual(await state("#shells"), { tabs: ["sh", "sh 2"], selected: ["true", "false"], shown: [true, false] });
			assert.deepEqual(await state("#three"), { tabs: ["sh", "js", "sh 2", "sh 3"], selected: ["true", "false", "false", "false"], shown: [true, false, false, false] });
			assert.deepEqual((await state("#named")).tabs, ["npm", "yarn"], "named tabs are as they were");
			await page.locator("#shells").getByRole("tab", { name: "sh 2" }).click();
			assert.deepEqual(await state("#shells"), { tabs: ["sh", "sh 2"], selected: ["false", "true"], shown: [false, true] });
			await page.locator("#three").getByRole("tab", { name: "sh 3" }).click();
			assert.deepEqual((await state("#three")).shown, [false, false, false, true]);
			await page.locator("#three").getByRole("tab", { name: "sh 3" }).press("ArrowRight");
			assert.deepEqual((await state("#three")).shown, [true, false, false, false], "the arrow keys wrap, one panel at a time");
		});
	});

	test("a heading wrapped in norn-heading-anchor has the size, face, and link color of a plain one in each container", async () => {
		await onPage("/headings/", async (page) => {
			const HEADING = ["fontSize", "fontFamily", "fontWeight", "lineHeight"];
			const LINK = ["color", "fontSize", "textDecorationLine", "textDecorationStyle"];
			assert.deepEqual(await computed(page, "#section-wrapped h2", HEADING), await computed(page, "#section-plain h2", HEADING), "a section in main");
			for (const [label, plain, wrapped] of [
				["card", "#card-plain", "#card-wrapped"],
				["card in a mono card-grid", "#mono-plain", "#mono-wrapped"],
			]) {
				assert.deepEqual(await computed(page, `${wrapped} h3`, HEADING), await computed(page, `${plain} h3`, HEADING), `${label}: the heading`);
				assert.deepEqual(await computed(page, `${wrapped} h3 a`, LINK), await computed(page, `${plain} h3 a`, LINK), `${label}: the link`);
			}
		});
	});
});
