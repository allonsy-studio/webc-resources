/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* global document, getComputedStyle */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { launch, serve } from "../lib/browser.js";

const here = import.meta.dirname;
const eleventy = path.resolve(path.dirname(createRequire(import.meta.url).resolve("@11ty/eleventy")), "..", "cmd.cjs");
const output = path.join(here, "_site-design");

/** WCAG relative luminance of an `[r, g, b]` color. */
const luminance = (color) => {
	const [r, g, b] = color.map((value) => ((value /= 255) <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio of two `[r, g, b]` colors. */
const ratio = (a, b) => {
	const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (high + 0.05) / (low + 0.05);
};

/** The sRGB channels of any CSS color the browser understands, drawn on a canvas so `color-mix()` and `oklch()` resolve. */
const rgbOf = (page, css) =>
	page.evaluate((value) => {
		const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
		context.fillStyle = "#000";
		context.fillStyle = value;
		context.fillRect(0, 0, 1, 1);
		return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
	}, css);

describe("the design pass, built from content with only the data a page names", () => {
	let server;
	let browser;

	before(async () => {
		fs.rmSync(output, { recursive: true, force: true });
		execFileSync(process.execPath, [eleventy, "--config=variants/design/eleventy.config.js", "--quiet"], { cwd: here, env: { ...process.env, PATH_PREFIX: "" }, stdio: "pipe" });
		server = await serve(output);
		browser = await launch();
	});

	after(async () => {
		await browser?.close();
		await server?.close();
		fs.rmSync(output, { recursive: true, force: true });
	});

	/** Open a built page in a context, run the check, and close both. */
	async function onPage(url, check, options = {}) {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
		const page = await context.newPage();
		try {
			await page.goto(server.url + url);
			await check(page, context);
		} finally {
			await context.close();
		}
	}

	test("one focus ring: every tab stop draws the same 2px ring when it has focus", async () => {
		await onPage("/docs/", async (page) => {
			const seen = [];
			for (let step = 0; step < 80; step++) {
				await page.keyboard.press("Tab");
				const stop = await page.evaluate(() => {
					const element = document.activeElement;
					if (!element || element === document.body) return null;
					const own = getComputedStyle(element);
					// A radio is hidden and its label draws the ring.
					const ring = own.outlineStyle === "none" && element.closest("label") ? getComputedStyle(element.closest("label")) : own;
					const name = element.localName + (element.getAttribute("href") ? `[href=${element.getAttribute("href")}]` : "") + (element.closest("[class]") ? "" : "");
					return { name, text: element.textContent.trim().slice(0, 20), focusVisible: element.matches(":focus-visible"), width: ring.outlineWidth, style: ring.outlineStyle, id: `${name}|${element.textContent.trim()}|${element.getBoundingClientRect().top}` };
				});
				if (!stop) break;
				if (seen.some((known) => known.id === stop.id)) break;
				seen.push(stop);
			}
			assert.ok(seen.length >= 15, `a page of real tab stops (${seen.length})`);
			for (const stop of seen) {
				assert.ok(stop.focusVisible, `${stop.name} "${stop.text}" matches :focus-visible`);
				assert.equal(`${stop.style} ${stop.width}`, "solid 2px", `${stop.name} "${stop.text}" draws the one ring`);
			}
		});
	});

	test("the search field's edge is at least 3:1 against the page in light and dark", async () => {
		for (const colorScheme of ["light", "dark"]) {
			await onPage(
				"/docs/",
				async (page) => {
					const input = page.locator('norn-search input[type="search"]');
					const [edge, surface] = await input.evaluate((element) => [getComputedStyle(element).borderTopColor, getComputedStyle(document.body).backgroundColor]);
					const value = ratio(await rgbOf(page, edge), await rgbOf(page, surface));
					assert.ok(value >= 3, `${colorScheme}: ${value.toFixed(2)}:1`);
				},
				{ colorScheme },
			);
		}
	});
});
