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
import { allCss, between, buildFixture, headOf, namedBetween, pagesIn, read } from "../lib/build.js";
import { sharedChecks } from "../lib/checks.js";

const here = import.meta.dirname;
const REPO = "https://github.com/allonsy-studio/webc-resources";

describe("landing fixture with the OSS site layer", () => {
	let output;
	let pages;

	before(() => {
		output = buildFixture(here);
		pages = pagesIn(output);
	});

	sharedChecks({ test, assert, getPages: () => pages, getOutput: () => output });

	test("the hero renders the name, tagline, lede, actions, chips, and the usage sample", () => {
		const html = pages["/"];
		const hero = between(html, "<norn-hero>", "</norn-hero>");
		assert.ok(hero.includes("<span>fixture-landing</span>"));
		assert.ok(hero.includes("<span>A fixture landing site for the OSS WebC packages</span>"));
		assert.ok(hero.includes("A fixture landing site that exercises every section of the OSS site page bodies."));
		const actions = namedBetween(hero, "nav", "Get started", "</nav>");
		assert.ok(actions.includes('<a href="#install" data-variant="primary">Get started</a>') && actions.includes(`<a href="${REPO}" data-variant="quiet">View on GitHub</a>`));
		const chips = [...between(hero, "<norn-tag-list>", "</norn-tag-list>").matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => match[1].replace(/<norn-svg-icon>[\s\S]*?<\/norn-svg-icon>|<\/?span>/g, "").trim());
		assert.deepEqual(chips, ["Free &amp; open source", "License: MPL-2.0", "Node 22+"]);
		assert.ok(hero.includes('<norn-code-block id="usage">') && hero.includes("<figcaption>example.js</figcaption>"));
	});

	test("the install, features, and packages sections follow, each under its own heading", () => {
		const html = pages["/"];
		assert.ok(html.includes('<norn-section id="install">') && html.includes("<h2>Install</h2>"));
		assert.ok(html.includes("npm install @allons-y/fixture-landing"));
		assert.ok(html.includes('<norn-section id="features">'));
		assert.ok(!/<(section|norn-section)\b[^>]*aria-labelledby/.test(html), "a section takes no name");
		assert.equal((between(html, '<norn-section id="features"', "</norn-section>").match(/<norn-content-card>/g) ?? []).length, 4);
		const packages = between(html, '<norn-section id="packages"', "</norn-section>");
		assert.equal((packages.match(/<norn-content-card>/g) ?? []).length, 2);
		assert.ok(packages.includes('style="--norn-content-card-title-face: mono"'));
		assert.ok(packages.includes('<a href="https://example.com/core">@example/core</a>'));
	});

	test("the header shows the logo and the anchor links, without an npm or docs link", () => {
		const header = between(pages["/"], "<norn-header>", "</norn-header>");
		assert.ok(header.includes('<img src="/assets/img/logo.svg" alt="fixture-landing">'));
		const nav = namedBetween(header, "nav", "Primary", "</nav>");
		assert.deepEqual([...nav.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((match) => match[2]), ["Install", "Usage", "Features", "GitHub"]);
		assert.ok(!/npmjs|>Docs</.test(nav));
	});

	test("the head carries the site metadata, the favicon, the font preload, and one theme color", () => {
		const head = headOf(pages["/"]);
		for (const expected of [
			"<title>fixture-landing: A fixture landing site for the OSS WebC packages</title>",
			'<link rel="canonical" href="https://projects.allons-y.studio/webc-resources/">',
			'<meta name="description" content="A fixture landing site for the OSS WebC packages. It exercises every page section.">',
			'<meta name="theme-color" content="#33394e">',
			'<meta property="og:site_name" content="fixture-landing">',
			'<meta property="og:locale" content="en_US">',
			'<meta property="og:title" content="fixture-landing: A fixture landing site for the OSS WebC packages">',
			'<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">',
			'<link rel="preload" href="/assets/fonts/pt-mono.woff2" as="font" type="font/woff2" crossorigin>',
		]) {
			assert.ok(head.includes(expected), expected);
		}
		assert.equal((head.match(/name="theme-color"/g) ?? []).length, 1);
		assert.ok(!head.includes("apple-touch-icon"));
	});

	test("the footer links the project, the help pages, and Allons-y Studio's conduct and security policies", () => {
		const footer = between(pages["/"], "<norn-footer>", "</norn-footer>");
		assert.ok(footer.includes("<strong>fixture-landing</strong>") && footer.includes(`<a href="${REPO}/blob/main/LICENSE">MPL-2.0</a>`));
		assert.equal(footer.match(/<nav\b/g).length, 1, "one footer navigation");
		const nav = namedBetween(footer, "nav", "Footer", "</nav>");
		const [project, help] = nav.split("<strong>Help</strong>");
		assert.ok(project.includes(`<a href="${REPO}">GitHub</a>`) && project.includes(`${REPO}/blob/main/CHANGELOG.md`) && !project.includes("npmjs"));
		for (const href of [`${REPO}/issues`, `${REPO}/blob/main/.github/CONTRIBUTING.md`, "https://github.com/allonsy-studio/.github/blob/main/CODE_OF_CONDUCT.md", "https://github.com/allonsy-studio/.github/blob/main/SECURITY.md"]) {
			assert.ok(help.includes(`<a href="${href}">`), href);
		}
	});

	test("the stripe is a brand token in the OSS site layer, and the fonts ship as files the bundle can reach", () => {
		const css = allCss(output, pages["/"]);
		assert.match(css, /@layer norn\.oss \{\s*:root \{[^}]*--norn-header-stripe: linear-gradient\(/);
		assert.ok(/norn-header \{[\s\S]*?& > header \{[\s\S]*?&::after/.test(css) && !pages["/"].includes("--norn-header-stripe"), "set in the theme, not on the tag");
		assert.ok(css.includes('src: url("../assets/fonts/pt-mono.woff2")'));
		assert.deepEqual(fs.readdirSync(path.join(output, "assets", "fonts")).sort(), ["instrument-sans-italic-var.woff2", "instrument-sans-var.woff2", "pt-mono.woff2", "yellowtail.woff2"]);
	});
});

describe("landing fixture under a path prefix", () => {
	test("links, the favicon, and the font preload carry the prefix", () => {
		const output = buildFixture(here, { output: "_site-prefix", prefix: "/webc-resources/preview/7/" });
		const html = read(output, "index.html");
		for (const expected of ['<a href="/webc-resources/preview/7/assets/img/favicon.svg"', 'href="/webc-resources/preview/7/assets/fonts/pt-mono.woff2"', 'href="/webc-resources/preview/7/assets/styles/project.css"', 'src="/webc-resources/preview/7/assets/img/logo.svg"']) {
			assert.ok(html.includes(expected.replace("<a ", "")), expected);
		}
		assert.ok(!/<link rel="stylesheet" href="\.?">/.test(html));
	});
});

describe("landing fixture with the OSS site layer off", () => {
	let output;
	let pages;

	before(() => {
		output = buildFixture(here, { output: "_site-oss-off", env: { SITE_PACKAGE_JSON: path.join(here, "package.oss-off.json") } });
		pages = pagesIn(output);
	});

	test("no banner, call to action, credit, OSS CSS, or Allons-y Studio links", () => {
		for (const html of Object.values(pages)) {
			assert.ok(!/<oss-(bar|cta|credit)|Brought to you by|Let's build something|consulting@|scheduler\.zoom\.us|https:\/\/allons-y\.studio|allonsy-studio\/\.github/.test(html));
			assert.ok(!/oss-bar|oss-cta|oss-credit|--oss-/.test(allCss(output, html)));
			assert.ok(!html.includes("Code of conduct") && !html.includes("Security policy"), "no Allons-y Studio policy links, and the project has none of its own");
		}
	});

	test("the page keeps its frame, and the theme color follows the page surface", () => {
		const html = pages["/"];
		assert.ok(html.includes("<norn-header>") && html.includes("<norn-footer>") && html.includes("<norn-hero>"));
		const head = headOf(html);
		assert.ok(head.includes('<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">'));
		assert.ok(head.includes('<meta name="theme-color" content="#101216" media="(prefers-color-scheme: dark)">'));
	});
});

describe("the OSS lock", () => {
	test("a project component named like an OSS component fails the build", () => {
		assert.throws(() => buildFixture(here, { output: "_site-collision", config: "src/eleventy.collision.config.js" }), /oss-cta/i);
	});
});

describe("landing fixture in a browser", () => {
	let server;
	let browser;
	let output;

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

	test("each sample is named by its caption or language, and so is its copy button", async () => {
		const page = await browser.newPage({ permissions: ["clipboard-read", "clipboard-write"] });
		await page.goto(server.url + "/");
		for (const name of ["Copy example.js to clipboard", "Copy sh code to clipboard"]) assert.equal(await page.locator("norn-code-block").getByRole("button", { name, exact: true }).count(), 1, name);
		assert.ok(await page.locator("norn-code-block button").evaluateAll((buttons) => buttons.every((button) => button.hasAttribute("aria-labelledby") && !button.hasAttribute("aria-label"))));
		await page.close();
	});

	test("a sample added after load is enhanced once, even when moved, and gives its colors back when removed", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/");
		const result = await page.evaluate(() => {
			const original = document.querySelector("norn-code-block");
			const group = JSON.parse(original.querySelector("code").dataset.tokens)[0][0];
			const size = () => CSS.highlights.get(`tok-${group}`)?.size ?? 0;
			const before = size();
			const added = original.cloneNode(true);
			document.body.append(added);
			const withSample = size();
			document.body.prepend(added);
			const buttons = added.querySelectorAll("button").length;
			added.remove();
			return { before, withSample, buttons, after: size(), defined: customElements.get("norn-code-block") !== undefined };
		});
		assert.ok(result.defined);
		assert.ok(result.withSample > result.before, "its ranges were added");
		assert.equal(result.buttons, 1, "still one copy button after a move");
		assert.equal(result.after, result.before, "its ranges were released");
		await page.close();
	});

	test("code is a tab stop only while it scrolls, and then it has a name", async () => {
		for (const [width, scrolls] of [[1280, false], [320, true]]) {
			const page = await browser.newPage({ viewport: { width, height: 800 } });
			await page.goto(server.url + "/");
			const settled = () => [...document.querySelectorAll("norn-code-block pre")].every((pre) => pre.hasAttribute("tabindex") === pre.scrollWidth > pre.clientWidth);
			await page.waitForFunction(settled);
			const stops = await page.locator("norn-code-block pre[tabindex]").evaluateAll((pres) => pres.map((pre) => [pre.getAttribute("role"), document.getElementById(pre.getAttribute("aria-labelledby"))?.textContent.trim()]));
			assert.equal(stops.length > 0, scrolls, `${width}px`);
			for (const [role, name] of stops) assert.ok(role === "region" && name, `${width}px: a focusable sample is a region with a name`);
			await page.close();
		}
	});

	test("the banner lockup stays readable: full size on a wide screen, scaled to fit on a phone", async () => {
		for (const [width, expected] of [[1280, 500], [375, 375]]) {
			const page = await browser.newPage({ viewport: { width, height: 800 } });
			await page.goto(server.url + "/");
			const box = await page.locator("oss-bar svg").boundingBox();
			assert.ok(Math.abs(box.width - expected) < 1, `${width}px wide viewport: ${box.width}`);
			await page.close();
		}
	});

	test("sections are not region landmarks", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/");
		assert.equal(await page.getByRole("region").count(), 0);
		await page.close();
	});

	test("the OSS site layer passes axe with it off, too", async () => {
		const off = buildFixture(here, { output: "_site-oss-off", env: { SITE_PACKAGE_JSON: path.join(here, "package.oss-off.json") } });
		const offServer = await serve(off);
		try {
			assert.deepEqual(await audit(browser, offServer.url, pagesOf(off)), []);
		} finally {
			await offServer.close();
		}
	});

	test("the mono and signature fonts load from the copied files, and the highlight ranges register", async () => {
		const page = await browser.newPage();
		const fonts = [];
		page.on("response", (response) => response.url().endsWith(".woff2") && fonts.push([path.basename(response.url()), response.status()]));
		await page.goto(server.url + "/");
		await page.evaluate(() => document.fonts.ready);
		assert.deepEqual(fonts.sort(), [["pt-mono.woff2", 200], ["yellowtail.woff2", 200]], "the mono face, and the signature face the call to action signs with");
		const groups = await page.evaluate(() => [...CSS.highlights.keys()]);
		for (const group of ["tok-comment", "tok-function", "tok-keyword", "tok-punctuation", "tok-string"]) assert.ok(groups.includes(group), group);
		await page.close();
	});

	test("the four-color stripe runs under the header bar", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/");
		const stripe = await page.$eval("norn-header header", (header) => {
			const style = getComputedStyle(header, "::after");
			return { content: style.content, height: style.height, image: style.backgroundImage };
		});
		assert.equal(stripe.height, "3px");
		assert.ok(stripe.image.startsWith("linear-gradient(") && ["210, 45, 111", "255, 148, 77", "255, 211, 107", "31, 145, 173"].every((color) => stripe.image.includes(color)));
		await page.close();
	});

	test("the oss-off page has no stripe", async () => {
		const off = buildFixture(here, { output: "_site-oss-off", env: { SITE_PACKAGE_JSON: path.join(here, "package.oss-off.json") } });
		const offServer = await serve(off);
		const page = await browser.newPage();
		try {
			await page.goto(offServer.url + "/");
			assert.equal(await page.$eval("norn-header header", (header) => getComputedStyle(header, "::after").backgroundImage), "none");
		} finally {
			await page.close();
			await offServer.close();
		}
	});

	test("the credit follows the scheme the page uses, even when CSS overrides the visitor's", async () => {
		for (const [forced, visible] of [["light", 0], ["dark", 1]]) {
			const context = await browser.newContext({ colorScheme: forced === "light" ? "dark" : "light" });
			const page = await context.newPage();
			await page.goto(server.url + "/");
			await page.addStyleTag({ content: `html { color-scheme: ${forced}; }` });
			const shown = await page.$$eval("oss-credit svg", (svgs) => svgs.findIndex((svg) => getComputedStyle(svg).display !== "none"));
			assert.equal(shown, visible, `${forced} forced over the visitor's preference`);
			await context.close();
		}
	});

	test("the credit shows the dark lockup under a dark scheme and the light one otherwise", async () => {
		for (const [colorScheme, visible] of [["light", 0], ["dark", 1]]) {
			const context = await browser.newContext({ colorScheme });
			const page = await context.newPage();
			await page.goto(server.url + "/");
			const shown = await page.$$eval("oss-credit svg", (svgs) => svgs.findIndex((svg) => getComputedStyle(svg).display !== "none"));
			assert.equal(shown, visible, colorScheme);
			await context.close();
		}
	});
});
