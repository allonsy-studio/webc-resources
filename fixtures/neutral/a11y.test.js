/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* global getComputedStyle */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { launch, serve } from "../lib/browser.js";

const here = import.meta.dirname;
const eleventy = path.resolve(path.dirname(createRequire(import.meta.url).resolve("@11ty/eleventy")), "..", "cmd.cjs");
const output = path.join(here, "_site-a11y");

/** The accessible name of every heading on the page, read from the accessibility tree. */
async function headingNames(page) {
	const tree = await page.locator("body").ariaSnapshot();
	return [...tree.matchAll(/^\s*- heading "((?:[^"\\]|\\.)*)"/gm)].map((match) => match[1]);
}

describe("neutral fixture accessibility tree", () => {
	let server;
	let browser;

	before(async () => {
		fs.rmSync(output, { recursive: true, force: true });
		execFileSync(process.execPath, [eleventy, "--config=variants/a11y/eleventy.config.js", "--quiet"], { cwd: here, env: { ...process.env, PATH_PREFIX: "" }, stdio: "pipe" });
		server = await serve(output);
		browser = await launch();
	});

	after(async () => {
		await browser?.close();
		await server?.close();
		fs.rmSync(output, { recursive: true, force: true });
	});

	test("a Markdown heading that links to itself is not announced with a #", async () => {
		const page = await browser.newPage();
		await page.goto(`${server.url}/docs/one/`);
		assert.ok(await page.locator("norn-rich-text :is(h2, h3):has(> a)").count(), "the page has linked headings");
		const names = await headingNames(page);
		assert.ok(names.includes("A second-level heading"), names.join(" | "));
		assert.ok(names.includes("A third-level heading"), names.join(" | "));
		assert.deepEqual(names.filter((name) => name.startsWith("#")), []);
		await page.close();
	});

	test("norn-heading-anchor is not announced with a #", async () => {
		const page = await browser.newPage();
		await page.goto(`${server.url}/kit/`);
		const names = await headingNames(page);
		assert.ok(names.includes("Anchors") && names.includes("Deeper"), names.join(" | "));
		assert.deepEqual(names.filter((name) => name.startsWith("#")), []);
		await page.close();
	});

	test("the # mark still draws", async () => {
		const page = await browser.newPage();
		await page.goto(`${server.url}/docs/one/`);
		const mark = await page.locator("norn-rich-text h2:has(> a)").first().evaluate((heading) => getComputedStyle(heading, "::before").content);
		assert.match(mark, /^"#"/);
		await page.close();
	});
});
