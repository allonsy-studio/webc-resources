/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { bundles, headOf, read, sheets, tagNames, between } from "./build.js";

/** The cascade layer order, which norn-head declares inline. */
const ORDER = "@layer norn.reset, norn.base, norn.layout, norn.components, norn.oss, norn.print;";

const ALLOWED_HEAD = ["link", "meta", "script", "style", "title"];

/** The checks every oss-on fixture shares. */
export function sharedChecks({ test, assert, getPages, getOutput }) {
	test("the head holds only meta, title, link, style, and script", () => {
		for (const html of Object.values(getPages())) {
			assert.deepEqual([...new Set(tagNames(headOf(html)))].filter((name) => !ALLOWED_HEAD.includes(name)), []);
		}
	});

	test("the layer order is declared inline ahead of every stylesheet, once, and the base and print styles bundle with the page", () => {
		for (const html of Object.values(getPages())) {
			const head = headOf(html);
			assert.ok(head.includes(`<style>${ORDER}</style>`) && head.indexOf(ORDER) < head.indexOf('<link rel="stylesheet"'), "first");
			assert.equal(html.split(ORDER).length - 1, 1, "once in the page");
			const css = bundles(getOutput(), html).join("\n");
			assert.ok(!css.includes(ORDER) && css.includes("@layer norn.base {") && css.includes("@layer norn.print {"), "base and print in the bundle");
			assert.ok(!html.includes("norn-foundation"), "no foundation bucket");
		}
	});

	test("the project stylesheet is the last one linked, and sits outside every layer", () => {
		for (const html of Object.values(getPages())) assert.equal(sheets(html).at(-1), "/assets/styles/project.css");
		assert.ok(!read(getOutput(), "assets", "styles", "project.css").includes("@layer"));
	});

	test("no HTML comments, no empty src or href, and one twitter:card", () => {
		for (const html of Object.values(getPages())) {
			assert.ok(!html.includes("<!--"));
			assert.ok(!/\ssrc=""/.test(html) && !/\shref=""/.test(html));
			assert.equal((html.match(/<meta name="twitter:card"/g) ?? []).length, 1);
		}
	});

	test("every page has one h1, one main landmark, and the skip link first", () => {
		for (const html of Object.values(getPages())) {
			assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
			assert.equal((html.match(/<main id="main" tabindex="-1">/g) ?? []).length, 1);
			assert.ok(html.indexOf("<norn-skip-link>") < html.indexOf("<oss-bar>") && html.indexOf("<oss-bar>") < html.indexOf("<norn-header>"), "the skip link, the banner, then the header");
		}
	});

	test("the OSS site layer renders: banner, call to action, and credit, all with accessible names", () => {
		for (const html of Object.values(getPages())) {
			assert.ok(html.includes('<svg role="img" aria-label="Brought to you by Allons-y Studio" width="500" height="64"'), "banner");
			assert.equal((html.match(/<svg role="img" aria-label="Brought to you by Allons-y Studio" width="300" height="135" xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="273 0 334 150"/g) ?? []).length, 1, "credit, one lockup for both schemes, cropped to the art");
			assert.ok(html.includes('<svg aria-hidden="true" width="72" height="72"'), "mark");
			assert.ok(html.includes("Let's build something great together"));
		}
	});

	test("the call to action closes the page body, apart from the footer, and the credit is the footer's last column", () => {
		for (const html of Object.values(getPages())) {
			const main = between(html, "<main", "</main>");
			const footer = between(html, "<norn-footer>", "</norn-footer>");
			assert.ok(main.includes("<oss-cta>"), "the call to action is in main");
			assert.ok(main.slice(0, -"</main>".length).replace(/(\s*<\/(?!oss-cta)[a-z]+-[a-z-]+>)+\s*$/, "").trimEnd().endsWith("</oss-cta>"), "and comes last, inside the template at most");
			assert.ok(!footer.includes("<oss-cta>"), "not in the footer");
			assert.ok(footer.indexOf("<strong>") < footer.indexOf("<oss-credit>"));
		}
	});

	test("the call to action signs the Allons-y Studio name", () => {
		for (const html of Object.values(getPages())) assert.ok(between(html, "<oss-cta>", "</oss-cta>").includes("<span data-signature>Allons-y Studio</span>"));
	});

	test("the Allons-y Studio contact address appears only inside the call to action", () => {
		for (const html of Object.values(getPages())) {
			const cta = between(html, "<oss-cta>", "</oss-cta>");
			assert.equal((html.match(/consulting@allons-y\.studio/g) ?? []).length, 1);
			assert.ok(cta.includes("mailto:consulting@allons-y.studio"));
		}
	});
}
