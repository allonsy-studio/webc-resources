/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { WebC } from "@11ty/webc";

const components = path.join(import.meta.dirname, "components");
const patterns = path.join(import.meta.dirname, "..", "webc-patterns", "components");

/** Render `oss-cta` with the given attributes, and return the markup. */
async function render(attributes = "") {
	const page = new WebC();
	page.setBundlerMode(true);
	page.defineComponents({ "oss-cta": path.join(components, "oss-cta.webc"), "norn-link-button": path.join(patterns, "norn-link-button.webc") });
	page.setContent(`<oss-cta ${attributes}></oss-cta>`);
	const { html } = await page.compile({ data: {} });
	return html;
}

test("oss-cta: the heading is an h2 by default", async () => {
	const html = await render();
	assert.match(html, /<h2>Let's build something great together<\/h2>/);
});

test("oss-cta: @level picks h3 or h4", async () => {
	assert.match(await render(':@level="3"'), /<h3>Let's build something great together<\/h3>/);
	assert.match(await render('@level="4"'), /<h4>Let's build something great together<\/h4>/);
});

test("oss-cta: a level outside 2 to 4 falls back to h2", async () => {
	for (const level of ["1", "5", "6", "x"]) assert.match(await render(`@level="${level}"`), /<h2>Let's build/, level);
});

test("oss-cta: colors its actions by setting the global accent tokens, not norn-link-button properties", () => {
	const source = fs.readFileSync(path.join(components, "oss-cta.webc"), "utf8");
	for (const declaration of ["--norn-ui-accent: var(--_yellow);", "--norn-text-accent: light-dark(", "--norn-text-on-accent: #33394e;"]) assert.ok(source.includes(declaration), declaration);
	assert.ok(!source.includes("--norn-link-button-"), "no norn-link-button property");
});
