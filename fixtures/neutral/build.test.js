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

import { accentContrast, audit, launch, listsNeedingRole, pagesOf, resolveColor, serve, token } from "../lib/browser.js";
import { labelledBy } from "../lib/build.js";

const here = import.meta.dirname;
const read = (output, ...parts) => fs.readFileSync(path.join(output, ...parts), "utf8");
const eleventy = path.resolve(path.dirname(createRequire(import.meta.url).resolve("@11ty/eleventy")), "..", "cmd.cjs");

/** Matches `<name` for each opening tag in the markup. */
const tagNames = (html) => [...html.matchAll(/<([a-z][a-z0-9-]*)/g)].map((match) => match[1]);

/** Build in its own process, which Eleventy needs for a clean bundle state. Returns the output directory. */
function build({ config = "eleventy.config.js", output = "_site", prefix = "" } = {}) {
	fs.rmSync(path.join(here, output), { recursive: true, force: true });
	execFileSync(process.execPath, [eleventy, `--config=${config}`, "--quiet"], { cwd: here, env: { ...process.env, PATH_PREFIX: prefix }, stdio: "pipe" });
	return path.join(here, output);
}

/** The stylesheets a page links, in head order. */
const sheets = (html) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((match) => match[1]);

/** The page's bundle stylesheets: its own, when it has one. */
const bundles = (output, html) => sheets(html).filter((href) => href.startsWith("/bundle/")).map((href) => read(output, href));

describe("neutral fixture with a path prefix", () => {
	test("the current page is still marked, and links carry the prefix", () => {
		const output = build({ prefix: "/webc-resources/preview/7/" });
		const html = read(output, "docs", "two", "index.html");
		assert.ok(html.includes('<a href="/webc-resources/preview/7/docs/two/" aria-current="page">'));
		assert.ok(html.includes('rel="prev" href="/webc-resources/preview/7/docs/one/"'));
		assert.ok(html.includes('href="/webc-resources/preview/7/bundle/'));
		const plain = read(output, "plain", "index.html");
		assert.ok(!/<script[^>]*\ssrc/.test(plain) && !/\shref="\.?"/.test(plain), "no empty bundle tags under a prefix");
	});
});

describe("neutral fixture build", () => {
	let output;
	let pages;

	before(() => {
		output = build();
		pages = {
			index: read(output, "index.html"),
			plain: read(output, "plain", "index.html"),
			customNav: read(output, "custom-nav", "index.html"),
			one: read(output, "docs", "one", "index.html"),
			two: read(output, "docs", "two", "index.html"),
			three: read(output, "docs", "three", "index.html"),
			kit: read(output, "kit", "index.html"),
			translated: read(output, "translated", "index.html"),
			french: read(output, "fr", "index.html"),
			markdownBase: read(output, "markdown-base", "index.html"),
		};
	});

	test("props render after the layout chain, on a WebC page and a Markdown page", () => {
		assert.equal((pages.index.match(/<norn-card>/g) ?? []).length, 7);
		assert.ok(pages.index.includes('<a href="/docs/one/">Linked card</a>'));
		assert.ok(pages.index.includes("<span>Plain card</span>"));
		assert.ok(pages.one.includes("<h1>First page</h1>"));
		for (const html of Object.values(pages)) {
			assert.ok(!/<(norn-card|norn-card-grid|norn-side-nav|norn-sidebar-layout|norn-pager|norn-hero|norn-header|norn-footer|norn-skip-link|norn-link-button|norn-fact-list|norn-icon)[^>]*\s(@|items|title|body|href|heading|prev|next|brand|name|variant|label)[=\s>]/.test(html), "no props left on a kept tag");
		}
	});

	test("the Markdown body renders inside the docs shell, with its prose", () => {
		assert.ok(pages.one.includes("<code>inline code</code>"));
		assert.ok(pages.one.includes("<table>") && pages.one.includes("<blockquote>"));
	});

	test("a Markdown page on norn-base compiles the components its add-ons write", () => {
		const html = pages.markdownBase;
		assert.match(html, /<main id="main"[^>]*><h1>Markdown on the frame<\/h1>/);
		assert.match(html, /<norn-callout>\s*<div role="note" data-variant="tip">/);
		assert.equal((html.match(/<norn-callout>/g) ?? []).length, 1);
		assert.match(html, /<norn-code-block>\s*<figure>/);
		assert.equal((html.match(/<norn-code-block>/g) ?? []).length, 1);
		assert.match(html, /<norn-simple-table>\s*<span hidden id="[^"]+"><\/span>\s*<div><table>/);
		assert.ok(!/<norn-[a-z-]+[^>]*\s@[a-z]+=/.test(html), "no prop left on a kept tag");
		assert.ok(!html.includes("[!TIP]"));
	});

	test("a WebC page on norn-base is not compiled twice", () => {
		assert.equal((pages.index.match(/<norn-hero>/g) ?? []).length, 1);
		assert.equal((pages.index.match(/<header>/g) ?? []).length, 2, "the hero's header and the frame's");
		assert.equal((pages.plain.match(/<h1>Plain page<\/h1>/g) ?? []).length, 1);
	});

	test("norn-sidebar-layout shows the default norn-side-nav, or the navigation passed in the nav slot", () => {
		assert.ok(pages.one.includes("<norn-side-nav>") && labelledBy(pages.one, "nav", "Documentation") !== -1);
		assert.ok(pages.customNav.includes('<nav aria-label="Section">') && !pages.customNav.includes("<norn-side-nav") && !/\sslot=/.test(pages.customNav));
	});

	test("the prose styles come from norn-rich-text, not norn-sidebar-layout", () => {
		const [css] = bundles(output, pages.customNav);
		assert.ok(css.includes("@scope (norn-rich-text) to (") && css.includes("blockquote {") && /norn-sidebar-layout \{[\s\S]*?& > div \{/.test(css));
		const [layout] = css.match(/^(\s*)norn-sidebar-layout \{[\s\S]*?^\1\}/m);
		assert.ok(!/\b(blockquote|table|hr|code)\b/.test(layout));
	});

	test("norn-side-nav marks only the current page", () => {
		for (const [name, url] of [["one", "/docs/one/"], ["two", "/docs/two/"], ["three", "/docs/three/"]]) {
			const nav = pages[name].slice(pages[name].indexOf("<norn-side-nav>"), pages[name].indexOf("</norn-side-nav>"));
			assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1);
			assert.ok(pages[name].includes(`<a href="${url}" aria-current="page">`));
		}
	});

	test("norn-pager links the neighbors and omits missing ones", () => {
		assert.ok(pages.one.includes('rel="next" href="/docs/two/"') && !pages.one.includes('rel="prev"'));
		assert.ok(pages.two.includes('rel="prev" href="/docs/one/"') && pages.two.includes('rel="next" href="/docs/three/"'));
		assert.ok(pages.three.includes('rel="prev" href="/docs/two/"') && !pages.three.includes('rel="next"'));
	});

	test("norn-card-grid sets the mono title variant only when asked", () => {
		assert.equal((pages.index.match(/style="--norn-card-title-face: mono"/g) ?? []).length, 1);
		assert.equal((pages.index.match(/<norn-card-grid>\s*<ul role="list">/g) ?? []).length, 1);
	});

	test("the layer order is declared inline first, and the base, print, and project's reset styles bundle with the page", () => {
		const ORDER = "@layer norn.reset, norn.base, norn.layout, norn.components, norn.oss, norn.print;";
		for (const html of Object.values(pages)) {
			const [, head] = html.match(/<head>([\s\S]*?)<\/head>/);
			assert.ok(head.includes(`<style>${ORDER}</style>`) && head.indexOf(ORDER) < head.indexOf('<link rel="stylesheet"'), "layer order leads");
			const [css] = bundles(output, html);
			for (const layer of ["reset", "base", "print"]) assert.ok(css.includes(`@layer norn.${layer} {`), layer);
			assert.ok(!css.includes(ORDER), "the order is declared once");
			const base = css.slice(css.indexOf("@layer norn.base {"), css.indexOf("@layer norn.print {"));
			assert.ok(base.length > 0 && !/^\s*--norn-[\w-]+\s*:/m.test(base), "the base defines no token: each component carries its default");
		}
	});

	test("each page's own CSS holds only the components on it, each once", () => {
		const [cards] = bundles(output, pages.index);
		for (const name of ["norn-hero", "norn-link-button", "norn-fact-list", "norn-card", "norn-card-grid", "norn-header", "norn-footer", "norn-skip-link"]) assert.ok(cards.includes(`${name} {`), name);
		assert.ok(!/norn-sidebar-layout \{[^}]*container-type|norn-pager|norn-side-nav/.test(cards), "no component rule of one the page lacks");
		assert.equal((cards.match(/norn-card \{/g) ?? []).length, 1);
		assert.ok(!cards.includes("--norn-chrome"), "the hero no longer turns on the terminal frame");
		const [docs] = bundles(output, pages.one);
		for (const name of ["norn-sidebar-layout", "norn-side-nav", "norn-pager", "norn-header"]) assert.ok(docs.includes(`${name} {`), name);
		assert.ok(!/norn-card|norn-card-grid|norn-hero/.test(docs));
	});

	test("the project stylesheet follows the bundles and sits outside every layer", () => {
		for (const html of [pages.index, pages.one]) {
			const links = sheets(html);
			assert.equal(links.at(-1), "/assets/project.css");
			assert.ok(links.slice(0, -1).every((href) => href.startsWith("/bundle/")));
		}
		assert.ok(!read(output, "assets", "project.css").includes("@layer"));
	});

	test("norn-head emits the document metadata and Open Graph tags", () => {
		const [, head] = pages.index.match(/<head>([\s\S]*?)<\/head>/);
		assert.equal((head.match(/<title>/g) ?? []).length, 1);
		for (const expected of ['<meta charset="utf-8">', '<link rel="canonical" href="https://example.com/">', '<meta name="description" content="A fixture site built from the generic patterns.">', '<meta name="color-scheme" content="light dark">', '<meta property="og:title" content="Neutral fixture">', '<meta property="og:url" content="https://example.com/">']) {
			assert.ok(head.includes(expected), expected);
		}
		assert.equal((head.match(/name="theme-color"/g) ?? []).length, 2, "one per scheme");
	});

	test("the skip link comes first, keeps its text with a line break inside its tag, and targets the main landmark", () => {
		for (const [name, html] of Object.entries(pages)) {
			assert.ok(html.indexOf("<norn-skip-link>") < html.indexOf("<norn-header>"));
			assert.ok(html.includes(`<a href="#main">${name === "french" ? "Aller au contenu" : "Skip to content"}</a>`), name);
			assert.ok(html.includes('<main id="main" tabindex="-1">'));
		}
	});

	test("a line break inside the tag leaves the options and the copy label in place", () => {
		assert.ok(pages.kit.includes('<input type="radio" name="size" value="s" checked>'));
		assert.ok(pages.kit.includes('<input type="radio" name="size" value="l">'));
		const copy = pages.kit.slice(pages.kit.lastIndexOf("<norn-copy-button>", pages.kit.indexOf('data-source="install"')), pages.kit.indexOf('data-source="install"'));
		assert.ok(copy.includes('<span data-string="copy">Copy</span>') && copy.includes('<span data-string="copied">Copied</span>'));
	});

	test("a translated page sets every string through slots, with no English left", () => {
		const html = pages.translated.slice(pages.translated.indexOf("<main"), pages.translated.indexOf("</main>"));
		assert.ok(html.includes("<span data-prefix><span>Remarque : </span></span>"));
		assert.ok(labelledBy(html, "search", "Rechercher") !== -1 && labelledBy(html, "nav", "الصفحات") !== -1);
		const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/\sdata-string="[^"]*"/g, "").replace(/\s[a-z-]+(?==")/g, " ");
		assert.ok(!/\b(Copy|Note|Sample|results?|Table|Search|Pager)\b/.test(visible), "no English default in the text or attribute values");
	});

	test("a page under fr/ takes every component string from componentStrings, by page.lang", () => {
		const html = pages.french;
		assert.ok(html.includes('<html lang="fr" dir="ltr">') && pages.index.includes('<html lang="en" dir="ltr">'));
		for (const text of [">Aller au contenu</a>", '<span data-string="none">Aucun résultat</span>', "<span>Astuce</span>", "<span data-prefix>Attention : </span>", '<span data-string="copy">Copier</span>', '<span data-string="label">Thème</span>']) {
			assert.ok(html.includes(text), text);
		}
		for (const [tag, name] of [["nav", "Principal"], ["nav", "Sur cette page"], ["search", "Rechercher"], ["nav", "Pages voisines"]]) assert.ok(labelledBy(html, tag, name) !== -1, name);
		const components = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/\sdata-string="[^"]*"/g, "").replace(/\s[a-z-]+(?==")/g, " ");
		assert.ok(!/\b(Skip to content|Primary|On this page|No results|Tip|Warning|Copy|Color scheme|Pager)\b/.test(components), "no English default left");
		assert.ok(pages.index.includes(">Skip to content</a>"), "an English page keeps the defaults");
	});

	test("norn-header renders the brand and links", () => {
		assert.ok(pages.index.includes('<a rel="home" href="/">'));
		assert.ok(labelledBy(pages.index, "nav", "Primary") !== -1);
		assert.match(pages.index, /<a href="\/docs\/one\/"><norn-icon>\s*<svg [^>]*aria-hidden="true"/);
		assert.ok(!/<norn-header[^>]*\s(brand|links|logo)=/.test(pages.index));
	});

	test("norn-side-nav lists child pages under their parent, and marks the parent of the current page", () => {
		const nav = pages.kit.slice(labelledBy(pages.kit, "nav", "Guides"));
		assert.match(nav, /<a href="\/docs\/one\/" aria-current="true"><norn-icon>/);
		assert.ok(nav.includes('<a href="/kit/" aria-current="page"><span>Kit</span></a>'));
		assert.ok(nav.includes('<a href="/plain/"><span>Plain</span></a>'));
		assert.ok(nav.includes('<a href="/"><span>Home</span></a>'));
	});

	test("a section takes its anchor from its own id, and the heading is its first child", () => {
		assert.match(pages.index, /<section id="features">\s*<h2>Features<\/h2>/);
	});

	test("norn-footer fills its slots and leaves no slot markup behind", () => {
		const [, footer] = pages.index.match(/<footer>([\s\S]*?)<\/footer>/);
		assert.ok(footer.includes("<strong>Neutral fixture</strong>") && labelledBy(footer, "nav", "Footer") !== -1 && footer.includes("Footer closing line."));
		assert.ok(footer.indexOf("Before the columns.") < footer.indexOf("<strong>Neutral fixture</strong>") && footer.indexOf("<strong>Neutral fixture</strong>") < footer.indexOf("Footer closing line."), "before, columns, after");
		for (const html of Object.values(pages)) assert.ok(!/<template|\sslot=/.test(html));
	});

	test("norn-hero renders one h1, the actions, and the chips", () => {
		assert.equal((pages.index.match(/<h1>/g) ?? []).length, 1);
		const [, actions] = pages.index.match(/<nav aria-label="Get started">([\s\S]*?)<\/nav>/);
		assert.equal((actions.match(/<a /g) ?? []).length, 2);
		assert.ok(actions.includes('<a href="#features" data-variant="primary">Get started</a>'));
		assert.ok(actions.includes('<a href="https://example.com/source" data-variant="secondary">View the source</a>'));
		assert.ok(pages.index.includes("<li>Free &amp; open source</li>") || pages.index.includes("<li>Free & open source</li>"));
	});

	test("norn-icon hides the drawing, reads a labeled icon's slot as text, and marks the directional ones", () => {
		assert.ok(/<svg viewBox="0 0 24 24" aria-hidden="true">[\s\S]*?<\/svg>\s*<span>Warning<\/span>/.test(pages.kit));
		assert.ok(!/role="img"|aria-label=/.test(pages.kit.slice(pages.kit.indexOf('<p id="icons">'), pages.kit.indexOf("<h2>Link buttons"))));
		assert.ok(pages.kit.includes('<svg viewBox="0 0 24 24" aria-hidden="true" data-mirror>'));
	});

	test("a project icon keeps its viewBox and paint, drops the title and size, and stays hidden from assistive tech", () => {
		const icon = pages.kit.slice(pages.kit.indexOf('<p id="project-icon">'), pages.kit.indexOf("</p>", pages.kit.indexOf('<p id="project-icon">')));
		assert.match(icon, /<svg viewBox="0 0 20 20" aria-hidden="true" data-project>\s*<path fill="currentColor" d="M10 1l2\.6/);
		assert.ok(!/<title|width=|height=/.test(icon), "no title, width, or height");
		assert.match(icon, /<\/svg>\s*<span>Badge<\/span>/);
	});

	test("an unknown icon name fails the build, and lists the built-in and project names", () => {
		const content = path.join(here, "variants", "bad-icon", "content");
		fs.mkdirSync(content, { recursive: true });
		fs.writeFileSync(path.join(content, "bad-icon.webc"), '<norn-icon @name="nope"></norn-icon>');
		try {
			assert.throws(() => build({ config: "variants/bad-icon/eleventy.config.js", output: "_site-bad-icon" }), /no icon named "nope"[\s\S]*Built-in: accessibility[\s\S]*Project: badge/);
		} finally {
			fs.rmSync(content, { recursive: true, force: true });
			fs.rmSync(path.join(here, "_site-bad-icon"), { recursive: true, force: true });
		}
	});

	test("Markdown headings link to themselves, and norn-toc lists them", () => {
		assert.ok(pages.one.includes('<h2 id="a-second-level-heading"><a href="#a-second-level-heading">A second-level heading</a></h2>'));
		const toc = pages.one.slice(labelledBy(pages.one, "nav", "On this page"));
		assert.ok(toc.includes('<li><a href="#a-second-level-heading">A second-level heading</a><ol><li><a href="#a-third-level-heading">A third-level heading</a></li></ol></li>'), "the h3 sits in a list inside its h2");
		assert.ok(!pages.three.includes("On this page"), "no contents for a page with fewer than two headings");
	});

	test("norn-heading-anchor renders the heading at its level, and norn-breadcrumbs marks the current page", () => {
		assert.ok(pages.kit.includes('<h2 id="anchors"><a href="#anchors">Anchors</a></h2>'));
		assert.ok(pages.kit.includes('<h3 id="deeper"><a href="#deeper">Deeper</a></h3>'));
		const start = labelledBy(pages.kit, "nav", "Breadcrumb");
		const trail = pages.kit.slice(start, pages.kit.indexOf("</ol>", start));
		assert.equal((trail.match(/<norn-icon>/g) ?? []).length, 2, "a separator between each pair");
		assert.ok(trail.includes('<a href="/kit/" aria-current="page">Component kit</a>'));
	});

	test("norn-search without a script is a search landmark with a form that searches the site on the web", () => {
		const search = pages.kit.slice(pages.kit.indexOf("<search"), pages.kit.indexOf("</search>"));
		assert.ok(labelledBy(search, "search", "Search") === 0);
		assert.ok(search.includes('<form action="https://duckduckgo.com/" method="get">'));
		assert.ok(search.includes('<input type="hidden" name="sites" value="example.com">'));
	});

	test("no HTML comments in the output", () => {
		for (const html of Object.values(pages)) assert.ok(!html.includes("<!--"));
	});

	test("a page without a script has no script tag and no empty src or href", () => {
		assert.ok(!/<script[^>]*\ssrc/.test(pages.plain));
		assert.equal(sheets(pages.plain).at(-1), "/assets/project.css");
		for (const html of Object.values(pages)) assert.ok(!/\ssrc=""/.test(html) && !/\shref=""/.test(html));
	});

	test("the head holds only meta, title, link, style, and script", () => {
		for (const html of Object.values(pages)) {
			const [, head] = html.match(/<head>([\s\S]*?)<\/head>/);
			assert.deepEqual(
				[...new Set(tagNames(head))].filter((name) => !["link", "meta", "script", "style", "title"].includes(name)),
				[],
			);
		}
	});

	test("a summary twitter:card and no image tags without an image, and no OSS site content", () => {
		for (const html of Object.values(pages)) assert.ok(html.includes('<meta name="twitter:card" content="summary">') && !html.includes("og:image") && !/\boss\b|\boss-|allons-y/i.test(html.replace(/<style>@layer [^<]*<\/style>/, "")), "nothing past the layer order names the OSS site theme");
	});
});

describe("neutral fixture in a browser", () => {
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

	test("project CSS beats the packaged layers, and the layers rank as declared", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/");
		assert.equal(await page.$eval("norn-card article", (element) => getComputedStyle(element).borderTopLeftRadius), "2px", "unlayered project rule wins");
		const action = page.locator("norn-hero norn-link-button a").first();
		assert.equal(await action.evaluate((element) => getComputedStyle(element).textDecorationLine), "none", "components outrank base");
		assert.equal(await action.evaluate((element) => getComputedStyle(element).color), await resolveColor(page, token("text.on-accent")));
		assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), await resolveColor(page, token("surface.base"), "background-color"), "base applies the token");
		await page.close();
	});

	test("text on any accent, and links in any accent, keep 4.5:1 in light and dark", async () => {
		for (const colorScheme of ["light", "dark"]) {
			const page = await browser.newPage({ colorScheme });
			await page.goto(server.url + "/");
			const { count, ink, link } = await accentContrast(page);
			assert.ok(count > 500, "a real sweep");
			assert.ok(ink >= 4.5, `${colorScheme}: --norn-text-on-accent reached ${ink.toFixed(2)}:1`);
			assert.ok(link >= 4.5, `${colorScheme}: --norn-text-accent reached ${link.toFixed(2)}:1`);
			await page.close();
		}
	});

	test("directional icons mirror in right-to-left text, and visually hidden text is read but not shown", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/kit/");
		assert.equal(await page.$eval("#rtl svg", (svg) => getComputedStyle(svg).transform), "matrix(-1, 0, 0, 1, 0, 0)");
		assert.equal(await page.$eval("#icons norn-icon:last-child svg", (svg) => getComputedStyle(svg).transform), "none");
		const project = await page.$eval("#project-icon svg", (svg) => {
			const { fill, stroke } = getComputedStyle(svg.querySelector("path"));
			return { box: [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height, parseFloat(getComputedStyle(svg).fontSize)], fill, stroke, color: getComputedStyle(svg).color };
		});
		assert.deepEqual(project.box.slice(0, 2), [project.box[2], project.box[2]], "a project icon is 1em square, not the file's size");
		assert.equal(project.fill, project.color, "a filled project icon follows the text color");
		assert.equal(project.stroke, "none", "a project icon takes no stroke from the built-in styling");
		const hidden = page.locator(".visually-hidden");
		assert.deepEqual(await hidden.evaluate((element) => [element.getBoundingClientRect().width, getComputedStyle(element).clipPath]), [1, "inset(50%)"]);
		assert.equal(await page.getByRole("link", { name: "Jump to icons on this page" }).count(), 1);
		await page.close();
	});

	test("the docs navigation stays in view on a wide page, and scrolls with the page when narrow", async () => {
		for (const [width, position] of [[1280, "sticky"], [400, "static"]]) {
			const page = await browser.newPage({ viewport: { width, height: 800 } });
			await page.goto(server.url + "/docs/one/");
			assert.equal(await page.$eval("norn-sidebar-layout > div > details", (nav) => getComputedStyle(nav).position), position, `${width}px`);
			await page.close();
		}
	});

	test("the footer lead column caps at 25rem on a wide footer, with the link columns in the same row", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
		await page.goto(server.url + "/");
		const boxes = await page.$$eval("norn-footer footer > div:first-child > *", (columns) => columns.map((column) => column.getBoundingClientRect()).map(({ y, width }) => ({ y: Math.round(y), width })));
		assert.ok(boxes[0].width <= 400, `lead is ${boxes[0].width}px`);
		assert.ok(boxes.every(({ y }) => y === boxes[0].y), "one row");
		await page.close();
	});

	test("norn-theme-toggle sets and saves the scheme, keeps every toggle in step, and System hands back to the visitor's setting", async () => {
		const context = await browser.newContext({ colorScheme: "light" });
		const page = await context.newPage();
		await page.goto(server.url + "/kit/");
		const [first, second] = [page.locator("norn-theme-toggle").nth(0), page.locator("norn-theme-toggle").nth(1)];
		assert.equal(await first.getByRole("radio", { name: "System" }).isChecked(), true);
		assert.equal(await second.getByRole("group", { name: "Scheme, again" }).count(), 1);
		await first.locator("label", { hasText: "Dark" }).click();
		assert.equal(await page.evaluate(() => [document.documentElement.style.colorScheme, localStorage.getItem("color-scheme")].join()), "dark,dark");
		assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(16, 18, 22)");
		assert.equal(await second.getByRole("radio", { name: "Dark" }).isChecked(), true, "the other toggle follows");
		await second.locator("label", { hasText: "System" }).click();
		assert.equal(await page.evaluate(() => [document.documentElement.style.colorScheme, localStorage.getItem("color-scheme")].join()), ",");
		await context.close();
	});

	test("a saved scheme applies from the head, before any bundle script runs", async () => {
		const context = await browser.newContext({ colorScheme: "light" });
		const page = await context.newPage();
		await page.goto(server.url + "/plain/");
		await page.evaluate(() => localStorage.setItem("color-scheme", "dark"));
		await page.route("**/bundle/*.js", (route) => route.abort());
		await page.goto(server.url + "/plain/");
		assert.equal(await page.evaluate(() => document.documentElement.style.colorScheme), "dark");
		await context.close();
	});

	test("without a script the theme toggle stays hidden", async () => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto(server.url + "/kit/");
		assert.equal(await page.locator("norn-theme-toggle").first().isVisible(), false);
		await context.close();
	});

	test("norn-notice names its severity before the message, and only a live one takes a live role", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/kit/");
		const [saved, failed] = [page.locator("norn-notice").nth(0), page.locator("norn-notice").nth(1)];
		assert.match(await saved.locator("[data-severity]").innerText(), /Open the docs/);
		assert.equal(await saved.locator("[data-severity]").getAttribute("role"), null);
		assert.equal(await failed.locator("[data-severity]").getAttribute("role"), "alert");
		assert.equal((await failed.locator("[data-prefix]").textContent()).trim(), "Error:");
		assert.equal(await saved.locator("[data-severity] > div").last().isVisible(), true, "the action shows");
		assert.equal(await failed.locator("[data-severity] > div").last().isVisible(), false, "an empty action slot takes no room");
		await page.close();
	});

	test("norn-callout is a note with its title and icon, and norn-accordion keeps one section open by name", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/kit/");
		assert.deepEqual(await page.getByRole("note").evaluateAll((notes) => notes.map((note) => note.querySelector("p").textContent.trim())), ["Note", "Careful"]);
		const sections = page.locator("norn-accordion details");
		await sections.nth(0).locator("summary").click();
		await sections.nth(1).locator("summary").click();
		assert.deepEqual(await sections.evaluateAll((all) => all.map((details) => details.open)), [false, true]);
		await page.keyboard.press("Enter");
		assert.equal(await sections.nth(1).evaluate((details) => details.open), false, "the keyboard toggles it too");
		await page.close();
	});

	test("norn-search lists results as the visitor types, keeping only the highlights from the excerpt", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/kit/");
		await page.waitForFunction(() => document.querySelector("norn-search").hasAttribute("data-live"));
		await page.getByRole("searchbox", { name: "Search" }).fill("first");
		await page.locator("norn-search li").first().waitFor();
		assert.deepEqual(await page.locator("norn-search li a").allTextContents(), ["First page", "Second page"]);
		assert.equal(await page.locator("norn-search [role=status]").textContent(), "2 results");
		assert.equal(await page.locator("norn-search li").first().locator("p").innerHTML(), "The <mark>first</mark> page &amp; its body.");
		await page.getByRole("searchbox", { name: "Search" }).fill("nothing like this");
		await page.waitForFunction(() => document.querySelector("norn-search [role=status]").textContent === "No results");
		assert.equal(await page.locator("norn-search ol").isVisible(), false);
		await page.close();
	});

	test("norn-search keeps the plain form when there is no index", async () => {
		const page = await browser.newPage();
		await page.route("**/assets/pagefind/pagefind.js", (route) => route.abort());
		await page.goto(server.url + "/kit/");
		await page.waitForTimeout(300);
		assert.equal(await page.locator("norn-search").getAttribute("data-live"), null);
		assert.equal(await page.locator("norn-search button").isVisible(), true);
		await page.close();
	});

	test("norn-toc marks the section in view", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 500 } });
		await page.goto(server.url + "/docs/one/");
		const current = () => page.locator('norn-toc a[aria-current="location"]').textContent();
		assert.equal(await current(), "A second-level heading");
		await page.evaluate(() => document.getElementById("a-third-level-heading").scrollIntoView({ block: "start" }));
		await page.waitForFunction(() => document.querySelector('norn-toc a[aria-current="location"]')?.textContent === "A third-level heading");
		await page.close();
	});

	test("smooth scrolling applies only when motion is not reduced", async () => {
		for (const [reducedMotion, expected] of [["no-preference", "smooth"], ["reduce", "auto"]]) {
			const context = await browser.newContext({ reducedMotion });
			const page = await context.newPage();
			await page.goto(server.url + "/");
			assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), expected, reducedMotion);
			await context.close();
		}
	});

	test("norn-sidebar-layout stacks its columns when the frame is narrow, not by the viewport", async () => {
		for (const [width, columns] of [[1280, 2], [600, 1]]) {
			const page = await browser.newPage({ viewport: { width, height: 800 } });
			await page.goto(server.url + "/docs/one/");
			const count = await page.$eval("norn-sidebar-layout > div", (grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
			assert.equal(count, columns, `${width}px wide viewport`);
			await page.close();
		}
	});

	test("slotted footer content lines up with the columns", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/");
		const left = (text) => page.locator("norn-footer", { has: page.locator("p") }).getByText(text, { exact: true }).evaluate((element) => element.getBoundingClientRect().left);
		assert.equal(await left("Footer closing line."), await left("Patterns only."));
		await page.close();
	});

	test("norn-search counts in the page's language, with its plural forms", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/translated/");
		await page.waitForFunction(() => document.querySelector("norn-search").hasAttribute("data-live"));
		const status = page.locator("norn-search [role=status]");
		await page.getByRole("searchbox", { name: "Rechercher" }).fill("plain");
		await page.waitForFunction(() => document.querySelector("norn-search [role=status]").textContent !== "");
		assert.equal(await status.textContent(), "1 résultat");
		await page.getByRole("searchbox", { name: "Rechercher" }).fill("first");
		await page.waitForFunction(() => document.querySelector("norn-search [role=status]").textContent.endsWith("résultats"));
		assert.equal(await status.textContent(), "2 résultats");
		await page.getByRole("searchbox", { name: "Rechercher" }).fill("rien du tout");
		await page.waitForFunction(() => document.querySelector("norn-search [role=status]").textContent === "Aucun résultat");
		await page.close();
	});

	test("norn-search counts in French on a page whose strings come from componentStrings", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/fr/");
		await page.waitForFunction(() => document.querySelector("norn-search").hasAttribute("data-live"));
		await page.getByRole("searchbox", { name: "Rechercher" }).fill("plain");
		await page.waitForFunction(() => document.querySelector("norn-search [role=status]").textContent === "1 résultat");
		await page.close();
	});

	test("norn-simple-table names its scroll box from its column headings, without a caption or a label", async () => {
		const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
		await page.goto(server.url + "/translated/");
		await page.waitForFunction(() => document.querySelector("#headed > div").hasAttribute("tabindex"));
		assert.equal(await page.locator("#headed > div").getAttribute("aria-label"), "Nom, Valeur, Description");
		await page.close();
	});

	test("norn-pager's arrows point the other way in right-to-left text", async () => {
		const page = await browser.newPage();
		await page.goto(server.url + "/translated/");
		const arrow = (rel) => page.$eval(`norn-pager a[rel="${rel}"] svg`, (icon) => getComputedStyle(icon).transform);
		assert.equal(await arrow("prev"), "matrix(-1, 0, 0, 1, 0, 0)");
		assert.equal(await arrow("next"), "matrix(-1, 0, 0, 1, 0, 0)");
		await page.goto(server.url + "/docs/two/");
		assert.equal(await arrow("prev"), "none");
		await page.close();
	});

	test("a component slotted into a container keeps the styles it has on its own", async () => {
		const PROPS = ["display", "flex-direction", "list-style-type", "padding-inline-start", "padding-block", "color", "text-decoration-line", "gap"];
		const styles = (page, selector) => page.locator(selector).first().evaluate((element, props) => props.map((prop) => `${prop}: ${getComputedStyle(element).getPropertyValue(prop)}`), PROPS);
		const search = async (page) => {
			await page.waitForFunction(() => document.querySelector("norn-search").hasAttribute("data-live"));
			await page.getByRole("searchbox", { name: "Search" }).fill("first");
			await page.locator("norn-search li a").first().waitFor();
		};
		const alone = await browser.newPage();
		await alone.goto(server.url + "/kit/");
		const slotted = await browser.newPage();
		await slotted.goto(server.url + "/slotted/");
		for (const selector of ["#in-prose ul", "#in-footer ul", "#in-prose li", "#in-footer li"]) {
			assert.deepEqual(await styles(slotted, selector), await styles(alone, `norn-fact-list ${selector.split(" ")[1]}`), selector);
		}
		for (const page of [alone, slotted]) await search(page);
		for (const selector of ["norn-search li a", "norn-search button norn-icon"]) {
			assert.deepEqual(await styles(slotted, selector), await styles(alone, selector), `${selector} in norn-side-nav`);
		}
		await alone.close();
		await slotted.close();
	});
});

describe("overriding a packaged component", () => {
	test("a boolean prop is on when bare, \"true\", or true, and off when \"false\" or false", () => {
		const content = path.join(here, "content", "booleans.webc");
		const forms = { bare: ["@X", true], string: ['@X="true"', true], value: [':@X="true"', true], string_off: ['@X="false"', false], value_off: [':@X="false"', false] };
		fs.writeFileSync(
			content,
			Object.entries(forms)
				.map(([key, [form]]) =>
					[
						`<norn-card-grid id="grid-${key}" ${form.replace("X", "mono")}><li>Card</li></norn-card-grid>`,
						`<norn-notice id="notice-${key}" ${form.replace("X", "live")}><p>Note</p></norn-notice>`,
						`<norn-segmented-control id="control-${key}" ${form.replace("X", "icon-only")} @legend="Pick" @name="pick-${key}" :@options="[{ value: 'a', label: 'A' }]"></norn-segmented-control>`,
					].join("\n"),
				)
				.join("\n"),
		);
		try {
			const html = read(build(), "booleans", "index.html");
			const element = (tag, id) => html.match(new RegExp(`<${tag} id="${id}">[\\s\\S]*?</${tag}>`))[0];
			for (const [key, [form, on]] of Object.entries(forms)) {
				assert.equal(element("norn-card-grid", `grid-${key}`).includes("title-face: mono"), on, `norn-card-grid ${form}`);
				assert.equal(/role="(status|alert)"/.test(element("norn-notice", `notice-${key}`)), on, `norn-notice ${form}`);
				assert.equal(element("norn-segmented-control", `control-${key}`).includes("data-icon-only"), on, `norn-segmented-control ${form}`);
			}
		} finally {
			fs.rmSync(content);
			fs.rmSync(path.join(here, "_site", "booleans"), { recursive: true, force: true });
		}
	});

	test("norn-segmented-control options without a name fail the build", () => {
		const content = path.join(here, "content", "nameless.webc");
		fs.writeFileSync(content, "<norn-segmented-control @legend=\"Pick\" :@options=\"[{ value: 'a', label: 'A' }]\"></norn-segmented-control>");
		try {
			assert.throws(() => build({ output: "_site-nameless" }), /`:@options` needs `@name`/);
		} finally {
			fs.rmSync(content);
			fs.rmSync(path.join(here, "_site-nameless"), { recursive: true, force: true });
		}
	});

	test("a project layout named like a shipped one fails the build", () => {
		assert.throws(() => build({ config: "variants/same-name/eleventy.config.js", output: "_site-same-name" }), /variants\/same-name\/_layouts\/norn-docs\.webc has the name of a shipped layout/);
	});

	test("the WebC plugin registered beside the Norn plugin fails the build", () => {
		assert.throws(() => build({ config: "variants/webc-twice/eleventy.config.js", output: "_site-webc-twice" }), /@11ty\/eleventy-plugin-webc is registered twice/);
	});

	test("a project component named like a packaged one fails the build", () => {
		assert.throws(() => build({ config: "variants/collision/eleventy.config.js", output: "_site-collision" }), /norn-card/i);
	});

	test("excluding it from the glob lets the project's version render", () => {
		const output = build({ config: "variants/override/eleventy.config.js", output: "_site-override" });
		const html = read(output, "index.html");
		assert.ok(html.includes("<article data-project-card>"));
		assert.ok(!html.includes("<norn-card>"), "the packaged card is not used");
	});
});

describe("the layouts without a props mapping", () => {
	let output;

	before(() => {
		output = build({ config: "variants/plain-data/eleventy.config.js", output: "_site-plain-data" });
	});

	after(() => fs.rmSync(output, { recursive: true, force: true }));

	test("read the page's same-named data, and take anything other than a list where a list goes as empty", () => {
		const html = read(output, "index.html");
		assert.ok(html.includes("<title>Plain data: Plain name</title>") && html.includes('<html lang="en" dir="ltr">'));
		assert.ok(/<a href="\/"( aria-current="page")?><span>Plain home<\/span><\/a>|<a href="\/"( aria-current="page")?>Plain home<\/a>/.test(html), "the nav from front matter");
		assert.ok(html.includes("<p><strong>Plain name</strong></p>") && html.includes("<p>Read off the page data</p>"), "the footer lead, with a footer that is not an object");
		const docs = read(output, "docs", "index.html");
		assert.ok(docs.includes('<a href="/docs/" aria-current="page"><span>A docs page</span></a>') && docs.includes('rel="prev" href="/"'), "the docs list and the pager from front matter");
		assert.ok(!/<norn-header>[\s\S]*<a href="[^"]*">an object where a list goes/.test(docs), "a nav that is not a list is empty");
	});

	test("register no reset and no stylesheet of the project's, and leave no stray page for a layout", () => {
		const html = read(output, "index.html");
		assert.ok(!bundles(output, html).join("\n").includes("@layer norn.reset {"), "no reset");
		assert.deepEqual(sheets(html).filter((href) => !href.startsWith("/bundle/")), [], "only the bundle");
		assert.ok(!fs.existsSync(path.join(output, "_includes")), "no stray page");
	});
});
