/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { WebC } from "@11ty/webc";

const components = path.join(import.meta.dirname, "components");
const patterns = path.join(import.meta.dirname, "..", "webc-patterns", "components");

/** Render `studio-cta` with the given attributes, and return the markup. */
async function render(attributes = "") {
	const page = new WebC();
	page.setBundlerMode(true);
	page.defineComponents({ "studio-cta": path.join(components, "studio-cta.webc"), "norn-link-button": path.join(patterns, "norn-link-button.webc") });
	page.setContent(`<studio-cta ${attributes}></studio-cta>`);
	const { html } = await page.compile({ data: {} });
	return html;
}

test("studio-cta: the heading is an h2 by default", async () => {
	const html = await render();
	assert.match(html, /<h2>Let's build something great together<\/h2>/);
});

test("studio-cta: @level picks h3 or h4", async () => {
	assert.match(await render(':@level="3"'), /<h3>Let's build something great together<\/h3>/);
	assert.match(await render('@level="4"'), /<h4>Let's build something great together<\/h4>/);
});

test("studio-cta: a level outside 2 to 4 falls back to h2", async () => {
	for (const level of ["1", "5", "6", "x"]) assert.match(await render(`@level="${level}"`), /<h2>Let's build/, level);
});
