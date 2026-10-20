/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

import { chromium } from "playwright-core";

const AXE = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" };

/** WCAG 2.2 AA, plus axe's best practices. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** Browser contexts to audit: light, dark, and forced colors. */
export const SCHEMES = {
	light: { colorScheme: "light" },
	dark: { colorScheme: "dark" },
	forced: { colorScheme: "light", forcedColors: "active" },
};

/**
 * Serve a directory of built pages, under a path prefix when the build has one.
 *
 * @param {string} root
 * @param {string} [prefix] - The path the site is served from, such as `/webc-resources/`
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function serve(root, prefix = "/") {
	const server = http.createServer((request, response) => {
		const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
		const inside = pathname.startsWith(prefix) ? pathname.slice(prefix.length - 1) : null;
		const file = inside === null ? null : path.join(root, inside.endsWith("/") ? `${inside}index.html` : inside);
		if (!file || !file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			response.writeHead(404).end("Not found");
			return;
		}
		response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(fs.readFileSync(file));
	});
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			resolve({ url: `http://127.0.0.1:${server.address().port}${prefix.replace(/\/$/, "")}`, close: () => new Promise((done) => server.close(done)) });
		});
	});
}

/**
 * Launch Chromium: Playwright's own build, else Google Chrome, else the one in PLAYWRIGHT_BROWSERS_PATH.
 *
 * @returns {Promise<import("playwright-core").Browser>}
 */
export async function launch() {
	const args = process.getuid?.() === 0 ? ["--no-sandbox"] : [];
	const attempts = [{ args }, { channel: "chrome", args }];
	if (process.env.PLAYWRIGHT_BROWSERS_PATH) attempts.push({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium"), args });
	const errors = [];
	for (const options of attempts) {
		try {
			return await chromium.launch(options);
		} catch (error) {
			errors.push(error.message.split("\n")[0]);
		}
	}
	throw new Error(`No browser to run the audit with. Install Google Chrome, or run \`npx playwright install chromium\`.\n${errors.join("\n")}`);
}

/**
 * Every page in a build, as a URL path.
 *
 * @param {string} output
 * @returns {string[]}
 */
export function pagesOf(output) {
	const found = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) walk(path.join(dir, entry.name));
			else if (entry.name === "index.html") found.push(`/${path.relative(output, dir).split(path.sep).join("/")}/`.replace("//", "/"));
		}
	};
	walk(output);
	return found.sort();
}

/**
 * Run axe on each page in each scheme. Contrast is not checked in forced colors, where axe measures the
 * emulation and not what a reader sees: the browser replaces the colors with the reader's.
 *
 * @param {import("playwright-core").Browser} browser
 * @param {string} base - The served origin and path prefix
 * @param {string[]} pages - URL paths
 * @param {{ width?: number }} [options] - The viewport width (1280 by default)
 * @returns {Promise<string[]>} One line per violation; empty when the audit is clean
 */
export async function audit(browser, base, pages, { width = 1280 } = {}) {
	const violations = [];
	for (const [scheme, options] of Object.entries(SCHEMES)) {
		const context = await browser.newContext({ ...options, viewport: { width, height: 800 } });
		for (const url of pages) {
			const page = await context.newPage();
			await page.goto(base + url);
			await page.addScriptTag({ content: AXE });
			const result = await page.evaluate(([tags, contrast]) => axe.run(document, { runOnly: { type: "tag", values: tags }, rules: { "color-contrast": { enabled: contrast } } }), [TAGS, scheme !== "forced"]);
			for (const violation of result.violations) {
				violations.push(`${scheme} ${url} ${violation.id}: ${violation.nodes.map((node) => node.html.slice(0, 80).replace(/\s+/g, " ")).join(" | ")}`);
			}
			await page.close();
		}
		await context.close();
	}
	return violations;
}
