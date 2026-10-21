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

import { launch, resolveColor, serve, token } from "../lib/browser.js";

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

	/** The paint of the first element a selector finds: its background and outline, which forced colors leaves to the author or replaces. */
	const paint = (page, selector) =>
		page.locator(selector).first().evaluate((element) => {
			const style = getComputedStyle(element);
			return { background: style.backgroundColor, color: style.color, outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`, borderWidth: style.borderTopWidth, borderColor: style.borderTopColor, height: element.getBoundingClientRect().height };
		});

	/** The color behind an element's text: its own background, else the nearest ancestor's that is not clear. A pseudo-element's background is not counted, since forced colors replaces it. */
	const behind = (element) => {
		for (let node = element; node; node = node.parentElement) {
			const color = getComputedStyle(node).backgroundColor;
			if (!/(, 0|\/ 0)\)$/.test(color) && color !== "transparent") return color;
		}
		const probe = document.createElement("span");
		probe.style.backgroundColor = "Canvas";
		document.body.append(probe);
		const canvas = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return canvas;
	};

	test("in forced colors the checked option of a segmented control and of the theme toggle is drawn apart from the others, with text that reads on its own background", async () => {
		await onPage(
			"/controls/",
			async (page) => {
				for (const group of ["#control", "#toggle"]) {
					const checked = await paint(page, `${group} label:has(input:checked)`);
					const unchecked = await paint(page, `${group} label:has(input:not(:checked))`);
					assert.ok(checked.background !== unchecked.background || checked.outline !== unchecked.outline, `${group}: ${JSON.stringify(checked)} against ${JSON.stringify(unchecked)}`);
					const background = await page.locator(`${group} label:has(input:checked)`).first().evaluate(behind);
					const value = ratio(await rgbOf(page, checked.color), await rgbOf(page, background));
					assert.ok(value >= 3, `${group}: the checked text is ${value.toFixed(2)}:1 on ${background}`);
				}
			},
			{ colorScheme: "light", forcedColors: "active" },
		);
	});

	test("a segmented control has no thumb and no border, and tints its checked option in the accent", async () => {
		await onPage("/controls/", async (page) => {
			const fieldset = await page.locator("#control fieldset").evaluate((element) => ({ before: getComputedStyle(element, "::before").content, border: getComputedStyle(element).borderTopWidth, background: getComputedStyle(element).backgroundColor }));
			assert.notEqual(fieldset.before, '""', "no sliding thumb");
			assert.equal(fieldset.border, "0px", "no outer border");
			assert.equal(fieldset.background, await resolveColor(page, token("surface.raised"), "background-color"), "the track is the raised surface");
			const checked = await paint(page, "#control label:has(input:checked)");
			const unchecked = await paint(page, "#control label:has(input:not(:checked))");
			assert.equal(checked.color, await resolveColor(page, token("text.accent")), "accent text");
			assert.notEqual(checked.background, unchecked.background, "a tint");
			assert.match(unchecked.background, /(, 0|\/ 0)\)$/, "and nothing on the others");
		});
	});

	test("a link button's variants differ in forced colors: primary stays filled, secondary is an outline, and quiet has no border", async () => {
		await onPage(
			"/controls/",
			async (page) => {
				const [primary, secondary, quiet] = await Promise.all(["#primary", "#secondary", "#quiet"].map((id) => paint(page, `${id} a`)));
				const linkText = await resolveColor(page, "LinkText");
				assert.equal(primary.background, linkText, "primary is filled with the link color");
				assert.notEqual(secondary.background, linkText, "secondary is not");
				assert.equal(secondary.borderWidth, "1px");
				assert.notEqual(secondary.borderColor, "rgba(0, 0, 0, 0)");
				assert.ok(quiet.borderWidth === "0px" || quiet.borderColor === (await resolveColor(page, "Canvas")), `quiet has no visible border: ${quiet.borderColor}`);
			},
			{ colorScheme: "light", forcedColors: "active" },
		);
	});

	test("a link button takes a hover layer, then a deeper press layer, and does not underline", async () => {
		await onPage("/controls/", async (page) => {
			for (const id of ["primary", "secondary", "quiet"]) {
				const link = page.locator(`#${id} a`);
				const rest = await link.evaluate((element) => getComputedStyle(element).backgroundColor);
				await link.hover();
				await page.waitForTimeout(250);
				const hover = await link.evaluate((element) => [getComputedStyle(element).backgroundColor, getComputedStyle(element).textDecorationLine]);
				await page.mouse.down();
				await page.waitForTimeout(250);
				const press = await link.evaluate((element) => getComputedStyle(element).backgroundColor);
				// Release away from the link, so the click does not follow it.
				await page.mouse.move(0, 0);
				await page.mouse.up();
				assert.notEqual(hover[0], rest, `${id}: a hover layer`);
				assert.notEqual(press, hover[0], `${id}: a press layer`);
				assert.equal(hover[1], "none", `${id}: no underline`);
			}
		});
	});

	test("a copy button keeps its width after a copy, and shows the copied mark in the success color", async () => {
		await onPage(
			"/controls/",
			async (page) => {
				const button = page.locator("#copy button");
				await button.waitFor({ state: "visible" });
				const before = (await button.boundingBox()).width;
				await button.click();
				await page.locator("#copy [role=status]").filter({ hasText: /\S/ }).waitFor();
				const after = (await button.boundingBox()).width;
				assert.equal(after, before, "the same width, so nothing moves under the pointer");
				assert.equal(await button.evaluate((element) => getComputedStyle(element).color), await resolveColor(page, token("status.success")), "tinted with the success color");
				assert.equal(await button.evaluate((element) => getComputedStyle(element).borderTopWidth), "0px", "no border");
			},
			{ permissions: ["clipboard-read", "clipboard-write"] },
		);
	});

	test("the search field has a leading magnifier and a placeholder from its label", async () => {
		await onPage("/controls/", async (page) => {
			const input = page.locator('#search input[type="search"]');
			assert.equal(await input.getAttribute("placeholder"), "Search");
			const icon = await page.locator("#search label norn-icon").first().boundingBox();
			const field = await input.boundingBox();
			assert.ok(icon && icon.x >= field.x && icon.x + icon.width <= field.x + 40, "inside the field, at its start");
		});
	});

	test("a code block's copy button overlays the top end corner of the code, with its label until hover, and the code has no border", async () => {
		await onPage(
			"/docs/",
			async (page) => {
				const pre = page.locator("norn-code-block pre").first();
				const button = page.locator("norn-code-block norn-copy-button button").first();
				await button.waitFor({ state: "visible" });
				const box = await pre.boundingBox();
				const corner = await button.boundingBox();
				assert.ok(corner.y >= box.y && corner.y + corner.height <= box.y + box.height, "inside the code vertically");
				assert.ok(box.x + box.width - (corner.x + corner.width) < 24 && corner.y - box.y < 24, "at the top end corner");
				assert.equal(await pre.evaluate((element) => getComputedStyle(element).borderTopWidth), "0px", "no border on the code");
				assert.equal(await page.locator("norn-code-block figure").first().evaluate((element) => element.getBoundingClientRect().height), box.height, "no row of its own above the code");
				const label = page.locator("norn-code-block norn-copy-button button [data-label]").first();
				assert.ok((await label.boundingBox())?.width <= 1, "the label is hidden at rest");
				await button.hover();
				await page.waitForTimeout(250);
				assert.ok((await label.boundingBox()).width > 8, "and shows on hover");
			},
			{ permissions: ["clipboard-read", "clipboard-write"] },
		);
	});

	test("an accordion summary and a code tab take a hover layer", async () => {
		await onPage("/controls/", async (page) => {
			for (const selector of ["#faq summary", '#shells [role="tab"]:not([aria-selected="true"])']) {
				const target = page.locator(selector).first();
				const rest = await target.evaluate((element) => getComputedStyle(element).backgroundColor);
				await target.hover();
				await page.waitForTimeout(250);
				assert.notEqual(await target.evaluate((element) => getComputedStyle(element).backgroundColor), rest, selector);
				await page.mouse.move(0, 0);
			}
		});
	});

	test("one control height: a link button, a copy button, a search field, a tab, and a segmented control are 2.25rem, and their targets 2.75rem on a touch screen", async () => {
		const heights = (page, segmented) =>
			page.evaluate(
				(target) =>
					Object.fromEntries(
						[
							["link button", "#primary a"],
							["copy button", "#copy button"],
							["search field", '#search input[type="search"]'],
							["tab", '#shells [role="tab"]'],
							["segmented control", target],
						].map(([name, selector]) => [name, document.querySelector(selector).getBoundingClientRect().height]),
					),
				segmented,
			);
		await onPage("/controls/", async (page) => {
			for (const [name, height] of Object.entries(await heights(page, "#control fieldset"))) assert.equal(height, 36, name);
		});
		await onPage(
			"/controls/",
			async (page) => {
				for (const [name, height] of Object.entries(await heights(page, "#control label"))) assert.equal(height, 44, `${name} on a touch screen`);
			},
			{ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } },
		);
	});
});
