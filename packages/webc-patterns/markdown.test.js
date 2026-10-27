/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import markdownIt from "markdown-it";

import * as main from "./index.js";
import { callouts, headingAnchors, headings, scrollTables, slugify, webcTags } from "./markdown.js";

test("the main entry exports nothing for Markdown", () => {
	for (const name of ["callouts", "headingAnchors", "headings", "scrollTables", "slugify", "webcTags"]) assert.equal(name in main, false, name);
});

test("scrollTables: wraps each Markdown table in norn-simple-table, and leaves other blocks alone", () => {
	const md = markdownIt();
	scrollTables(md);
	const html = md.render("| a | b |\n| - | - |\n| 1 | 2 |\n\nText.\n");
	assert.match(html, /^<norn-simple-table><table>\n<thead>[\s\S]*<\/table>\n<\/norn-simple-table>\n<p>Text\.<\/p>\n$/);
});

test("callouts: a marked blockquote renders as norn-callout, with the marker gone", () => {
	const md = markdownIt();
	callouts(md);
	assert.equal(md.render("> [!WARNING]\n> Back up first.\n"), '<norn-callout @variant="warning">\n<p>Back up first.</p>\n</norn-callout>\n');
	assert.equal(md.render("> [!tip] Inline text.\n"), '<norn-callout @variant="tip">\n<p>Inline text.</p>\n</norn-callout>\n');
});

test("callouts: a marker alone in its paragraph leaves no empty paragraph, and nested quotes close in place", () => {
	const md = markdownIt();
	callouts(md);
	const html = md.render("> [!NOTE]\n>\n> First.\n>\n> > Quoted.\n");
	assert.ok(html.startsWith('<norn-callout @variant="note">\n'), html);
	assert.ok(!/<p>\s*<\/p>/.test(html), html);
	assert.ok(html.includes("<blockquote>\n<p>Quoted.</p>\n</blockquote>\n</norn-callout>\n"), html);
});

test("callouts: a plain blockquote, or an unknown marker, stays a blockquote", () => {
	const md = markdownIt();
	callouts(md);
	assert.equal(md.render("> Just a quote.\n"), "<blockquote>\n<p>Just a quote.</p>\n</blockquote>\n");
	assert.ok(md.render("> [!DANGER] Nope.\n").startsWith("<blockquote>"));
});

test("slugify: lowercase, accents off, one hyphen per run, never empty", () => {
	assert.equal(slugify("Crème brûlée & `code`!"), "creme-brulee-code");
	assert.equal(slugify("  --  "), "section");
});

test("slugify: keeps the letters and digits of any script, and leaves ASCII ids as they were", () => {
	assert.equal(slugify("مرحبا بالعالم"), "مرحبا-بالعالم");
	assert.equal(slugify("日本語の見出し"), "日本語の見出し");
	assert.equal(slugify("हिन्दी शीर्षक"), "हिन्दी-शीर्षक");
	assert.equal(slugify("Ωμέγα Δύο"), "ωμέγα-δύο");
	assert.equal(slugify("Straße 2"), "straße-2");
	assert.equal(slugify("Ünïcödé"), "unicode");
	for (const [text, id] of [["Getting started", "getting-started"], ["Install with your package manager", "install-with-your-package-manager"], ["`npm` & more", "npm-more"], ["snake_case & v1.2", "snake-case-v1-2"], ["Café au lait", "cafe-au-lait"]]) assert.equal(slugify(text), id, text);
});

test("headingAnchors: ids stay unique across the renders of one page, such as two Markdown blocks", () => {
	const md = markdownIt();
	headingAnchors(md);
	const page = { url: "/one/" };
	assert.ok(md.render("## Same\n", { page }).includes('id="same"'));
	assert.ok(md.render("## Same\n", { page }).includes('id="same-2"'), "the second block counts on");
	assert.ok(md.render("## Same 2\n", { page }).includes('id="same-2-2"'), "a heading never takes an id already given");
	assert.ok(md.render("## Same\n", { page: { url: "/two/" } }).includes('id="same"'), "another page starts again");
});

test("headingAnchors: a heading that reads like a numbered repeat never takes its id", () => {
	const md = markdownIt();
	headingAnchors(md);
	const html = md.render("## Step\n\n## Step 2\n\n## Step\n");
	assert.deepEqual([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]), ["step", "step-2", "step-3"]);
});

test("headingAnchors: h2 and h3 link to themselves, repeats get a number, and h4 is left alone", () => {
	const md = markdownIt();
	headingAnchors(md);
	const html = md.render("## Install it\n\n### `npm` & more\n\n## Install it\n\n#### Deep\n");
	assert.ok(html.includes('<h2 id="install-it"><a href="#install-it">Install it</a></h2>'), html);
	assert.ok(html.includes('<h3 id="npm-more"><a href="#npm-more"><code>npm</code> &amp; more</a></h3>'), html);
	assert.ok(html.includes('<h2 id="install-it-2"><a href="#install-it-2">Install it</a></h2>'), html);
	assert.ok(html.includes("<h4>Deep</h4>"), html);
});

test("headingAnchors: a heading that holds a link gets an id and keeps the author's link, with no link around it", () => {
	const md = markdownIt();
	headingAnchors(md);
	assert.equal(md.render("## [Linked](/somewhere/) heading\n"), '<h2 id="linked-heading"><a href="/somewhere/">Linked</a> heading</h2>\n');
});

test("headingAnchors: each render starts its count again", () => {
	const md = markdownIt();
	headingAnchors(md, { levels: [2] });
	md.render("## Same\n", {});
	assert.ok(md.render("## Same\n", {}).includes('id="same"'));
});

test("headings: lists the anchored headings at the chosen levels, as plain text", () => {
	const html = '<h1 id="top">Top</h1><h2 id="a"><a href="#a">A &amp; <code>b</code></a></h2><h3 id="c">C</h3><h2>No id</h2>';
	assert.deepEqual(headings(html), [
		{ id: "a", level: 2, text: "A & b" },
		{ id: "c", level: 3, text: "C" },
	]);
	assert.deepEqual(headings(undefined), []);
});

test("callouts: writes no heading slot, and ignores options, so the component's fallback supplies the title", () => {
	const md = markdownIt().use(callouts, { headings: { note: "Remarque" } });
	assert.equal(md.render("> [!NOTE]\n> Texte."), '<norn-callout @variant="note">\n<p>Texte.</p>\n</norn-callout>\n');
});

test("webcTags: a component tag with @ props on its own lines stays a tag, and Markdown between blank lines still renders", () => {
	const md = markdownIt({ html: true }).use(webcTags);
	assert.equal(
		md.render('<norn-callout @variant="warning">\n\nLoose **bold** and <norn-icon @name="info"></norn-icon>.\n\n</norn-callout>\n'),
		'<norn-callout @variant="warning">\n<p>Loose <strong>bold</strong> and <norn-icon @name="info"></norn-icon>.</p>\n</norn-callout>\n',
	);
	assert.equal(md.render('<norn-heading-anchor @slug="by-hand" :@level="3">\n'), '<norn-heading-anchor @slug="by-hand" :@level="3">\n');
	assert.equal(md.render('<norn-code-tabs @group="pm">\n<norn-code-block data-tab="npm" @language="sh" @code="npm i &amp; go"></norn-code-block>\n</norn-code-tabs>\n'), '<norn-code-tabs @group="pm">\n<norn-code-block data-tab="npm" @language="sh" @code="npm i &amp; go"></norn-code-block>\n</norn-code-tabs>\n', "a tight block stays raw to the blank line");
	assert.equal(md.render('Go <norn-link-button @href="/x/" webc:if="true">there</norn-link-button>.\n'), '<p>Go <norn-link-button @href="/x/" webc:if="true">there</norn-link-button>.</p>\n');
});

test("webcTags: fences, inline code, and tags that are not components stay literal, and html: false turns it off", () => {
	const md = markdownIt({ html: true }).use(webcTags);
	assert.equal(md.render('```html\n<norn-callout @variant="tip">\n```\n'), '<pre><code class="language-html">&lt;norn-callout @variant=&quot;tip&quot;&gt;\n</code></pre>\n');
	assert.equal(md.render('Write `<norn-icon @name="info">`.\n'), "<p>Write <code>&lt;norn-icon @name=&quot;info&quot;&gt;</code>.</p>\n");
	assert.equal(md.render('A <span @x="y">b</span>\n'), "<p>A &lt;span @x=&quot;y&quot;&gt;b</span></p>\n", "not a component: CommonMark's rules");
	assert.equal(markdownIt().use(webcTags).render('<norn-icon @name="info"></norn-icon>\n'), "<p>&lt;norn-icon @name=&quot;info&quot;&gt;&lt;/norn-icon&gt;</p>\n");
});

test("webcTags: a tag line can't interrupt a paragraph, like CommonMark's own HTML blocks", () => {
	const md = markdownIt({ html: true }).use(webcTags);
	assert.equal(md.render('Text\n<norn-icon @name="info">\n'), '<p>Text\n<norn-icon @name="info"></p>\n');
});
