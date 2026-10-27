/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { audit, launch, listsNeedingRole, pagesOf, serve } from "../fixtures/lib/browser.js";
import { readTokens } from "../scripts/build-components.js";
import { buildCatalog } from "./lib/catalog.js";

const here = import.meta.dirname;
const eleventy = path.resolve(path.dirname(createRequire(import.meta.url).resolve("@11ty/eleventy")), "..", "cmd.cjs");
const catalog = await buildCatalog({ packagesDir: path.join(here, "..", "packages"), storiesDir: path.join(here, "content", "stories") });

const read = (output, ...parts) => fs.readFileSync(path.join(output, ...parts), "utf8");
const pageFor = (output, url) => read(output, ...url.split("/").filter(Boolean), "index.html");

/** Build in its own process, which Eleventy needs for a clean bundle state. */
function build(output = "_site", env = {}) {
	fs.rmSync(path.join(here, output), { recursive: true, force: true });
	execFileSync(process.execPath, [eleventy, "--config=eleventy.config.js", "--quiet"], { cwd: here, env: { ...process.env, SITE_OUTPUT: output, ...env }, stdio: "pipe" });
	return path.join(here, output);
}

describe("the catalog", () => {
	test("finds every component and layout in every package, from the files on disk", () => {
		for (const pkg of catalog.packages) {
			const onDisk = (folder) => {
				const dir = path.join(here, "..", "packages", `webc-${pkg.id}`, folder);
				return fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".webc")).map((file) => file.slice(0, -".webc".length)).sort() : [];
			};
			assert.deepEqual(pkg.components.filter(({ layout }) => !layout).map(({ name }) => name).sort(), onDisk("components"), pkg.id);
			assert.deepEqual(pkg.components.filter(({ layout }) => layout).map(({ name }) => name).sort(), onDisk("layouts"), `${pkg.id} layouts`);
		}
		assert.equal(catalog.components.filter(({ layout }) => layout).length, 6, "the six layouts");
	});

	test("parses props, slots, and custom properties out of the JSDoc", () => {
		const button = catalog.components.find(({ name }) => name === "norn-link-button");
		assert.deepEqual(button.props.find(({ name }) => name === "variant"), { name: "variant", type: "string", optional: true, description: "<code>primary</code>, a filled accent; <code>secondary</code>, a 1px outline; or <code>quiet</code>, text with no border. Falls back to <code>primary</code>." });
		assert.equal(button.props.find(({ name }) => name === "href").optional, false);
		assert.ok(button.cssprops.some(({ name }) => name === "--norn-link-button-accent"));
		const footer = catalog.components.find(({ name }) => name === "norn-footer");
		assert.deepEqual(footer.slots.map(({ name }) => name), ["default", "colophon"], "an unnamed slot is the default one");
	});

	test("every component outside the head has a story, and the head components have none", () => {
		for (const component of catalog.components) {
			if (component.head) assert.equal(component.stories.length, 0, `${component.slug} renders in every frame`);
			else assert.ok(component.stories.length > 0, `${component.slug} needs a story in content/stories/${component.packageId}/${component.name}/`);
		}
	});

	test("every component has a category, and the examples sit where they were asked for", () => {
		const where = Object.fromEntries(catalog.categories.flatMap((category) => category.components.map((component) => [component.name, category.id])));
		assert.equal(Object.keys(where).length, catalog.components.length, "each component in exactly one category");
		assert.deepEqual(catalog.categories.map(({ id }) => id), ["layout", "landmark", "container", "component", "template", "document", "oss-site"], "the OSS site group follows the categories");
		assert.deepEqual(catalog.categories.at(-1).components.map(({ name }) => name), ["oss-bar", "oss-credit", "oss-cta", "oss-head"], "every OSS site component, by name, with no sub-grouping");
		assert.ok(catalog.categories.slice(0, -1).every((category) => category.components.every(({ packageId }) => packageId !== "oss-site")), "and in no other group");
		assert.equal(where["norn-card-grid"], "container");
		for (const name of ["norn-header", "norn-footer", "norn-side-nav"]) assert.equal(where[name], "landmark", name);
		for (const name of ["norn-card"]) assert.equal(where[name], "container", name);
		assert.equal(where["norn-head"], "document");
		assert.equal(where["oss-head"], "oss-site", "grouped by package");
		assert.equal(catalog.components.find(({ name }) => name === "oss-head").category, "document", "and still a document by its own JSDoc");
		assert.ok(catalog.components.every(({ category }) => category), "every component keeps its category");
		for (const name of ["norn-base", "norn-docs", "norn-docs-home", "norn-landing", "norn-workspaces-home", "norn-workspace"]) assert.equal(where[name], "template", name);
		assert.deepEqual(catalog.categories.find(({ id }) => id === "template").components.map(({ name }) => name), ["norn-base", "norn-docs", "norn-docs-home", "norn-landing", "norn-workspace", "norn-workspaces-home"], "the layouts, and nothing else");
	});

	test("no story is left without a component", () => {
		const known = new Set(catalog.components.map(({ slug }) => slug));
		const root = path.join(here, "content", "stories");
		for (const pkg of fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
			for (const dir of fs.readdirSync(path.join(root, pkg.name), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
				assert.ok(known.has(`${pkg.name}/${dir.name}`), `stories/${pkg.name}/${dir.name} has no component`);
			}
		}
	});
});

describe("the preview build", () => {
	let output;

	before(() => {
		output = build();
	});

	test("one page per component, and one frame per story", () => {
		for (const component of catalog.components) {
			assert.ok(fs.existsSync(path.join(output, "components", component.packageId, component.name, "index.html")), component.slug);
			for (const story of component.stories) assert.ok(fs.existsSync(path.join(output, ...story.frameUrl.split("/").filter(Boolean), "index.html")), story.frameUrl);
		}
		assert.ok(fs.existsSync(path.join(output, "index.html")) && fs.existsSync(path.join(output, "foundations", "index.html")));
	});

	test("the nav groups the components by category, then lists the OSS site components in a group of their own", () => {
		const html = pageFor(output, "/");
		const nav = html.slice(html.indexOf('<nav aria-label="Components">'));
		const groups = [...nav.matchAll(/<summary>([^<]+)<\/summary>/g)].map(([, title]) => title);
		assert.deepEqual(groups, ["Layout", "Landmark", "Container", "Component", "Template", "Document", "OSS site"]);
		const oss = nav.slice(nav.indexOf("<summary>OSS site</summary>"));
		for (const name of ["oss-bar", "oss-credit", "oss-cta", "oss-head"]) assert.ok(oss.includes(`>${name}</a>`), name);
		const landmark = html.slice(html.indexOf("<summary>Landmark</summary>"), html.indexOf("<summary>Container</summary>"));
		for (const name of ["norn-header", "norn-footer", "norn-side-nav"]) assert.ok(landmark.includes(`>${name}</a>`), name);
	});

	test("the nav lists every component once, and marks the current page", () => {
		const html = pageFor(output, "/components/patterns/norn-card/");
		for (const component of catalog.components) assert.equal(html.split(`href="${component.url}"`).length - 1, 1, component.slug);
		assert.ok(html.includes('<a href="/components/patterns/norn-card/" aria-current="page">norn-card</a>'));
	});

	test("a component page shows its docs, each from the JSDoc", () => {
		const html = pageFor(output, "/components/patterns/norn-link-button/");
		assert.ok(html.includes("<code>@variant</code>") && html.includes("a filled accent; <code>secondary</code>, a 1px outline; or <code>quiet</code>, text with no border."));
		assert.ok(html.includes("<code>--norn-link-button-accent</code>"));
		assert.ok(pageFor(output, "/components/patterns/norn-footer/").includes("<code>colophon</code>"));
		assert.ok(html.includes("<norn-code-block"), "the source is shown with norn-code-block");
		assert.equal((html.match(/<preview-canvas>/g) ?? []).length, catalog.components.find(({ name }) => name === "norn-link-button").stories.length);
	});

	test("a head component says where it renders, and has no canvas", () => {
		const html = pageFor(output, "/components/patterns/norn-head/");
		assert.ok(html.includes("Where it renders") && !html.includes("<preview-canvas"));
	});

	test("each frame renders its real component, or a whole page on its layout, with no template or slot markup left", () => {
		for (const component of catalog.components) {
			for (const story of component.stories) {
				const html = pageFor(output, story.frameUrl);
				const styled = fs.readFileSync(component.file, "utf8").includes("<style>");
				if (component.layout) assert.ok(html.includes("<norn-header>") && html.includes("<norn-footer>"), `${story.frameUrl} is a whole page on ${component.name}`);
				else if (styled) assert.ok(html.includes(`<${component.name}`), `${story.frameUrl} renders <${component.name}>`);
				assert.ok(html.includes("<main"), `${story.frameUrl} has its page`);
				assert.ok(!/<template|\sslot=|webc:/.test(html), `${story.frameUrl} has no leftover markup`);
				assert.ok(!/<[a-z][^>]*\s[@:][a-z-]+=/.test(html), `${story.frameUrl} has no uncompiled WebC prop`);
				assert.ok(!html.includes("undefined"), `${story.frameUrl} has no undefined`);
			}
		}
	});

	test("the layout stories read the sample data through the props mapping, without the OSS site theme", () => {
		assert.ok(pageFor(output, "/frames/patterns/norn-landing/default/").includes("A sample project, so the OSS site page bodies have something to show."));
		assert.ok(pageFor(output, "/frames/patterns/norn-workspace/default/").includes("<h1>@example/plugin-a</h1>"));
		const docs = pageFor(output, "/frames/patterns/norn-docs/usage/");
		assert.ok(docs.includes('rel="prev"') && docs.includes('rel="next"'), "the pager reads the docs collection");
		for (const url of ["/frames/patterns/norn-base/default/", "/frames/patterns/norn-docs-home/default/", "/frames/patterns/norn-workspaces-home/default/"]) {
			assert.ok(!/<oss-(bar|cta|credit)/.test(pageFor(output, url)), `${url} has no OSS part`);
		}
		const story = catalog.components.find(({ name }) => name === "norn-landing").stories[0];
		assert.ok(story.source.startsWith("---\ntitle: Default") && story.source.includes("layout: norn-landing.webc"), "a layout story's source shows its front matter");
	});

	test("the foundations page lists every token in tokens.json, with its group, default, and comment", () => {
		const html = pageFor(output, "/foundations/");
		const tokens = readTokens();
		assert.ok(tokens.length > 20);
		for (const { name, group, resolved, comment } of tokens) {
			const row = html.match(new RegExp(`<th scope="row"><code>${name}</code></th>([\\s\\S]*?)</tr>`))?.[1];
			assert.ok(row, name);
			assert.ok(row.includes(`<td>${group}</td>`), `${name}: group`);
			assert.ok(row.includes(`<code>${resolved.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}</code>`) || row.includes(`<code>${resolved}</code>`), `${name}: default`);
			assert.ok(row.includes(comment.replace(/`([^`]+)`/g, "<code>$1</code>")), `${name}: comment`);
		}
		assert.ok(!html.includes("sans-stack"));
	});

	test("every page loads the token overrides in its head", () => {
		for (const url of pagesOf(output)) {
			const head = pageFor(output, url).match(/<head>([\s\S]*?)<\/head>/)[1];
			assert.ok(head.includes('<script src="/assets/tokens.js">'), url);
		}
	});

	test("the output has no HTML comments and no empty bundle tags", () => {
		for (const url of [...catalog.components.map(({ url }) => url), "/", "/foundations/"]) {
			const html = pageFor(output, url);
			assert.ok(!html.includes("<!--") && !/\ssrc=""|\shref=""/.test(html), url);
		}
	});
});

describe("the preview under a path prefix", () => {
	const prefix = "/webc-resources/";
	let output;

	before(() => {
		output = build("_site-prefixed", { PATH_PREFIX: prefix });
	});

	/** Whether a URL path under the prefix names a built file or page. */
	const exists = (pathname) => {
		const file = path.join(output, decodeURIComponent(pathname.slice(prefix.length)));
		return fs.existsSync(file) && (fs.statSync(file).isFile() || fs.existsSync(path.join(file, "index.html")));
	};

	test("every root-relative link, asset, and stylesheet URL stays under the prefix and names a file in the build", () => {
		const escaped = [];
		const missing = [];
		const check = (page, value) => {
			if (!value.startsWith("/") || value.startsWith("//")) return;
			const pathname = value.split(/[?#]/)[0];
			if (!pathname.startsWith(prefix)) escaped.push(`${page}: ${value}`);
			else if (!exists(pathname)) missing.push(`${page}: ${value}`);
		};
		for (const url of pagesOf(output)) {
			const html = pageFor(output, url);
			for (const [tag] of html.matchAll(/<[a-z][^>]*>/g)) {
				for (const [, name, value] of tag.matchAll(/\s(href|src|poster|action|data-axe|data-bundle|srcset)="([^"]*)"/g)) {
					if (name !== "srcset") check(url, value);
					else if (!value.startsWith("data:")) for (const candidate of value.split(",")) check(url, candidate.trim().split(/\s+/)[0]);
				}
			}
		}
		for (const file of fs.readdirSync(path.join(output, "assets", "styles"))) {
			for (const [, , value] of read(output, "assets", "styles", file).matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) assert.ok(!value.startsWith("/"), `${file}: ${value} is relative to the stylesheet`);
		}
		assert.deepEqual(escaped, [], "URLs that leave the prefix");
		assert.deepEqual(missing, [], "URLs with no file behind them");
	});

	test("a frame, a layout, and the shell link their assets under the prefix", () => {
		for (const url of ["/frames/patterns/norn-card/default/", "/frames/patterns/norn-landing/default/", "/"]) {
			const html = pageFor(output, url);
			assert.ok(html.includes(`<script src="${prefix}assets/tokens.js">`), `${url} loads the token overrides`);
			assert.ok(html.includes(`href="${prefix}assets/norn/reset.css"`), `${url} links the reset`);
		}
		const canvas = pageFor(output, "/components/patterns/norn-card/");
		assert.ok(canvas.includes(`src="${prefix}frames/patterns/norn-card/default/"`) && canvas.includes(`data-axe="${prefix}assets/axe.min.js"`));
		assert.ok(pageFor(output, "/frames/patterns/norn-docs/default/").includes(`data-bundle="${prefix}assets/no-index.js"`), "the search bundle follows the prefix");
	});
});

describe("the preview in a browser", () => {
	let output;
	let server;
	let browser;

	before(async () => {
		output = build();
		server = await serve(output);
		browser = await launch();
	});

	after(async () => {
		await browser?.close();
		await server?.close();
	});

	/** Wait for a canvas's frame to load, and return it. */
	async function frameOf(page, index = 0) {
		const handle = await page.locator("preview-canvas iframe").nth(index).elementHandle();
		await (await handle.contentFrame()).waitForLoadState("load");
		return handle.contentFrame();
	}

	/** The bar that opens the component list on a phone. */
	const NAV_BAR = "preview-nav > nav > details > summary";

	test("every page passes axe in light, dark, and forced colors, and keeps its list semantics", async () => {
		assert.deepEqual(await audit(browser, server.url, pagesOf(output)), []);
		const page = await browser.newPage();
		for (const url of ["/", "/foundations/", "/frames/patterns/norn-card-grid/default/", "/frames/patterns/norn-landing/default/"]) {
			await page.goto(server.url + url);
			assert.deepEqual(await listsNeedingRole(page), [], url);
		}
		await page.close();
	});

	test("each sample of the code tabs story is highlighted in at least three groups, with the tokens registered for its own text", async () => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await context.newPage();
		await page.goto(server.url + "/frames/patterns/norn-code-tabs/default/");
		await page.waitForFunction(() => CSS.highlights.size > 0);
		const found = await page.evaluate(() =>
			[...document.querySelectorAll("norn-code-block code")].map((code) => {
				const groups = new Set();
				for (const [name, highlight] of CSS.highlights) for (const range of highlight) if (code.contains(range.startContainer) && range.toString().trim()) groups.add(name.replace("tok-", ""));
				return [...groups].sort();
			}),
		);
		assert.equal(found.length, 3, "three samples");
		for (const groups of found) {
			assert.ok(groups.length >= 3, `groups: ${groups}`);
			for (const group of ["function", "keyword", "flag", "string"]) assert.ok(groups.includes(group), `${group} in ${groups}`);
		}
		await context.close();
	});

	test("sixty samples on one page are all highlighted, and each group is registered once, not once per sample", async () => {
		const frame = "/frames/code-sample/norn-code-block/default/";
		const html = read(output, ...frame.split("/").filter(Boolean), "index.html");
		const block = html.slice(html.indexOf("<norn-code-block>"), html.lastIndexOf("</norn-code-block>") + "</norn-code-block>".length);
		const page = await browser.newPage();
		await page.route(`${server.url}/many/`, (route) => route.fulfill({ contentType: "text/html", body: html.replace(block, block.repeat(60)) }));
		await page.addInitScript(() => {
			window.highlightSets = 0;
			const set = window.HighlightRegistry.prototype.set;
			window.HighlightRegistry.prototype.set = function (...args) {
				window.highlightSets += 1;
				return set.apply(this, args);
			};
		});
		await page.goto(`${server.url}/many/`);
		await page.waitForFunction(() => CSS.highlights.size > 0);
		/** Each sample's registered ranges as `group:start:end`, against its own `data-tokens`. */
		const registered = () =>
			page.evaluate(() => {
				const codes = [...document.querySelectorAll("norn-code-block code")];
				const found = codes.map(() => []);
				for (const [name, highlight] of CSS.highlights) {
					for (const range of highlight) found[codes.findIndex((code) => code.contains(range.startContainer))]?.push(`${name.replace("tok-", "")}:${range.startOffset}:${range.endOffset}`);
				}
				return codes.map((code, index) => [found[index].sort(), JSON.parse(code.dataset.tokens).map((entry) => entry.join(":")).sort()]);
			});
		const samples = await registered();
		assert.equal(samples.length, 60, "sixty samples");
		for (const [index, [found, expected]] of samples.entries()) assert.deepEqual(found, expected, `sample ${index}`);
		const groups = await page.evaluate(() => CSS.highlights.size);
		assert.equal(await page.evaluate(() => window.highlightSets), groups, "each group is set once");
		await page.evaluate(async () => {
			const blocks = document.querySelectorAll("norn-code-block");
			blocks[0].remove();
			blocks[1].after(blocks[2]);
			await new Promise(window.requestAnimationFrame);
		});
		const after = await registered();
		assert.equal(after.length, 59);
		for (const [index, [found, expected]] of after.entries()) assert.deepEqual(found, expected, `after a removal and a move, sample ${index}`);
		await page.close();
	});

	test("no preview page scrolls sideways on a phone: the foundations table scrolls in its own box", async () => {
		for (const width of [390, 320]) {
			const page = await browser.newPage({ viewport: { width, height: 800 } });
			for (const url of pagesOf(output).filter((entry) => !entry.startsWith("/frames/"))) {
				await page.goto(server.url + url);
				assert.ok(await page.evaluate((limit) => document.documentElement.scrollWidth <= limit, width), `${url} at ${width}`);
			}
			await page.goto(server.url + "/foundations/");
			assert.ok(await page.$eval("preview-tokens norn-simple-table > div", (box) => box.scrollWidth > box.clientWidth), `${width}: the table scrolls instead`);
			await page.close();
		}
	});

	test("on a phone the pages pass axe with the component list closed and open", async () => {
		const pages = ["/", "/foundations/", "/components/patterns/norn-callout/", "/components/patterns/norn-card/", "/components/patterns/norn-docs/", "/components/oss-site/oss-head/"];
		assert.deepEqual(await audit(browser, server.url, pages, { width: 390 }), [], "closed");
		assert.deepEqual(await audit(browser, server.url, pages, { width: 390, prepare: (page) => page.locator(NAV_BAR).click() }), [], "open");
	});

	test("on a phone the component list is one closed disclosure, and the page's heading is on the first screen", async () => {
		const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
		for (const url of ["/", "/components/patterns/norn-callout/", "/foundations/"]) {
			await page.goto(server.url + url);
			const bar = page.locator(NAV_BAR);
			assert.equal((await bar.textContent()).replace(/\s+/g, " ").trim(), `Components (${catalog.components.length})`, url);
			assert.equal(await page.locator("preview-nav > nav > details").evaluate((details) => details.open), false, `${url}: closed`);
			assert.equal(await page.locator("preview-nav a").first().isHidden(), true, `${url}: no link shows while it is closed`);
			assert.ok((await page.locator("main h1").boundingBox()).y < 844, `${url}: the heading is within the first screen`);
		}
		await page.goto(server.url + "/components/patterns/norn-callout/");
		await page.locator(NAV_BAR).click();
		assert.equal(await page.locator("preview-nav details details").evaluateAll((groups) => groups.every((group) => group.open)), true, "the groups are open inside it");
		const current = page.locator('preview-nav a[aria-current="page"]');
		assert.equal(await current.count(), 1);
		assert.equal(await current.textContent(), "norn-callout");
		assert.equal(await current.isVisible(), true);
		assert.equal(await page.locator("norn-skip-link a").getAttribute("href"), "#main");
		assert.equal(await page.locator("#main").count(), 1);
		await page.close();
	});

	test("the component list closes when the screen narrows and opens when it widens", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-callout/");
		const open = () => page.locator("preview-nav > nav > details").evaluate((details) => details.open);
		/** The disclosure follows a media query listener, which runs after the resize, so wait for it. */
		const becomes = (state) => page.waitForFunction((want) => document.querySelector("preview-nav > nav > details").open === want, state);
		assert.equal(await open(), true);
		await page.setViewportSize({ width: 390, height: 844 });
		await becomes(false);
		await page.setViewportSize({ width: 1280, height: 900 });
		await becomes(true);
		await page.close();
	});

	test("without a script the component list is the same disclosure on a phone, and works", async () => {
		const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
		const page = await context.newPage();
		await page.goto(server.url + "/components/patterns/norn-callout/");
		assert.equal(await page.locator("preview-nav a").first().isHidden(), true);
		await page.locator(NAV_BAR).click();
		assert.equal(await page.locator("preview-nav a").first().isVisible(), true);
		await context.close();
	});

	test("on a wide screen the component list is the sidebar: the groups show, with no bar of their own", async () => {
		for (const javaScriptEnabled of [true, false]) {
			const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 1280, height: 900 } });
			const page = await context.newPage();
			await page.goto(server.url + "/components/patterns/norn-callout/");
			assert.equal(await page.locator(NAV_BAR).isHidden(), true, "no bar");
			const groups = page.locator("preview-nav details details");
			assert.equal(await groups.count(), 7, "six categories and the OSS site group");
			for (const group of await groups.all()) {
				assert.equal(await group.locator("> summary").isVisible(), true);
				assert.equal(await group.locator("a").first().isVisible(), true);
			}
			assert.equal(await page.locator("preview-nav a:visible").count(), catalog.components.length);
			if (javaScriptEnabled) assert.equal(await page.locator("preview-nav > nav > details").evaluate((details) => details.open), true, "open, so its links are in the page for every tool");
			await context.close();
		}
	});

	/** The props and slots tables of a component page: every table in the page but the custom properties one. */
	const SPEC_TABLES = "main table:not(preview-props table)";

	test("on a phone the props and slots tables stack, no word splits across lines, and no table pushes the page sideways", async () => {
		const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
		for (const url of ["/components/patterns/norn-callout/", "/components/patterns/norn-card/", "/components/patterns/norn-docs/", "/components/patterns/norn-segmented-control/"]) {
			await page.goto(server.url + url);
			assert.ok(await page.locator(SPEC_TABLES).count() >= 1, `${url}: a props or a slots table`);
			const split = await page.evaluate((tables) => {
				const found = [];
				for (const cell of document.querySelectorAll(`${tables} :is(th, td)`)) {
					const walker = document.createTreeWalker(cell, window.NodeFilter.SHOW_TEXT);
					for (let node = walker.nextNode(); node; node = walker.nextNode()) {
						for (const word of node.data.matchAll(/[\w@:$]+/g)) {
							const range = document.createRange();
							range.setStart(node, word.index);
							range.setEnd(node, word.index + word[0].length);
							if (range.getClientRects().length > 1) found.push(word[0]);
						}
					}
				}
				return found;
			}, SPEC_TABLES);
			assert.deepEqual(split, [], `${url}: words split across lines`);
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), `${url}: the page holds still`);
		}
		await page.goto(server.url + "/components/patterns/norn-callout/");
		const type = page.locator(`${SPEC_TABLES} td code`, { hasText: /^string$/ }).first();
		assert.ok((await type.boundingBox()).height < 30, "string sits on one line");
		const [name, cell] = await Promise.all(["th", "td"].map((selector) => type.locator("xpath=ancestor::tr").locator(selector).first().boundingBox()));
		assert.ok(name.y + name.height <= cell.y, "the type sits under the name");
		await page.close();
	});

	test("on a phone a custom property is a block: name, type, default, then its field and reset, all inside the screen", async () => {
		const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const row = page.locator("preview-props tbody tr", { has: page.locator('input[data-prop="--norn-card-radius"]') });
		const [name, type, fallback, field] = await Promise.all(["th", "td:nth-child(2)", "td:nth-child(3)", "td:nth-child(4)"].map((selector) => row.locator(selector).boundingBox()));
		assert.ok(name.y < type.y && type.y < fallback.y && fallback.y < field.y, "one under the other");
		for (const box of [name, type, fallback, field]) assert.ok(box.x >= 0 && box.x + box.width <= 390, "inside the screen");
		const reset = await row.getByRole("button", { name: "Reset --norn-card-radius" }).boundingBox();
		assert.ok(reset.x + reset.width <= 390 - 1, "the reset is in reach");
		assert.equal(await page.locator("preview-props").evaluate((box) => box.scrollWidth <= box.clientWidth), true, "nothing to scroll");
		await row.locator("input").fill("1px");
		assert.equal(await row.getByRole("button", { name: "Reset --norn-card-radius" }).isEnabled(), true);
		await page.close();
	});

	/** The canvas toolbar's rows: how many lines its visible parts fall on. */
	const toolbarRows = (page) =>
		page.locator("preview-canvas").first().evaluate((canvas) => {
			const parts = [...canvas.firstElementChild.children].map((part) => part.getBoundingClientRect()).filter((box) => box.height > 0);
			const rows = [];
			for (const box of parts) {
				const row = rows.find((other) => box.top < other.bottom && box.bottom > other.top);
				if (row) {
					row.top = Math.min(row.top, box.top);
					row.bottom = Math.max(row.bottom, box.bottom);
				} else rows.push({ top: box.top, bottom: box.bottom });
			}
			return rows.length;
		});

	test("on a phone the width control is gone, the toolbar is one row, and the frame fills its box", async () => {
		const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const canvas = page.locator("preview-canvas").first();
		assert.equal(await canvas.locator('[data-group="width"]').isHidden(), true);
		assert.equal(await canvas.locator('[data-group="scheme"]').isVisible(), true);
		assert.equal(await canvas.locator('[data-action="axe"]').isVisible(), true);
		assert.equal(await toolbarRows(page), 1);
		await page.close();
	});

	test("a canvas that is moved keeps one set of listeners, and its frame still follows its content", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const canvas = page.locator("preview-canvas").first();
		const runs = () =>
			canvas.evaluate(async (element) => {
				let calls = 0;
				element.querySelector("iframe").contentWindow.axe = { run: async () => (calls++, { violations: [] }) };
				element.querySelector('[data-action="axe"]').click();
				await new Promise((done) => setTimeout(done, 100));
				return calls;
			});
		assert.equal(await runs(), 1, "as loaded");
		for (const moves of [1, 2]) {
			await canvas.evaluate((element) => element.parentElement.append(element));
			await page.waitForFunction(() => document.querySelector("preview-canvas iframe").contentDocument?.readyState === "complete" && document.querySelector("preview-canvas iframe").contentDocument.body?.children.length > 0);
			assert.equal(await runs(), 1, `one click, one run, after ${moves} move(s)`);
		}
		const height = () => canvas.evaluate((element) => [element.querySelector("iframe").getBoundingClientRect().height, element.querySelector("iframe").contentDocument.documentElement.scrollHeight]);
		await canvas.evaluate((element) => element.querySelector("iframe").contentDocument.body.insertAdjacentHTML("beforeend", '<div style="block-size: 600px"></div>'));
		await page.waitForFunction(() => {
			const frame = document.querySelector("preview-canvas iframe");
			return Math.round(frame.getBoundingClientRect().height) === frame.contentDocument.documentElement.scrollHeight;
		});
		const [frame, content] = await height();
		assert.equal(Math.round(frame), content, "the frame grew with its content after the moves");
		await page.close();
	});

	test("a width chosen on a wide screen leaves the frame no wider than its box once the screen is narrow", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const canvas = page.locator("preview-canvas").first();
		await pick(canvas, "width", "Desktop, 1024px");
		const widths = () => canvas.evaluate((element) => ({ frame: element.querySelector("iframe").getBoundingClientRect().width, stage: element.querySelector("[data-stage]").clientWidth }));
		assert.equal(Math.round((await widths()).frame), 1024);
		await page.setViewportSize({ width: 390, height: 844 });
		const narrow = await widths();
		assert.ok(narrow.frame <= narrow.stage, `${narrow.frame} in ${narrow.stage}`);
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true);
		await page.setViewportSize({ width: 1280, height: 900 });
		assert.equal(Math.round((await widths()).frame), 1024, "the choice is still there on a wide screen");
		await page.close();
	});

	test("on a touch screen the nav, the toolbar, and the link to open a frame are 44px targets", async () => {
		const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
		const page = await context.newPage();
		await page.goto(server.url + "/components/patterns/norn-card/");
		assert.equal(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches), true);
		await page.locator(NAV_BAR).click();
		const heights = (selector) => page.locator(selector).evaluateAll((elements) => elements.filter((element) => element.getBoundingClientRect().height > 0).map((element) => element.getBoundingClientRect().height));
		const small = async (selector) => {
			const found = await heights(selector);
			assert.ok(found.length > 0, selector);
			return found.filter((height) => height < 44);
		};
		assert.deepEqual(await small("preview-nav a"), [], "nav links");
		assert.deepEqual(await small("preview-nav summary"), [], "nav groups");
		assert.deepEqual(await small("preview-canvas norn-segmented-control label"), [], "toolbar options");
		assert.deepEqual(await small("preview-canvas button"), [], "the check button");
		assert.deepEqual(await small("preview-canvas p a"), [], "open on its own");
		await context.close();
	});

	test("on a touch screen every card on the index is one target at least 44px tall: its center and corners resolve to the heading link", async () => {
		const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
		const page = await context.newPage();
		await page.goto(server.url + "/");
		assert.equal(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches), true);
		const misses = await page.evaluate(() => {
			const found = [];
			const cards = [...document.querySelectorAll("norn-card article")];
			for (const article of cards) {
				article.scrollIntoView({ block: "center", behavior: "instant" });
				const box = article.getBoundingClientRect();
				const link = article.querySelector("h3 a");
				if (box.height < 44) found.push(`${link.textContent}: the card is ${box.height}px tall`);
				const inset = 8;
				for (const [x, y] of [[box.x + box.width / 2, box.y + box.height / 2], [box.x + inset, box.y + inset], [box.right - inset, box.y + inset], [box.x + inset, box.bottom - inset], [box.right - inset, box.bottom - inset]]) {
					if (document.elementFromPoint(x, y) !== link) found.push(`${link.textContent}: ${Math.round(x)},${Math.round(y)} is not the link`);
				}
			}
			return { cards: cards.length, found };
		});
		assert.ok(misses.cards > 20, "the index lists the components");
		assert.deepEqual(misses.found, []);
		await context.close();
	});

	test("with a mouse the sizes stay as they were", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		assert.equal(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches), false);
		const height = (selector) => page.locator(selector).first().evaluate((element) => element.getBoundingClientRect().height);
		assert.equal(Math.round(await height("preview-nav a")), 29, "nav links");
		assert.ok((await height("preview-canvas p a")) < 24, "open on its own");
		assert.equal(await height("preview-canvas norn-segmented-control fieldset"), 36, "toolbar options");
		assert.equal(await height("preview-canvas button"), 36, "the check button");
		await page.close();
	});

	test("no page logs an error to the console", async () => {
		const page = await browser.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
		for (const url of ["/", "/foundations/", "/components/patterns/norn-card/", "/components/code-sample/norn-code-block/"]) {
			await page.goto(server.url + url);
			await page.waitForLoadState("networkidle");
		}
		assert.deepEqual(errors, []);
		await page.close();
	});

	/** A radio in a canvas's group, by group and accessible name. */
	const radio = (canvas, group, name) => canvas.locator(`[data-group="${group}"]`).getByRole("radio", { name, exact: true });
	/** Pick one the way a person does: through its icon. */
	const pick = (canvas, group, name) => canvas.locator(`[data-group="${group}"] label`).filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).click();

	test("the scheme control is a sun, a system mark, and a moon, in that order, with System selected", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const canvas = page.locator("preview-canvas").first();
		const labels = canvas.locator('[data-group="scheme"] label');
		assert.deepEqual(await labels.locator("span").allTextContents(), ["Light", "System", "Dark"]);
		assert.deepEqual(await labels.evaluateAll((all) => all.map((label) => label.querySelectorAll("svg[aria-hidden='true']").length)), [1, 1, 1], "an icon each, hidden from assistive tech");
		assert.equal(await radio(canvas, "scheme", "System").isChecked(), true);
		assert.equal((await canvas.locator('[data-group="scheme"] legend').textContent()).trim(), "Color scheme");
		await page.close();
	});

	test("every icon option has a title, for a description on hover", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const titles = await page.locator("preview-canvas").first().locator("norn-segmented-control label").evaluateAll((labels) => labels.map((label) => label.title));
		assert.deepEqual(titles, ["Light", "System", "Dark", "Fill", "Phone, 320px", "Tablet, 768px", "Desktop, 1024px"]);
		await page.close();
	});

	test("the scheme control tints the selected option and follows the selection, with no thumb", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const canvas = page.locator("preview-canvas").first();
		assert.ok(["none", "normal"].includes(await canvas.locator('[data-group="scheme"] fieldset').evaluate((fieldset) => getComputedStyle(fieldset, "::before").content)), "no thumb");
		/** The options that have a tint behind them, by title. */
		const tinted = () =>
			canvas.locator('[data-group="scheme"] label').evaluateAll((labels) =>
				labels.filter((label) => !/(, 0|\/ 0)\)$/.test(getComputedStyle(label).backgroundColor)).map((label) => label.title),
			);
		assert.deepEqual(await tinted(), ["System"]);
		await pick(canvas, "scheme", "Dark");
		await page.mouse.move(0, 0);
		await page.waitForTimeout(300);
		assert.deepEqual(await tinted(), ["Dark"]);
		await pick(canvas, "scheme", "Light");
		await page.mouse.move(0, 0);
		await page.waitForTimeout(300);
		assert.deepEqual(await tinted(), ["Light"]);
		await page.close();
	});

	test("the scheme control sets the frame's color scheme, and System clears it", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const frame = await frameOf(page);
		const canvas = page.locator("preview-canvas").first();
		await pick(canvas, "scheme", "Dark");
		assert.equal(await frame.evaluate(() => document.documentElement.style.colorScheme), "dark");
		assert.equal(await frame.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(16, 18, 22)");
		assert.deepEqual([await radio(canvas, "scheme", "Light").isChecked(), await radio(canvas, "scheme", "System").isChecked(), await radio(canvas, "scheme", "Dark").isChecked()], [false, false, true], "one at a time");
		await pick(canvas, "scheme", "Light");
		assert.equal(await frame.evaluate(() => document.documentElement.style.colorScheme), "light");
		await pick(canvas, "scheme", "System");
		assert.equal(await frame.evaluate(() => document.documentElement.style.colorScheme), "");
		await page.close();
	});

	test("the width control is a set of device icons that work as radio buttons", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const canvas = page.locator("preview-canvas").first();
		const names = ["Fill", "Phone, 320px", "Tablet, 768px", "Desktop, 1024px"];
		assert.deepEqual(await canvas.locator('[data-group="width"] label span').allTextContents(), names);
		assert.equal(await canvas.locator('[data-group="width"] input[type="radio"]').count(), 4);
		const frameWidth = () => page.locator("preview-canvas iframe").first().evaluate((element) => Math.round(element.getBoundingClientRect().width));
		const fill = await frameWidth();
		for (const [name, width] of [["Phone, 320px", 320], ["Tablet, 768px", 768], ["Desktop, 1024px", 1024]]) {
			await pick(canvas, "width", name);
			assert.equal(await frameWidth(), width, name);
			const checked = await canvas.locator('[data-group="width"] input').evaluateAll((inputs) => inputs.filter((input) => input.checked).length);
			assert.equal(checked, 1, `${name}: the others are off`);
		}
		await pick(canvas, "width", "Fill");
		assert.equal(await frameWidth(), fill);
		await page.close();
	});

	test("each canvas keeps its own selection", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const [first, second] = [page.locator("preview-canvas").nth(0), page.locator("preview-canvas").nth(1)];
		await pick(first, "scheme", "Dark");
		await pick(first, "width", "Phone, 320px");
		assert.equal(await radio(second, "scheme", "System").isChecked(), true);
		assert.equal(await radio(second, "width", "Fill").isChecked(), true);
		const groups = await page.locator("preview-canvas [data-group] input[type='radio']").evaluateAll((inputs) => new Set(inputs.map((input) => input.name)).size);
		assert.equal(groups, 2 * (await page.locator("preview-canvas").count()), "a radio group per control per canvas");
		await page.close();
	});

	test("the frame grows to its content", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const frame = await frameOf(page);
		await page.waitForFunction(() => document.querySelector("preview-canvas iframe").style.blockSize !== "");
		const [frameHeight, contentHeight] = [await page.locator("preview-canvas iframe").first().evaluate((element) => element.getBoundingClientRect().height), await frame.evaluate(() => document.documentElement.scrollHeight)];
		assert.ok(Math.abs(frameHeight - contentHeight) <= 1, `${frameHeight} vs ${contentHeight}`);
		await page.close();
	});

	test("the custom properties table holds the overrides: name, type, default, and the field with its reset", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		assert.equal(await page.locator("preview-canvas details").count(), 0, "no panel in the canvas");
		const table = page.locator("preview-props");
		assert.deepEqual(await table.locator("thead th").allTextContents(), ["Property", "Type", "Default", "Override"]);
		const row = table.locator("tbody tr", { has: page.locator('input[data-prop="--norn-card-radius"]') });
		assert.equal(await row.locator("th code").textContent(), "--norn-card-radius");
		assert.equal(await row.locator('[data-col="type"]').textContent(), "<length>");
		assert.match(await row.locator("td").nth(1).textContent(), /--norn-ui-border-radius\s+6px/);
		assert.equal(await row.locator("input").getAttribute("aria-label"), "Override --norn-card-radius");
		assert.equal(await row.getByRole("button", { name: "Reset --norn-card-radius" }).isDisabled(), true, "nothing to reset yet");
		const color = table.locator("tbody tr", { has: page.locator('input[data-prop="--norn-card-bg"]') });
		assert.equal(await color.locator('[data-col="type"]').textContent(), "<color>");
		assert.match(await color.locator("td").nth(1).textContent(), /--norn-surface-raised\s+light-dark\(hsl\(40, 14%, 96%\), #242932\)/);
		assert.equal(await table.locator("tbody tr").count(), 1 + 6, "the shared accent, then the component's six");
		await page.close();
	});

	test("a page with no examples lists its properties without override fields", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/oss-site/oss-head/");
		assert.deepEqual(await page.locator("preview-props thead th").allTextContents(), ["Property", "Type", "Default"]);
		assert.equal(await page.locator("preview-props input").count(), 0);
		await page.close();
	});

	test("the accessibility check has no explanation beside it, and its icon shows idle, running, then the result", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		await frameOf(page);
		const canvas = page.locator("preview-canvas").first();
		const button = canvas.locator('[data-action="axe"]');
		assert.equal(await canvas.locator("[data-hint]").count(), 0);
		assert.equal(await button.getAttribute("aria-describedby"), null);
		const shown = () => button.locator("norn-icon").evaluateAll((icons) => icons.filter((icon) => getComputedStyle(icon).display !== "none").map((icon) => icon.dataset.for));
		assert.deepEqual(await shown(), ["idle"]);
		assert.equal((await button.textContent()).trim(), "Check accessibility");
		await button.click();
		await canvas.locator("[data-results]").getByText("No accessibility violations found.").waitFor();
		assert.deepEqual(await shown(), ["pass"]);
		assert.equal(await button.locator('[data-for="pass"]').evaluate((icon) => getComputedStyle(icon).color), "rgb(11, 107, 58)");
		await page.close();
	});

	test("a failing check shows the red mark", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const frame = await frameOf(page);
		await frame.evaluate(() => document.body.append(Object.assign(document.createElement("img"), { src: "data:," })));
		const button = page.locator('preview-canvas [data-action="axe"]').first();
		await button.click();
		await page.locator("preview-canvas [data-results] strong").first().waitFor();
		assert.equal(await button.getAttribute("data-state"), "fail");
		assert.equal(await button.locator('[data-for="fail"]').evaluate((icon) => getComputedStyle(icon).color), "rgb(180, 35, 24)");
		await page.close();
	});

	test("an override typed in the table reaches every example, and its reset puts the default back", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const frames = await Promise.all([0, 1].map((index) => frameOf(page, index)));
		const radius = (frame) => frame.evaluate(() => getComputedStyle(document.querySelector("norn-card article")).borderTopLeftRadius);
		const before = await radius(frames[0]);
		await page.locator('preview-props input[data-prop="--norn-card-radius"]').fill("1px");
		for (const frame of frames) assert.equal(await radius(frame), "1px");
		const reset = page.getByRole("button", { name: "Reset --norn-card-radius" });
		assert.equal(await reset.isEnabled(), true);
		await reset.click();
		assert.equal(await radius(frames[0]), before);
		assert.equal(await page.locator('preview-props input[data-prop="--norn-card-radius"]').inputValue(), "");
		assert.equal(await reset.isDisabled(), true);
		await page.close();
	});

	test("the accent picker changes the frame's accent, and its reset undoes it", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/components/patterns/norn-card/");
		const frame = await frameOf(page);
		await page.locator('preview-props input[data-prop="--norn-ui-accent"]').evaluate((input) => {
			input.value = "#ff0000";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		assert.equal(await frame.evaluate(() => document.documentElement.style.getPropertyValue("--norn-ui-accent")), "#ff0000");
		await page.getByRole("button", { name: "Reset --norn-ui-accent" }).click();
		assert.equal(await frame.evaluate(() => document.documentElement.style.getPropertyValue("--norn-ui-accent")), "");
		await page.close();
	});

	/** Type a value into a token's text field on the Foundations page. */
	const override = (page, token, value) => page.locator(`preview-tokens input[type="text"][data-token="${token}"]`).fill(value);
	/** Set a color token's light and dark pickers on the Foundations page. */
	const overrideColor = (page, token, light, dark) =>
		page.locator("preview-tokens [data-pair]", { has: page.locator(`[data-token="${token}"]`) }).evaluate(
			(pair, [lightValue, darkValue]) => {
				for (const [scheme, value] of [["light", lightValue], ["dark", darkValue]]) {
					const input = pair.querySelector(`[data-scheme="${scheme}"]`);
					input.value = value;
					input.dispatchEvent(new Event("input", { bubbles: true }));
				}
			},
			[light, dark],
		);
	/** The sRGB channels of the primary button's fill, which is the accent, whatever color space the browser mixed it in. */
	const accentFill = (frame) =>
		frame.evaluate(() => {
			const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
			context.fillStyle = getComputedStyle(document.querySelector('norn-link-button a[data-variant="primary"]')).backgroundColor;
			context.fillRect(0, 0, 1, 1);
			return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
		});
	/** Whether two sets of channels are the same color, within a unit of rounding. */
	const near = (found, expected) => found.every((value, index) => Math.abs(value - expected[index]) <= 1);
	const rootToken = (page, token) => page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), token);

	test("an override set on Foundations is saved, and every kind of preview page applies it", async () => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await context.newPage();
		await page.goto(server.url + "/foundations/");
		await overrideColor(page, "--norn-ui-accent", "#c2185b", "#00897b");
		assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("norn-preview-tokens"))), { "--norn-ui-accent": "light-dark(#c2185b, #00897b)" });
		assert.equal(await rootToken(page, "--norn-ui-accent"), "light-dark(#c2185b, #00897b)", "this page, at once");

		await page.goto(server.url + "/frames/patterns/norn-link-button/default/");
		assert.equal(await rootToken(page, "--norn-ui-accent"), "light-dark(#c2185b, #00897b)", "a plain frame");
		assert.ok(near(await accentFill(page), [194, 24, 91]), "the light value, in a light scheme");

		await page.goto(server.url + "/frames/oss-site/oss-cta/default/");
		assert.equal(await rootToken(page, "--norn-ui-accent"), "light-dark(#c2185b, #00897b)", "an OSS frame");

		await page.goto(server.url + "/frames/patterns/norn-landing/default/");
		assert.equal(await rootToken(page, "--norn-ui-accent"), "light-dark(#c2185b, #00897b)", "a layout frame");

		await page.goto(server.url + "/components/patterns/norn-card/");
		const frame = await frameOf(page);
		assert.equal(await frame.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--norn-ui-accent").trim()), "light-dark(#c2185b, #00897b)", "a frame inside a component page");
		await context.close();
	});

	test("the dark value applies in a dark scheme", async () => {
		const context = await browser.newContext({ colorScheme: "dark" });
		const page = await context.newPage();
		await page.addInitScript(() => localStorage.setItem("norn-preview-tokens", JSON.stringify({ "--norn-ui-accent": "light-dark(#c2185b, #00897b)" })));
		await page.goto(server.url + "/frames/patterns/norn-link-button/default/");
		assert.ok(near(await accentFill(page), [0, 137, 123]), "the dark value");
		await context.close();
	});

	test("the fields show what is saved when the page loads, and an override survives a reload", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(server.url + "/foundations/");
		await override(page, "--norn-ui-border-radius", "1rem");
		await page.reload();
		assert.equal(await page.locator('preview-tokens input[type="text"][data-token="--norn-ui-border-radius"]').inputValue(), "1rem");
		assert.match(await page.locator("preview-tokens [data-status]").textContent(), /1 override saved/);
		await context.close();
	});

	test("a change in one tab reaches a page that is already open, with no reload", async () => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const editor = await context.newPage();
		const demo = await context.newPage();
		await demo.goto(server.url + "/frames/patterns/norn-card/default/");
		await editor.goto(server.url + "/foundations/");
		await overrideColor(editor, "--norn-ui-accent", "#00897b", "#00897b");
		await demo.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--norn-ui-accent").trim() === "light-dark(#00897b, #00897b)");
		await editor.locator('preview-tokens [data-action="clear"][data-token="--norn-ui-accent"]').click();
		await demo.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--norn-ui-accent").trim() === "", "a frame defines no token of its own");
		await context.close();
	});

	test("the shell says when overrides apply, and its reset clears them everywhere", async () => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await context.newPage();
		await page.goto(server.url + "/");
		assert.equal(await page.locator("preview-overrides p").isHidden(), true);
		await page.goto(server.url + "/foundations/");
		await override(page, "--norn-space-m", "2rem");
		await override(page, "--norn-ui-border-radius", "0");
		await page.goto(server.url + "/components/patterns/norn-card-grid/");
		await page.locator("preview-overrides p").waitFor();
		assert.match(await page.locator("preview-overrides [data-count]").textContent(), /2 token overrides apply to every preview/);
		await page.locator('preview-overrides [data-action="reset"]').click();
		assert.equal(await page.evaluate(() => localStorage.getItem("norn-preview-tokens")), null);
		assert.equal(await page.locator("preview-overrides p").isHidden(), true);
		assert.equal(await rootToken(page, "--norn-space-m"), "1.25rem");
		await context.close();
	});

	test("a color token has a light and a dark picker that start at what it resolves to, and a reset", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(server.url + "/foundations/");
		const pair = (token) => page.locator("preview-tokens [data-pair]", { has: page.locator(`[data-token="${token}"]`) });
		const value = (token, scheme) => pair(token).locator(`[data-scheme="${scheme}"]`).inputValue();
		assert.deepEqual([await value("--norn-surface-base", "light"), await value("--norn-surface-base", "dark")], ["#ffffff", "#101216"], "from the default");
		assert.deepEqual([await value("--norn-ui-accent", "light"), await value("--norn-ui-accent", "dark")], ["#2346d4", "#2346d4"], "one default for both");
		for (const scheme of ["light", "dark"]) assert.match(await value("--norn-text-accent", scheme), /^#[0-9a-f]{6}$/, "a derived token is resolved");
		assert.equal(await pair("--norn-surface-base").locator('[data-action="clear"]').isDisabled(), true);

		await pair("--norn-surface-base").locator('[data-scheme="light"]').evaluate((input) => {
			input.value = "#ffeecc";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("norn-preview-tokens"))["--norn-surface-base"]), "light-dark(#ffeecc, #101216)", "the dark value stays where it was");
		assert.equal(await pair("--norn-surface-base").locator('[data-action="clear"]').isEnabled(), true);

		await pair("--norn-surface-base").locator('[data-action="clear"]').click();
		assert.equal(await page.evaluate(() => localStorage.getItem("norn-preview-tokens")), null);
		assert.deepEqual([await value("--norn-surface-base", "light"), await value("--norn-surface-base", "dark")], ["#ffffff", "#101216"], "back to the default");
		await context.close();
	});

	test("only color tokens get color pickers, and every picker is named for its token and scheme", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/foundations/");
		assert.equal(await page.locator('preview-tokens [data-token="--norn-space-m"]').evaluate((field) => field.type), "text");
		assert.equal(await page.locator('preview-tokens [data-token="--norn-font-mono"]').evaluate((field) => field.type), "text");
		assert.equal(await page.locator('preview-tokens input[type="color"]').count(), 2 * (await page.locator("preview-tokens [data-pair]").count()));
		assert.equal(await page.locator('preview-tokens input[data-token="--norn-text-base"][data-scheme="dark"]').getAttribute("aria-label"), "Override --norn-text-base, dark mode");
		await page.close();
	});

	test("a font sample has no border, and the other samples keep theirs", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/foundations/");
		const border = (kind) => page.locator(`.sample[data-kind="${kind}"]`).first().evaluate((element) => getComputedStyle(element).borderTopWidth);
		assert.equal(await border("font"), "0px");
		assert.equal(await border("color"), "1px");
		assert.equal(await border("radius"), "1px");
		await page.close();
	});

	test("with storage blocked the page still works, and an override lasts for the page", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.addInitScript(() => {
			Object.defineProperty(window, "localStorage", {
				get() {
					throw new Error("blocked");
				},
			});
		});
		await page.goto(server.url + "/foundations/");
		await override(page, "--norn-ui-border-radius", "1rem");
		assert.equal(await rootToken(page, "--norn-ui-border-radius"), "1rem");
		assert.deepEqual(errors, []);
		await context.close();
	});

	test("a table override still wins over a saved one, and clearing it hands back to the saved one", async () => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await context.newPage();
		await page.goto(server.url + "/foundations/");
		await override(page, "--norn-ui-border-radius", "1rem");
		await page.goto(server.url + "/components/patterns/norn-card/");
		const frame = await frameOf(page);
		const radius = () => frame.evaluate(() => getComputedStyle(document.querySelector("norn-card article")).borderTopLeftRadius);
		assert.equal(await radius(), "16px", "the saved override");
		await page.locator('preview-props input[data-prop="--norn-card-radius"]').fill("2px");
		assert.equal(await radius(), "2px", "the table field");
		await page.locator('preview-props input[data-prop="--norn-card-radius"]').fill("");
		assert.equal(await radius(), "16px", "the saved override again");
		await context.close();
	});

	test("a space is a rule as wide as the token, centered, with a mark at each end, in the text color", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/foundations/");
		for (const [token, width] of [["--norn-space-xs", 8], ["--norn-space-m", 20], ["--norn-space-xl", 64]]) {
			const row = page.locator("tr", { has: page.locator(`th code:text-is("${token}")`) });
			const sample = row.locator(".sample");
			const [box, cell] = [await sample.boundingBox(), await row.locator("td.preview").boundingBox()];
			assert.equal(Math.round(box.width), width, `${token} is its own width`);
			assert.ok(Math.abs(box.x + box.width / 2 - (cell.x + cell.width / 2)) < 1, `${token} is centered`);
			const style = await sample.evaluate((element) => ({
				text: getComputedStyle(element.closest("tr").querySelector("th")).color,
				left: getComputedStyle(element).borderLeftColor,
				right: getComputedStyle(element).borderRightColor,
				rule: getComputedStyle(element, "::before").borderTopColor,
				ruleWidth: getComputedStyle(element, "::before").borderTopWidth,
			}));
			assert.deepEqual([style.left, style.right, style.rule, style.ruleWidth], [style.text, style.text, style.text, "1px"], `${token}: marks and rule in the text color`);
		}
		await page.close();
	});

	test("without a script the canvas is the frame and a link to open it on its own", async () => {
		const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
		const page = await context.newPage();
		await page.goto(server.url + "/components/patterns/norn-card/");
		assert.equal(await page.locator("preview-canvas [data-js]").first().isVisible(), false);
		assert.ok(await page.locator("preview-canvas a", { hasText: "Open on its own" }).first().isVisible());
		await context.close();
	});
});
