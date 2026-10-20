/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import MarkdownIt from "markdown-it";

import * as main from "./index.js";
import { highlightFences } from "./markdown.js";

test("the main entry exports nothing for Markdown", () => {
	assert.equal("highlightFences" in main, false);
});

test("highlightFences: emits a norn-code-block with @code and @language", () => {
	const md = new MarkdownIt().use(highlightFences);
	assert.equal(md.render("```js\nlet a = 1;\n```"), '<norn-code-block @code="let a = 1;\n" @language="js"></norn-code-block>\n');
});

test("highlightFences: escapes quotes, ampersands, and angle brackets", () => {
	const md = new MarkdownIt().use(highlightFences);
	const html = md.render('```html\n<a href="x">&</a>\n```');
	assert.ok(html.includes('@code="&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;\n"'));
	assert.ok(!/@code="[^"]*[<>][^"]*"/.test(html));
});

test("highlightFences: an empty info string leaves the language empty", () => {
	const md = new MarkdownIt().use(highlightFences);
	assert.equal(md.render("```\nplain\n```"), '<norn-code-block @code="plain\n" @language=""></norn-code-block>\n');
});

test("highlightFences: uses the first word of the info string", () => {
	const md = new MarkdownIt().use(highlightFences);
	assert.ok(md.render("```js title=x\n1\n```").includes('@language="js"'));
});

test("highlightFences: writes no slots, and ignores a strings argument, so the component's fallbacks supply the texts", () => {
	const md = new MarkdownIt().use(highlightFences, { label: "code {language}", copy: "Copier" });
	assert.equal(md.render("```js\nx\n```"), '<norn-code-block @code="x\n" @language="js"></norn-code-block>\n');
});
