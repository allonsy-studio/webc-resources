/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { WebC } from "@11ty/webc";

import { adjacent, componentStrings, defaultStrings, dropEmptyBundleTags, patterns } from "./index.js";

const components = fs
	.readdirSync(path.join(import.meta.dirname, "components"))
	.filter((file) => file.endsWith(".webc"))
	.map((file) => file.slice(0, -5));

test("patterns: a forward-slash glob over every component", () => {
	const glob = patterns();
	assert.ok(glob.endsWith("/components/*.webc"));
	assert.ok(path.isAbsolute(glob.split("/").join(path.sep)) || glob.startsWith("/") || /^[A-Za-z]:/.test(glob));
	assert.ok(!glob.replace(/\\(?=[\\()*?[\]{|}!+@])/g, "").includes("\\"), "no backslash path separators; one before a glob character is an escape");
});

test("patterns: the glob finds the components in a folder whose name holds glob syntax", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "norn-glob-"));
	try {
		for (const folder of ["plain", "Dropbox (Personal)", "site [copy]", "a{b,c}", "(copy) of site", "hello!"]) {
			const dir = path.join(root, folder, "node_modules", "@allons-y", "webc-patterns");
			fs.mkdirSync(path.join(dir, "components"), { recursive: true });
			fs.copyFileSync(path.join(import.meta.dirname, "index.js"), path.join(dir, "index.js"));
			for (const name of ["norn-card", "norn-hero"]) fs.writeFileSync(path.join(dir, "components", `${name}.webc`), "<p></p>");
			const copy = await import(pathToFileURL(path.join(dir, "index.js")).href);
			assert.deepEqual(Object.keys(WebC.getComponentsMap([copy.patterns()])).sort(), ["norn-card", "norn-hero"], folder);
			assert.deepEqual(Object.keys(WebC.getComponentsMap([copy.patterns({ exclude: ["norn-card"] })])), ["norn-hero"], `${folder}, with an exclusion`);
		}
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("patterns: excluded names drop out of the glob", () => {
	assert.ok(patterns({ exclude: ["norn-card"] }).endsWith("/components/!(norn-card).webc"));
	assert.ok(patterns({ exclude: ["norn-card", "norn-card-grid"] }).endsWith("/components/!(norn-card|norn-card-grid).webc"));
});

test("patterns: an unknown name throws and lists the available ones", () => {
	assert.throws(() => patterns({ exclude: ["nope"] }), (error) => error.message.includes('"nope"') && components.every((name) => error.message.includes(name)));
});

test("patterns: ships the content components and the page frame, and no foundation stylesheet component", () => {
	for (const name of ["norn-card", "norn-card-grid", "norn-side-nav", "norn-sidebar-layout", "norn-rich-text", "norn-pager", "norn-head", "norn-skip-link", "norn-header", "norn-footer", "norn-hero", "norn-icon", "norn-link-button", "norn-fact-list", "norn-segmented-control", "norn-copy-button", "norn-simple-table", "norn-theme-toggle", "norn-accordion", "norn-callout", "norn-notice", "norn-heading-anchor", "norn-toc", "norn-breadcrumbs"]) {
		assert.ok(components.includes(name), name);
	}
	assert.ok(!components.includes("norn-page-styles"), "the base styles are files, embedded by norn-base");
});

const pages = [{ href: "/a/", title: "A" }, { href: "/b/", title: "B" }, { href: "/c/", title: "C" }];

test("adjacent: the first page has only a next", () => {
	assert.deepEqual(adjacent(pages, { url: pages[0].href }), { prev: undefined, next: pages[1] });
});

test("adjacent: a middle page has both", () => {
	assert.deepEqual(adjacent(pages, { url: pages[1].href }), { prev: pages[0], next: pages[2] });
});

test("adjacent: the last page has only a prev", () => {
	assert.deepEqual(adjacent(pages, { url: pages[2].href }), { prev: pages[1], next: undefined });
});

test("adjacent: a page outside the collection has neither", () => {
	assert.deepEqual(adjacent(pages, { url: "/z/" }), { prev: undefined, next: undefined });
});

test("adjacent: matches an item's href to the page's url, not identity", () => {
	assert.equal(adjacent(pages, { url: "/b/" }).next, pages[2]);
});

test("adjacent: the neighbors are items that carry href, and items with only url match nothing", () => {
	const { prev, next } = adjacent(pages, { url: "/b/" });
	assert.deepEqual([prev, next], [{ href: "/a/", title: "A" }, { href: "/c/", title: "C" }]);
	assert.deepEqual(adjacent([{ url: "/a/" }, { url: "/b/" }], { url: "/a/" }), { prev: undefined, next: undefined });
});

test("dropEmptyBundleTags: removes empty bundle tags, including the dot HtmlBasePlugin writes", () => {
	const html = '<head>\n\t<link rel="stylesheet" href="">\n\t<link rel="stylesheet" href=".">\n\t<script src="" defer></script>\n\t<script src="." defer=""></script>\n</head>';
	assert.equal(dropEmptyBundleTags(html), "<head>\n</head>");
});

test("dropEmptyBundleTags: keeps real links and scripts", () => {
	const html = '<link rel="stylesheet" href="/bundle/a.css">\n<script src="/bundle/a.js" defer></script>\n<link rel="stylesheet" href="/assets/project.css">';
	assert.equal(dropEmptyBundleTags(html), html);
});

test("dropEmptyBundleTags: passes non-strings through", () => {
	assert.equal(dropEmptyBundleTags(undefined), undefined);
});

test("componentStrings: a page's language table wins, then the shared one, matching tags without regard to case or region", () => {
	const lookup = componentStrings({ "norn-toc": { label: "Contents" }, fr: { "norn-toc": { label: "Sur cette page" } }, "pt-BR": { "norn-skip-link": { label: "Pular" } } });
	assert.equal(lookup("norn-toc", "label"), "Contents");
	assert.equal(lookup("norn-toc", "label", { lang: "fr" }), "Sur cette page");
	assert.equal(lookup("norn-toc", "label", { lang: "fr-CA" }), "Sur cette page");
	assert.equal(lookup("norn-skip-link", "label", { lang: "pt-br" }), "Pular");
	assert.equal(lookup("norn-skip-link", "label", { lang: "de" }), undefined);
	assert.equal(lookup("norn-skip-link", "label", { lang: "not a tag" }), undefined);
});

test("componentStrings: an unknown component, key, or language, or a value that is not a string, throws and names the choices", () => {
	assert.throws(() => componentStrings({ "page-tok": {} }), /"page-tok" is neither a component nor a language tag. Components: .*norn-toc/);
	assert.throws(() => componentStrings({ "norn-toc": { lable: "x" } }), /norn-toc has no string "lable". Available: label/);
	assert.throws(() => componentStrings({ fr: { "norn-search": { resultsone: "x" } } }), /norn-search has no string "resultsone" \(in "fr"\). Available: .*results-one/);
	assert.throws(() => componentStrings({ "norn-search": { resultsOne: "x" } }), /no string "resultsOne"; keys are slot names, as "results-one"/);
	assert.throws(() => componentStrings({ fr: { "norn-toc": { label: 3 } } }), /norn-toc.label \(in "fr"\) must be a string/);
});

test("defaultStrings is frozen, so a project can read it but not change the defaults", () => {
	assert.ok(Object.isFrozen(defaultStrings) && Object.values(defaultStrings).every(Object.isFrozen));
	assert.equal(defaultStrings["norn-skip-link"].label, "Skip to content");
});
