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
import { callouts, headingAnchors, headings, scrollTables, slugify } from "./markdown.js";

test("the main entry exports nothing for Markdown", () => {
	for (const name of ["callouts", "headingAnchors", "headings", "scrollTables", "slugify"]) assert.equal(name in main, false, name);
});

test("scrollTables: wraps each Markdown table in norn-data-table, and leaves other blocks alone", () => {
	const md = markdownIt();
	scrollTables(md);
	const html = md.render("| a | b |\n| - | - |\n| 1 | 2 |\n\nText.\n");
	assert.match(html, /^<norn-data-table><table>\n<thead>[\s\S]*<\/table>\n<\/norn-data-table>\n<p>Text\.<\/p>\n$/);
});

test("callouts: a marked blockquote renders as norn-call-out, with the marker gone", () => {
	const md = markdownIt();
	callouts(md);
	assert.equal(md.render("> [!WARNING]\n> Back up first.\n"), '<norn-call-out @variant="warning">\n<p>Back up first.</p>\n</norn-call-out>\n');
	assert.equal(md.render("> [!tip] Inline text.\n"), '<norn-call-out @variant="tip">\n<p>Inline text.</p>\n</norn-call-out>\n');
});

test("callouts: a marker alone in its paragraph leaves no empty paragraph, and nested quotes close in place", () => {
	const md = markdownIt();
	callouts(md);
	const html = md.render("> [!NOTE]\n>\n> First.\n>\n> > Quoted.\n");
	assert.ok(html.startsWith('<norn-call-out @variant="note">\n'), html);
	assert.ok(!/<p>\s*<\/p>/.test(html), html);
	assert.ok(html.includes("<blockquote>\n<p>Quoted.</p>\n</blockquote>\n</norn-call-out>\n"), html);
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

test("headingAnchors: h2 and h3 link to themselves, repeats get a number, and h4 is left alone", () => {
	const md = markdownIt();
	headingAnchors(md);
	const html = md.render("## Install it\n\n### `npm` & more\n\n## Install it\n\n#### Deep\n");
	assert.ok(html.includes('<h2 id="install-it"><a href="#install-it">Install it</a></h2>'), html);
	assert.ok(html.includes('<h3 id="npm-more"><a href="#npm-more"><code>npm</code> &amp; more</a></h3>'), html);
	assert.ok(html.includes('<h2 id="install-it-2"><a href="#install-it-2">Install it</a></h2>'), html);
	assert.ok(html.includes("<h4>Deep</h4>"), html);
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
	assert.equal(md.render("> [!NOTE]\n> Texte."), '<norn-call-out @variant="note">\n<p>Texte.</p>\n</norn-call-out>\n');
});
