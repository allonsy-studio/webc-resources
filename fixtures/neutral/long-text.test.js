/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* global document, getComputedStyle, innerWidth */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { audit, launch, serve } from "../lib/browser.js";

const here = import.meta.dirname;
const eleventy = path.resolve(path.dirname(createRequire(import.meta.url).resolve("@11ty/eleventy")), "..", "cmd.cjs");
const output = path.join(here, "_site-long-text");
const PAGE = "/fr/long-text/";
const WIDTHS = [320, 390, 1280];

/** How far `norn-side-nav` lets its list reach past the box, in pixels, so a focus ring is not cut off by the scroll box. A component that holds a side nav shows the same bleed. */
const BLEED = 6;

/**
 * A deliberately wide face and loose tracking, laid over every element. The runner's fonts differ from a developer's: a face on the
 * runner can set a long word wider than the one on the machine that wrote the test, and a layout that only just fits there
 * overflows on CI. Forcing a wide face with extra letter spacing makes that failure show here too. The faces are listed
 * widest first and end on the generic family, so a machine without any of them still gets its widest serif plus the tracking.
 */
const WIDE_FONT = "* { font-family: 'DejaVu Serif', Verdana, Georgia, serif !important; letter-spacing: 0.05em !important; }";

/** The widths that also run with the wide face: the narrowest, where one long word is most of a line. */
const WIDE_WIDTHS = [320];

/** Puts the page in its widest state: the skip link showing, search results listed, a section open, the copy button used. */
async function widest(page) {
	await page.keyboard.press("Tab");
	await page.locator("norn-search input[type=search]").fill("composant");
	await page.locator("norn-search ol a").first().waitFor();
	await page.locator("norn-accordion details").first().evaluate((details) => (details.open = true));
	await page.locator('norn-copy-button button[data-source="commande"]').click();
	await page.locator("norn-code-tabs [role=tab]").last().click();
}

/** What overflows: the page, any box past the viewport that no scroll box holds, a component past its own box, and text a hidden overflow cuts off. */
function overflow(page) {
	return page.evaluate((bleed) => {
		const found = [];
		const root = document.documentElement;
		if (root.scrollWidth > innerWidth) found.push(`page scrolls sideways: ${root.scrollWidth} > ${innerWidth}`);
		const name = (element) => `${element.localName}${element.id ? `#${element.id}` : ""}`;
		const hidden = (element) => {
			const box = element.getBoundingClientRect();
			return box.width <= 1 || box.height <= 1;
		};
		const contained = (element) => {
			for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
				if (getComputedStyle(parent).overflowX !== "visible") return true;
			}
			return false;
		};
		for (const element of document.body.querySelectorAll("*")) {
			const box = element.getBoundingClientRect();
			if (hidden(element) || contained(element)) continue;
			if (box.right > innerWidth + 0.5 || box.left < -0.5) found.push(`${name(element)} spans ${Math.round(box.left)} to ${Math.round(box.right)}, outside the ${innerWidth} viewport`);
		}
		for (const host of document.querySelectorAll("*")) {
			if (!host.localName.startsWith("norn-")) continue;
			const box = host.getBoundingClientRect();
			if (box.width && box.right > innerWidth + 0.5) found.push(`${name(host)} ends at ${Math.round(box.right)}, past the ${innerWidth} viewport`);
			if (host.scrollWidth - host.clientWidth > (host.matches("norn-side-nav, :has(norn-side-nav)") ? bleed : 0)) found.push(`${name(host)} content is wider than the component: ${host.scrollWidth} > ${host.clientWidth}`);
			for (const child of host.querySelectorAll("*")) {
				const style = getComputedStyle(child);
				const cuts = style.overflowX === "hidden" || style.overflowX === "clip" || style.textOverflow === "ellipsis";
				if (cuts && !hidden(child) && child.scrollWidth > child.clientWidth) found.push(`${name(host)} > ${child.localName} cuts text off: ${child.scrollWidth} > ${child.clientWidth}`);
			}
		}
		return [...new Set(found)];
	}, BLEED);
}

describe("neutral fixture with long, accented strings", () => {
	let server;
	let browser;

	before(async () => {
		fs.rmSync(output, { recursive: true, force: true });
		execFileSync(process.execPath, [eleventy, "--config=variants/long-text/eleventy.config.js", "--quiet"], { cwd: here, env: { ...process.env, PATH_PREFIX: "" }, stdio: "pipe" });
		server = await serve(output);
		browser = await launch();
	});

	after(async () => {
		await browser?.close();
		await server?.close();
		fs.rmSync(output, { recursive: true, force: true });
	});

	test("the first two cards, in one row, share the lines of their headings and bodies, and a card alone keeps its own", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
		await page.goto(server.url + PAGE);
		const rows = await page.locator("norn-card-grid article").evaluateAll((cards) =>
			cards.slice(0, 2).map((card) => {
				const [heading, body] = card.children;
				return [Math.round(heading.getBoundingClientRect().bottom), Math.round(body.getBoundingClientRect().top), Math.round(card.getBoundingClientRect().bottom)];
			}),
		);
		assert.equal(new Set(rows.map(([, body]) => body)).size, 1, `the bodies start on one line: ${JSON.stringify(rows)}`);
		assert.equal(new Set(rows.map(([, , bottom]) => bottom)).size, 1, "the cards end on one line");
		const alone = await page.locator("#seule article").evaluate((card) => {
			const [heading, body] = card.children;
			return heading.getBoundingClientRect().bottom <= body.getBoundingClientRect().top;
		});
		assert.ok(alone, "the heading ends before the body starts");
		await page.close();
	});

	for (const width of WIDTHS) {
		test(`nothing overflows or is clipped at ${width} wide`, async () => {
			const faces = WIDE_WIDTHS.includes(width) ? [["", ""], [WIDE_FONT, ", in a wide font"]] : [["", ""]];
			for (const [css, note] of faces) {
				const page = await browser.newPage({ viewport: { width, height: 800 } });
				await page.goto(server.url + PAGE);
				if (css) await page.addStyleTag({ content: css });
				assert.deepEqual(await overflow(page), [], `as built${note}`);
				await widest(page);
				assert.deepEqual(await overflow(page), [], `with results, the skip link, and the copy status showing${note}`);
				await page.close();
			}
		});

		test(`axe finds nothing at ${width} wide`, async () => {
			assert.deepEqual(await audit(browser, server.url, [PAGE], { width, prepare: widest }), []);
		});
	}
});
