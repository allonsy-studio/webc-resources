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

import { propertyName, readTokens } from "../../scripts/build-components.js";

const AXE = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };

const TOKENS = new Map(readTokens().map((token) => [token.path, token]));

/**
 * A shared token as CSS reads it: the custom property with its default from tokens.json as the fallback, the way a component writes it.
 * No page defines the property itself, so the bare `var(--norn-text-accent)` is empty.
 *
 * @param {string} tokenPath - Dotted path, such as `text.on-accent`
 * @returns {string}
 */
export function token(tokenPath) {
	const found = TOKENS.get(tokenPath);
	if (!found) throw new Error(`tokens.json has no ${tokenPath}.`);
	return `var(${propertyName(tokenPath)}, ${found.resolved})`;
}

/** How many pages an audit loads at once. */
const AUDIT_PAGES = 4;

/** WCAG 2.2 AA, plus axe's best practices. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** Browser contexts to audit: light, dark, and forced colors. */
export const SCHEMES = {
	light: { colorScheme: "light" },
	dark: { colorScheme: "dark" },
	forced: { colorScheme: "light", forcedColors: "active" },
};

/**
 * Serve a directory of built pages.
 *
 * @param {string} root
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function serve(root) {
	const server = http.createServer((request, response) => {
		const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
		const file = path.join(root, pathname.endsWith("/") ? `${pathname}index.html` : pathname);
		if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			response.writeHead(404).end("Not found");
			return;
		}
		response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(fs.readFileSync(file));
	});
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) });
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
 * @param {string} base - The served origin
 * @param {string[]} pages - URL paths
 * @param {{ width?: number, prepare?: (page: import("playwright-core").Page) => Promise<void> }} [options] - The viewport width (1280 by default), and a step that puts each page in the state to audit, such as results showing, before axe runs
 * @returns {Promise<string[]>} One line per violation; empty when the audit is clean
 */
export async function audit(browser, base, pages, { width = 1280, prepare } = {}) {
	const violations = [];
	for (const [scheme, options] of Object.entries(SCHEMES)) {
		const context = await browser.newContext({ ...options, viewport: { width, height: 800 } });
		const queue = [...pages];
		const found = new Map();
		// A few pages at once: each spends most of its time loading, so the audit is not bound by one page's wait.
		const worker = async () => {
			for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
				const page = await context.newPage();
				await page.goto(base + url);
				await prepare?.(page);
				await page.addScriptTag({ content: AXE });
				const result = await page.evaluate(([tags, contrast]) => axe.run(document, { runOnly: { type: "tag", values: tags }, rules: { "color-contrast": { enabled: contrast } } }), [TAGS, scheme !== "forced"]);
				found.set(
					url,
					result.violations.map((violation) => `${scheme} ${url} ${violation.id}: ${violation.nodes.map((node) => node.html.slice(0, 80).replace(/\s+/g, " ")).join(" | ")}`),
				);
				await page.close();
			}
		};
		await Promise.all(Array.from({ length: Math.min(AUDIT_PAGES, pages.length) }, worker));
		for (const url of pages) violations.push(...(found.get(url) ?? []));
		await context.close();
	}
	return violations;
}

/**
 * The computed color of a CSS value, such as `token("text.on-accent")`.
 *
 * @param {import("playwright-core").Page} page
 * @param {string} value
 * @param {"color" | "background-color"} [property]
 * @returns {Promise<string>}
 */
export function resolveColor(page, value, property = "color") {
	return page.evaluate(
		([cssValue, cssProperty]) => {
			const probe = document.createElement("span");
			probe.style.setProperty(cssProperty, cssValue);
			document.body.append(probe);
			const resolved = getComputedStyle(probe).getPropertyValue(cssProperty);
			probe.remove();
			return resolved;
		},
		[value, property],
	);
}

/**
 * Lists outside a `nav` that show no markers and have no `role="list"`: Safari drops their list semantics.
 *
 * @param {import("playwright-core").Page} page
 * @returns {Promise<string[]>}
 */
export function listsNeedingRole(page) {
	return page.evaluate(() =>
		[...document.querySelectorAll("ul, ol")]
			.filter((list) => !list.closest("nav") && getComputedStyle(list).listStyleType === "none" && list.getAttribute("role") !== "list")
			.map((list) => `${list.parentElement.localName} > ${list.localName}`),
	);
}

/**
 * The lowest contrast across a sweep of accent colors, in the page's current color scheme: `--norn-text-on-accent` on the accent, and `--norn-text-accent` on the page surface.
 *
 * @param {import("playwright-core").Page} page
 * @returns {Promise<{ count: number, ink: number, link: number }>}
 */
export function accentContrast(page) {
	return page.evaluate(([onAccent, accentText]) => {
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		const rgb = (css) => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = "#000";
			context.fillStyle = css;
			context.fillRect(0, 0, 1, 1);
			return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
		};
		const luminance = (color) => {
			const [r, g, b] = color.map((value) => ((value /= 255) <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		};
		const ratio = (a, b) => {
			const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
			return (high + 0.05) / (low + 0.05);
		};
		const probe = document.createElement("span");
		document.body.append(probe);
		const surface = rgb(getComputedStyle(document.body).backgroundColor);
		const read = (token) => {
			probe.style.color = token;
			return rgb(getComputedStyle(probe).color);
		};
		const result = { count: 0, ink: Infinity, link: Infinity };
		for (let lightness = 0.2; lightness <= 0.97; lightness += 0.03) {
			for (let hue = 0; hue < 360; hue += 15) {
				for (const chroma of [0.04, 0.12, 0.24]) {
					const accent = rgb(`oklch(${lightness} ${chroma} ${hue})`);
					document.documentElement.style.setProperty("--norn-ui-accent", `rgb(${accent.join(" ")})`);
					result.count++;
					result.ink = Math.min(result.ink, ratio(read(onAccent), accent));
					result.link = Math.min(result.link, ratio(read(accentText), surface));
				}
			}
		}
		document.documentElement.style.removeProperty("--norn-ui-accent");
		probe.remove();
		return result;
	}, [token("text.on-accent"), token("text.accent")]);
}
