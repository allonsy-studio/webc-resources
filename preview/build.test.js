/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { pathToFileURL } from "node:url";

import { audit, launch, pagesOf, serve } from "./lib/browser.js";
import { buildCatalog, CATEGORIES } from "./lib/catalog.js";

const here = import.meta.dirname;
const eleventy = path.resolve(path.dirname(createRequire(import.meta.url).resolve("@11ty/eleventy")), "..", "cmd.cjs");
const catalog = buildCatalog({ packagesDir: path.join(here, "..", "packages"), storiesDir: path.join(here, "content", "stories") });

const read = (output, ...parts) => fs.readFileSync(path.join(output, ...parts), "utf8");
const pageFor = (output, url) => read(output, ...url.split("/").filter(Boolean), "index.html");

/** Build in its own process, which Eleventy needs for a clean bundle state. */
function build(output = "_site", env = {}, config = "eleventy.config.js") {
	fs.rmSync(path.join(here, output), { recursive: true, force: true });
	execFileSync(process.execPath, [eleventy, `--config=${config}`, "--quiet"], { cwd: here, env: { ...process.env, SITE_OUTPUT: output, ...env }, stdio: "pipe" });
	return path.join(here, output);
}

/** The packages' package.json files, as the catalog reads them. */
const PACKAGE_NAMES = { "webc-patterns": "@allons-y/webc-patterns", "webc-code-sample": "@allons-y/webc-code-sample", "webc-oss-site": "@allons-y/webc-oss-site" };

/** A component with every part of the JSDoc the catalog reads. */
const SAMPLE_COMPONENT = `<!---
/*
 * SPDX-License-Identifier: MPL-2.0
 */

/**
 * A sample component for the preview's own tests. It has a second sentence.
 *
 * It also has a second paragraph, with \`code\`.
 * @category component
 * @prop {string} title - The \`title\` shown.
 * @prop {"a" | "b"} [tone] - The tone, \`a\` or \`b\`.
 * @slot - The body.
 * @slot footer - The footer.
 * @cssprop --norn-sample-gap - The gap. Falls back to 1rem.
 * @cssprop --norn-sample-ink - The ink. Falls back to #2346d4.
 */
--->
<div><slot></slot></div>
`;

const SAMPLE_STORY = "---\ntitle: Default\norder: 1\n---\n<p>The sample, in a frame.</p>\n";

/**
 * Write a packages folder and a stories folder the catalog can read.
 *
 * @param {string} root
 * @param {{ components?: Record<string, string>, stories?: Record<string, string> }} [files] - Component sources by `<folder>/<name>`, and story files by `<package>/<component>/<file>`
 */
function writeTree(root, { components = {}, stories = {} } = {}) {
	for (const [folder, name] of Object.entries(PACKAGE_NAMES)) {
		fs.mkdirSync(path.join(root, "packages", folder), { recursive: true });
		fs.writeFileSync(path.join(root, "packages", folder, "package.json"), JSON.stringify({ name, version: "1.2.3", description: `The ${folder} package.` }));
	}
	for (const [file, source] of Object.entries(components)) {
		fs.mkdirSync(path.dirname(path.join(root, "packages", file)), { recursive: true });
		fs.writeFileSync(path.join(root, "packages", file), source);
	}
	for (const [file, source] of Object.entries(stories)) {
		fs.mkdirSync(path.dirname(path.join(root, "stories", file)), { recursive: true });
		fs.writeFileSync(path.join(root, "stories", file), source);
	}
	return { packagesDir: path.join(root, "packages"), storiesDir: path.join(root, "stories") };
}

describe("the catalog", () => {
	test("finds every component and layout in every package, from the files on disk", () => {
		for (const pkg of catalog.packages) {
			const onDisk = (folder) => {
				const dir = path.join(here, "..", "packages", `webc-${pkg.id}`, folder);
				return fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".webc")).map((file) => file.slice(0, -".webc".length)).sort() : [];
			};
			assert.deepEqual(pkg.components.filter(({ layout }) => !layout).map(({ name }) => name).sort(), onDisk("components"), pkg.id);
			assert.deepEqual(pkg.components.filter(({ layout }) => layout).map(({ name }) => name).sort(), onDisk("layouts"), `${pkg.id} layouts`);
		}
	});

	test("packages with no components make an empty catalog, with every category listed and empty", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-catalog-"));
		try {
			const empty = buildCatalog(writeTree(root));
			assert.deepEqual(empty.packages.map(({ id, name, version }) => [id, name, version]), [["patterns", "@allons-y/webc-patterns", "1.2.3"], ["code-sample", "@allons-y/webc-code-sample", "1.2.3"], ["oss-site", "@allons-y/webc-oss-site", "1.2.3"]]);
			assert.deepEqual(empty.components, []);
			assert.deepEqual(empty.categories.map(({ id, components }) => [id, components.length]), CATEGORIES.map(({ id }) => [id, 0]));
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test("parses props, slots, and custom properties out of the JSDoc, and joins the stories", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-catalog-"));
		try {
			const sample = buildCatalog(writeTree(root, { components: { "webc-patterns/components/norn-sample.webc": SAMPLE_COMPONENT }, stories: { "patterns/norn-sample/default.webc": SAMPLE_STORY, "patterns/norn-sample/notes.txt": "not a story" } }));
			const [component] = sample.components;
			assert.equal(sample.components.length, 1);
			assert.equal(component.slug, "patterns/norn-sample");
			assert.equal(component.url, "/components/patterns/norn-sample/");
			assert.equal(component.tag, "<norn-sample>");
			assert.equal(component.category, "component");
			assert.equal(component.summaryText, "A sample component for the preview's own tests.");
			assert.deepEqual(component.description, ["A sample component for the preview's own tests. It has a second sentence.", "It also has a second paragraph, with <code>code</code>."]);
			assert.deepEqual(component.props, [
				{ name: "title", type: "string", optional: false, description: "The <code>title</code> shown." },
				{ name: "tone", type: '"a" | "b"', optional: true, description: "The tone, <code>a</code> or <code>b</code>." },
			]);
			assert.deepEqual(component.slots.map(({ name }) => name), ["default", "footer"], "an unnamed slot is the default one");
			assert.deepEqual(component.cssprops.map(({ name, type, fallback }) => [name, type, fallback]), [["--norn-sample-gap", "<length>", "1rem"], ["--norn-sample-ink", "<color>", "#2346d4"]]);
			assert.deepEqual(component.stories.map(({ slug, title, frameUrl, source }) => [slug, title, frameUrl, source]), [["default", "Default", "/frames/patterns/norn-sample/default/", "<p>The sample, in a frame.</p>"]]);
			assert.deepEqual(sample.categories.find(({ id }) => id === "component").components.map(({ name }) => name), ["norn-sample"]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test("every component outside the head has a story, and the head components have none", () => {
		for (const component of catalog.components) {
			if (component.head) assert.equal(component.stories.length, 0, `${component.slug} renders in the head of every page that uses it`);
			else assert.ok(component.stories.length > 0, `${component.slug} needs a story in content/stories/${component.packageId}/${component.name}/`);
		}
	});

	test("every component names a category, and sits in exactly one", () => {
		assert.deepEqual(catalog.categories.map(({ id }) => id), CATEGORIES.map(({ id }) => id));
		for (const component of catalog.components) assert.ok(CATEGORIES.some(({ id }) => id === component.category), `${component.slug} needs a valid @category`);
		assert.equal(catalog.categories.flatMap(({ components }) => components).length, catalog.components.length, "each component in exactly one category");
	});

	test("no story is left without a component", () => {
		const known = new Set(catalog.components.map(({ slug }) => slug));
		const root = path.join(here, "content", "stories");
		for (const pkg of fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
			for (const dir of fs.readdirSync(path.join(root, pkg.name), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
				assert.ok(known.has(`${pkg.name}/${dir.name}`), `stories/${pkg.name}/${dir.name} has no component`);
			}
		}
	});
});

describe("the preview build", () => {
	let output;

	before(() => {
		output = build();
	});

	test("builds the components page, one page per component, and one frame per story", () => {
		assert.ok(fs.existsSync(path.join(output, "index.html")));
		for (const component of catalog.components) {
			assert.ok(fs.existsSync(path.join(output, "components", component.packageId, component.name, "index.html")), component.slug);
			for (const story of component.stories) assert.ok(fs.existsSync(path.join(output, ...story.frameUrl.split("/").filter(Boolean), "index.html")), story.frameUrl);
		}
	});

	test("every page has a language, a title, one h1, and the landmarks", () => {
		const pages = pagesOf(output);
		assert.ok(pages.length > 0);
		for (const url of pages) {
			const html = pageFor(output, url);
			assert.ok(html.startsWith("<!doctype html>\n<html lang=\"en\">"), `${url} has a doctype and a language`);
			assert.match(html, /<title>[^<]+<\/title>/, `${url} has a title`);
			assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${url} has one h1`);
			assert.ok(html.includes("<main"), `${url} has a main`);
			if (url.startsWith("/frames/")) continue;
			for (const tag of ["<header>", "<nav ", "<footer>"]) assert.ok(html.includes(tag), `${url} has ${tag}`);
			assert.ok(html.indexOf('<a href="#main" class="skip-link">') < html.indexOf("<header>"), `${url} opens with the skip link`);
			assert.ok(html.includes('<main id="main" tabindex="-1">'), `${url} is where the skip link goes`);
		}
	});

	test("the components page lists every component, or says there are none", () => {
		const html = pageFor(output, "/");
		if (!catalog.components.length) {
			assert.ok(html.includes("<p>The packages hold no components yet, so there is nothing to show; each one appears here as it lands.</p>"));
			assert.ok(!html.includes("<preview-nav") && !html.includes('aria-label="Components"'), "no empty navigation");
			assert.ok(!/<h2>(Layout|Landmark|Container|Component|Template|Document)<\/h2>/.test(html), "no empty category");
		} else {
			assert.ok(!html.includes("hold no components"));
			for (const component of catalog.components) assert.equal(html.split(`<a href="${component.url}">`).length - 1, 1, component.slug);
		}
		for (const pkg of catalog.packages) assert.ok(html.includes(`<code>${pkg.name}</code>`), pkg.name);
	});

	test("the nav groups the components by category, in order, lists each once, and marks the current page", () => {
		for (const component of catalog.components) {
			const html = pageFor(output, component.url);
			const groups = [...html.matchAll(/<summary>([^<]+)<\/summary>/g)].map(([, title]) => title);
			assert.deepEqual(groups, CATEGORIES.filter(({ id }) => catalog.components.some((entry) => entry.category === id)).map(({ title }) => title));
			for (const entry of catalog.components) assert.equal(html.split(`href="${entry.url}"`).length - 1, 1, entry.slug);
			assert.ok(html.includes(`<a href="${component.url}" aria-current="page">${component.name}</a>`));
		}
	});

	test("the output has no HTML comments, no empty tags, and no leftover template markup", () => {
		for (const url of pagesOf(output)) {
			const html = pageFor(output, url);
			assert.ok(!html.includes("<!--") && !/\ssrc=""|\shref=""|<style><\/style>|<script><\/script>/.test(html), url);
			assert.ok(!/<template|\sslot=|webc:|undefined/.test(html), `${url} has no leftover markup`);
		}
	});

	test("the axe asset and the brand are in the build", () => {
		for (const file of ["axe.min.js", "norn-favicon.svg", "styles/base.css", "styles/shell.css", "styles/frame.css", "fonts/aubrey.woff2", "fonts/OFL-aubrey.txt"]) assert.ok(fs.existsSync(path.join(output, "assets", file)), file);
	});
});

describe("the preview under a path prefix", () => {
	const prefix = "/webc-resources/";
	let output;

	before(() => {
		output = build("_site-prefixed", { PATH_PREFIX: prefix });
	});

	/** Whether a URL path under the prefix names a built file or page. */
	const exists = (pathname) => {
		const file = path.join(output, decodeURIComponent(pathname.slice(prefix.length)));
		return fs.existsSync(file) && (fs.statSync(file).isFile() || fs.existsSync(path.join(file, "index.html")));
	};

	test("every root-relative link, asset, and stylesheet URL stays under the prefix and names a file in the build", () => {
		const escaped = [];
		const missing = [];
		const check = (page, value) => {
			if (!value.startsWith("/") || value.startsWith("//")) return;
			const pathname = value.split(/[?#]/)[0];
			if (!pathname.startsWith(prefix)) escaped.push(`${page}: ${value}`);
			else if (!exists(pathname)) missing.push(`${page}: ${value}`);
		};
		const pages = pagesOf(output);
		assert.ok(pages.length > 0);
		for (const url of pages) {
			const html = pageFor(output, url);
			for (const [tag] of html.matchAll(/<[a-z][^>]*>/g)) {
				for (const [, name, value] of tag.matchAll(/\s(href|src|poster|action|data-axe|data-bundle|srcset)="([^"]*)"/g)) {
					if (name !== "srcset") check(url, value);
					else if (!value.startsWith("data:")) for (const candidate of value.split(",")) check(url, candidate.trim().split(/\s+/)[0]);
				}
			}
		}
		for (const file of fs.readdirSync(path.join(output, "assets", "styles"))) {
			for (const [, , value] of read(output, "assets", "styles", file).matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) assert.ok(!value.startsWith("/"), `${file}: ${value} is relative to the stylesheet`);
		}
		assert.deepEqual(escaped, [], "URLs that leave the prefix");
		assert.deepEqual(missing, [], "URLs with no file behind them");
	});

	test("the shell links its stylesheets and icon under the prefix", () => {
		const html = pageFor(output, "/");
		for (const file of ["styles/base.css", "styles/shell.css", "norn-favicon.svg"]) assert.ok(html.includes(`href="${prefix}assets/${file}"`), file);
		assert.ok(html.includes(`<a rel="home" href="${prefix}">`) && html.includes('<a href="#main"'), "the brand follows the prefix, and the skip link stays on the page");
	});
});

describe("the preview in a browser", () => {
	let output;
	let prefixed;
	let server;
	let prefixedServer;
	let browser;

	before(async () => {
		output = build();
		prefixed = build("_site-prefixed", { PATH_PREFIX: "/webc-resources/" });
		server = await serve(output);
		prefixedServer = await serve(prefixed, "/webc-resources/");
		browser = await launch();
	});

	after(async () => {
		await browser?.close();
		await server?.close();
		await prefixedServer?.close();
	});

	test("every page passes axe in light, dark, and forced colors", async () => {
		assert.deepEqual(await audit(browser, server.url, pagesOf(output)), []);
	});

	test("no preview page scrolls sideways on a phone", async () => {
		const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
		for (const url of pagesOf(output).filter((entry) => !entry.startsWith("/frames/"))) {
			await page.goto(server.url + url);
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 320), url);
		}
		await page.close();
	});

	for (const [name, getServer, getOutput] of [["at the root", () => server, () => output], ["under the prefix", () => prefixedServer, () => prefixed]]) {
		test(`no page ${name} logs an error to the console or requests a missing file`, async () => {
			const page = await browser.newPage();
			const problems = [];
			page.on("pageerror", (error) => problems.push(error.message));
			page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
			page.on("response", (response) => response.status() >= 400 && problems.push(`${response.status()} ${response.url()}`));
			page.on("requestfailed", (request) => problems.push(`failed ${request.url()}`));
			const pages = pagesOf(getOutput());
			assert.ok(pages.length > 0);
			for (const url of pages) {
				await page.goto(getServer().url + url);
				await page.waitForLoadState("networkidle");
			}
			assert.deepEqual(problems, []);
			await page.close();
		});
	}

	test("the skip link is the first stop, appears on focus, and moves focus to the page", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + "/");
		await page.keyboard.press("Tab");
		const link = page.getByRole("link", { name: "Skip to content" });
		assert.ok(await link.evaluate((element) => element === document.activeElement));
		assert.ok((await link.boundingBox()).y >= 0, "on screen when focused");
		await page.keyboard.press("Enter");
		assert.equal(await page.evaluate(() => document.activeElement.id), "main");
		await page.close();
	});

	test("the page follows the reader's color scheme", async () => {
		const colors = {};
		for (const colorScheme of ["light", "dark"]) {
			const context = await browser.newContext({ colorScheme });
			const page = await context.newPage();
			await page.goto(server.url + "/");
			colors[colorScheme] = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
			await context.close();
		}
		assert.deepEqual(colors, { light: "rgb(255, 255, 255)", dark: "rgb(16, 18, 22)" });
	});
});

describe("the preview with a sample component", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-sample-"));
	let output;
	let server;
	let browser;

	before(async () => {
		// The catalog, a story, and the config come from a throwaway tree: the repository itself holds no component or story yet.
		const sample = buildCatalog(writeTree(root, { components: { "webc-patterns/components/norn-sample.webc": SAMPLE_COMPONENT }, stories: { "patterns/norn-sample/default.webc": SAMPLE_STORY } }));
		fs.mkdirSync(path.join(root, "_data"));
		fs.writeFileSync(path.join(root, "_data", "catalog.json"), JSON.stringify(sample));
		const config = path.join(root, "eleventy.sample.config.js");
		const data = path.relative(path.join(here, "content"), path.join(root, "_data"));
		fs.writeFileSync(
			config,
			`import preview from ${JSON.stringify(pathToFileURL(path.join(here, "eleventy.config.js")).href)};

export default async function (config) {
	const options = await preview(config);
	config.addTemplate("stories/patterns/norn-sample/default.webc", ${JSON.stringify(SAMPLE_STORY.replace(/^---[\s\S]*?---\n/, ""))}, { title: "Default" });
	return { ...options, dir: { ...options.dir, data: ${JSON.stringify(data)} } };
}
`,
		);
		output = build("_site-sample", {}, config);
		server = await serve(output);
		browser = await launch();
	});

	after(async () => {
		await browser?.close();
		await server?.close();
		fs.rmSync(root, { recursive: true, force: true });
	});

	const COMPONENT = "/components/patterns/norn-sample/";
	const FRAME = "/frames/patterns/norn-sample/default/";

	/** Wait for the canvas's frame to load, and return it. */
	async function frameOf(page) {
		const handle = await page.locator("preview-canvas iframe").elementHandle();
		const frame = await handle.contentFrame();
		await frame.waitForLoadState("load");
		return frame;
	}

	test("the components page and the nav list it under its category", () => {
		const index = pageFor(output, "/");
		assert.ok(index.includes("<h2>Component</h2>") && index.includes('<h3><a href="/components/patterns/norn-sample/">norn-sample</a></h3>') && index.includes("<p>A sample component for the preview's own tests.</p>"));
		assert.ok(!index.includes("hold no components"));
		assert.ok(index.includes("<summary>Component</summary>") && !index.includes("<summary>Layout</summary>"), "the nav leaves out empty categories");
		assert.ok(pageFor(output, COMPONENT).includes('<a href="/components/patterns/norn-sample/" aria-current="page">norn-sample</a>'));
	});

	test("a component page shows its docs, each from the JSDoc, and its story in a canvas with the source", () => {
		const html = pageFor(output, COMPONENT);
		assert.ok(html.includes("<h1>norn-sample</h1>") && html.includes("<code>&lt;norn-sample&gt;</code>"));
		assert.ok(html.includes("<code>@title</code><small> required</small>") && html.includes("<code>@tone</code>") && html.includes("The <code>title</code> shown."));
		assert.ok(html.includes("<code>default</code>") && html.includes("<code>footer</code>"));
		assert.ok(html.includes("<code>--norn-sample-gap</code>") && html.includes("<code>&lt;length&gt;</code>") && html.includes("<code>1rem</code>"));
		assert.equal((html.match(/<preview-canvas>/g) ?? []).length, 1);
		assert.ok(html.includes(`src="${FRAME}"`) && html.includes('data-axe="/assets/axe.min.js"'));
		assert.ok(html.includes("<summary>Source</summary>") && html.includes("<code>&lt;p&gt;The sample, in a frame.&lt;/p&gt;</code>"));
		assert.ok(!/<template|\sslot=|webc:|undefined/.test(html));
	});

	test("a frame is a plain page with the story in its main and the title as a hidden h1", () => {
		const html = pageFor(output, FRAME);
		assert.ok(html.includes('<h1 class="sr-only">Default</h1>') && html.includes("<p>The sample, in a frame.</p>"));
		assert.ok(!html.includes("<header") && !html.includes("<nav"), "no shell");
	});

	test("every page passes axe in light, dark, and forced colors, on a wide screen and a phone", async () => {
		assert.deepEqual(await audit(browser, server.url, pagesOf(output)), []);
		assert.deepEqual(await audit(browser, server.url, pagesOf(output), { width: 320 }), []);
	});

	test("no page scrolls sideways on a phone, and no page logs an error or requests a missing file", async () => {
		const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
		const problems = [];
		page.on("pageerror", (error) => problems.push(error.message));
		page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
		page.on("response", (response) => response.status() >= 400 && problems.push(`${response.status()} ${response.url()}`));
		for (const url of pagesOf(output)) {
			await page.goto(server.url + url);
			await page.waitForLoadState("networkidle");
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 320), url);
		}
		assert.deepEqual(problems, []);
		await page.close();
	});

	test("the scheme control offers light, system, and dark, with system selected, and sets the frame's color scheme", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + COMPONENT);
		const frame = await frameOf(page);
		const canvas = page.locator("preview-canvas");
		const group = canvas.getByRole("group", { name: "Color scheme" });
		assert.deepEqual(await group.locator("label").allTextContents(), ["Light", "System", "Dark"]);
		assert.equal(await group.getByRole("radio", { name: "System" }).isChecked(), true);
		await group.getByRole("radio", { name: "Dark" }).check();
		assert.equal(await frame.evaluate(() => document.documentElement.style.colorScheme), "dark");
		assert.equal(await frame.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(16, 18, 22)");
		assert.deepEqual([await group.getByRole("radio", { name: "Light" }).isChecked(), await group.getByRole("radio", { name: "System" }).isChecked()], [false, false], "one at a time");
		await group.getByRole("radio", { name: "Light" }).check();
		assert.equal(await frame.evaluate(() => document.documentElement.style.colorScheme), "light");
		await group.getByRole("radio", { name: "System" }).check();
		assert.equal(await frame.evaluate(() => document.documentElement.style.colorScheme), "");
		await page.close();
	});

	test("the width control sizes the frame, and the frame grows to its content", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + COMPONENT);
		const frame = await frameOf(page);
		const canvas = page.locator("preview-canvas");
		const group = canvas.getByRole("group", { name: "Width" });
		assert.deepEqual(await group.locator("label").allTextContents(), ["Fill", "Phone, 320px", "Tablet, 768px", "Desktop, 1024px"]);
		const width = () => canvas.locator("iframe").evaluate((element) => Math.round(element.getBoundingClientRect().width));
		const fill = await width();
		for (const [name, expected] of [["Phone, 320px", 320], ["Tablet, 768px", 768], ["Desktop, 1024px", 1024]]) {
			await group.getByRole("radio", { name }).check();
			assert.equal(await width(), expected, name);
		}
		await group.getByRole("radio", { name: "Fill" }).check();
		assert.equal(await width(), fill);
		const before = await canvas.locator("iframe").evaluate((element) => element.getBoundingClientRect().height);
		await frame.evaluate(() => document.querySelector("main").append(Object.assign(document.createElement("div"), { style: "block-size: 400px" })));
		await page.waitForFunction((height) => document.querySelector("preview-canvas iframe").getBoundingClientRect().height > height + 300, before);
		await page.close();
	});

	test("two canvases on a page keep their own selections", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + COMPONENT);
		await page.evaluate(() => document.querySelector("preview-canvas").after(document.querySelector("preview-canvas").cloneNode(true)));
		const canvases = page.locator("preview-canvas");
		assert.equal(await canvases.count(), 2);
		await canvases.nth(0).getByRole("radio", { name: "Dark" }).check();
		assert.equal(await canvases.nth(1).getByRole("radio", { name: "System" }).isChecked(), true);
		await page.close();
	});

	test("the accessibility check runs in the frame and shows a pass, then a failure with the rule", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(server.url + COMPONENT);
		const frame = await frameOf(page);
		const button = page.getByRole("button", { name: "Check accessibility" });
		const results = page.locator("preview-canvas [data-results]");
		assert.equal(await button.getAttribute("data-state"), "idle");
		await button.click();
		await results.getByText("No accessibility violations found.").waitFor();
		assert.equal(await button.getAttribute("data-state"), "pass");
		await frame.evaluate(() => document.querySelector("main").append(Object.assign(document.createElement("img"), { src: "data:," })));
		await button.click();
		await results.locator("strong").waitFor();
		assert.equal(await button.getAttribute("data-state"), "fail");
		assert.match(await results.textContent(), /1 accessibility violation[\s\S]*image-alt/);
		await page.close();
	});

	test("without a script the canvas is the frame and a link to open it on its own", async () => {
		const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
		const page = await context.newPage();
		await page.goto(server.url + COMPONENT);
		assert.equal(await page.locator("preview-canvas [data-js]").isVisible(), false);
		assert.ok(await page.getByRole("link", { name: "Open on its own" }).isVisible());
		await context.close();
	});
});
