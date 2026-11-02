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

import norn from "@allons-y/webc-patterns/plugin";

import { readTokens } from "../../scripts/build-components.js";

import { ASSETS_COMMIT, prepare, readAsset } from "./scripts/lib.js";
import oss, { brand, components as glob, fonts, host, policies, ossEnabled, ossProps, tokens } from "./index.js";

const COMPONENTS = path.join(import.meta.dirname, "components");
const components = fs.readdirSync(COMPONENTS).filter((file) => file.endsWith(".webc")).map((file) => file.slice(0, -5));

/** Site facts as `buildSite` returns them, for a released package with its own conduct file. */
const SITE = {
	name: "widget",
	packageName: "@acme/widget",
	tagline: "Builds widgets",
	description: "Builds widgets. Fast, and small.",
	license: "MPL-2.0",
	licenseUrl: "https://github.com/acme/widget/blob/main/LICENSE",
	repo: "https://github.com/acme/widget",
	npm: "https://www.npmjs.com/package/@acme/widget",
	node: "24+",
	url: "https://projects.allons-y.studio/widget/",
	issuesUrl: "https://github.com/acme/widget/issues",
	contributingUrl: "https://github.com/acme/widget/blob/main/.github/CONTRIBUTING.md",
	changelogUrl: "https://github.com/acme/widget/blob/main/CHANGELOG.md",
	conductUrl: "https://github.com/acme/widget/blob/main/CODE_OF_CONDUCT.md",
	securityUrl: null,
	npmRelease: true,
	badgeColor: "ff944d",
};

test("ossEnabled: on unless package.json sets oss-docs.oss to false", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "oss-"));
	const packagePath = path.join(root, "package.json");
	for (const [settings, expected] of [[undefined, true], [{ flavor: "docs" }, true], [{ oss: true }, true], [{ oss: false }, false]]) {
		fs.writeFileSync(packagePath, JSON.stringify({ name: "x", "oss-docs": settings }));
		assert.equal(ossEnabled({ packagePath }), expected, JSON.stringify(settings));
	}
	fs.rmSync(root, { recursive: true, force: true });
	assert.equal(host, "https://projects.allons-y.studio");
});

test("ossProps: the head, header, and footer props from the site facts and project.json", () => {
	const props = ossProps(SITE, { favicon: "favicon.svg", logo: "logo.svg", features: [{ title: "Fast", body: "Quick." }], usage: { language: "js", code: "x" } }, { docs: [{ href: "/start/", title: "Start" }], anchors: true });
	assert.equal(props.ogTitle, "widget: Builds widgets");
	assert.equal(props.icon, "/assets/img/favicon.svg");
	assert.deepEqual(props.logo, { src: "/assets/img/logo.svg", alt: "widget" });
	assert.deepEqual(props.nav.map(({ title }) => title), ["Install", "Usage", "Features", "Docs", "GitHub", "npm"]);
	assert.equal(props.nav[3].icon, "book");
	assert.equal(props.install, "npm install @acme/widget");
	assert.deepEqual(props.footer.license, { name: "MPL-2.0", url: SITE.licenseUrl });
	assert.deepEqual(props.footer.badges.map(({ src, width }) => [src, width]), [
		["https://img.shields.io/npm/v/@acme/widget?logo=npm&labelColor=black&color=%23ff944d", 105],
		["https://img.shields.io/npm/dw/@acme/widget?logo=npm&labelColor=black&color=%23ff944d", 157],
	]);
	assert.deepEqual(props.footer.groups.map(({ heading, links }) => [heading, links.map(({ title }) => title)]), [
		["Project", ["GitHub", "npm", "Changelog"]],
		["Help", ["Report an issue", "Contributing guide", "Code of conduct", "Security policy"]],
	]);
});

test("ossProps: every header and footer link is an item, { href, title }", () => {
	const props = ossProps(SITE, { usage: { language: "js", code: "x" }, features: [{ title: "Fast", description: "Quick." }] }, { docs: [{ href: "/start/", title: "Start" }], anchors: true });
	const links = [...props.nav, ...props.footer.groups.flatMap((group) => group.links)];
	assert.ok(links.length > 0);
	for (const link of links) assert.deepEqual(Object.keys(link).filter((key) => key !== "icon").sort(), ["href", "title"], JSON.stringify(link));
	assert.deepEqual(props.nav.map(({ href }) => href), ["#install", "#usage", "#features", "/start/", SITE.repo, SITE.npm]);
});

test("ossProps: a tagline that already ends in a period is not given a second one", () => {
	assert.equal(ossProps({ ...SITE, tagline: "Fast. Small." }, {}).footer.text, "Fast. Small.");
	assert.equal(ossProps(SITE, {}).footer.text, "Builds widgets.");
});

test("ossProps: conduct and security come from the project first, and Allons-y Studio's policies only with the OSS site theme on", () => {
	const help = (options) => ossProps(SITE, {}, options).footer.groups[1].links;
	assert.deepEqual(help().slice(2).map(({ href }) => href), [SITE.conductUrl, policies.security]);
	assert.deepEqual(help({ oss: false }).slice(2).map(({ href }) => href), [SITE.conductUrl], "no Allons-y Studio policy");
});

test("ossProps: missing data gives empty props and Allons-y Studio's policies, never a throw", () => {
	for (const args of [[], [undefined, undefined], [{}, {}], [null, "x", { docs: "x" }]]) {
		const props = ossProps(...args);
		assert.deepEqual([props.nav, props.features, props.packages, props.footer.badges], [[], [], [], []], JSON.stringify(args));
		assert.deepEqual(props.footer.groups.flatMap(({ links }) => links.map(({ href }) => href)), [policies.conduct, policies.security]);
	}
	assert.deepEqual(ossProps(undefined, undefined, { oss: false }).footer.groups, [], "with the OSS site theme off, no group is left empty");
});

/** A stand-in for Eleventy's config that records what the OSS site plugin registers. */
function fakeConfig() {
	const calls = { plugins: [], passthrough: [] };
	return { calls, addPlugin: (plugin, options) => calls.plugins.push({ plugin, options }), addPassthroughCopy: (copy) => calls.passthrough.push(copy) };
}

test("the OSS site plugin adds Norn with the OSS components, the theme color, and the project's options, and copies the fonts", () => {
	const config = fakeConfig();
	const props = () => ({});
	oss(config, { props, components: ["_includes/*.webc"], defaults: { locale: "fr_FR" } });
	assert.equal(config.calls.plugins.length, 1);
	const [{ plugin, options }] = config.calls.plugins;
	assert.equal(plugin, norn);
	assert.equal(options.props, props);
	assert.deepEqual(options.components, [glob, "_includes/*.webc"]);
	assert.deepEqual(options.defaults, { themeColor: "#33394e", locale: "fr_FR" });
	assert.deepEqual(config.calls.passthrough, [{ [fonts]: "assets/fonts" }]);
	assert.ok(glob.endsWith("/components/*.webc") && !glob.replace(/\\(?=[\\()*?[\]{|}!+@])/g, "").includes("\\"), "no backslash path separators; one before a glob character is an escape");
});

test("the brand tokens set only shared tokens from tokens.json, in the norn.oss layer", () => {
	const css = fs.readFileSync(tokens, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
	assert.ok(css.trim().startsWith("@layer norn.oss {\n\t:root {"));
	const shared = new Set(readTokens().map(({ name }) => name));
	const declarations = [...css.matchAll(/^\s*([\w-]+)\s*:/gm)].map(([, name]) => name);
	assert.ok(declarations.length > 0 && declarations.every((name) => shared.has(name)), declarations.join(", "));
	assert.ok(declarations.includes("--norn-font-mono"));
});

test("the brand rules style the Norn components by their tags in the norn.oss layer, and set no custom property", () => {
	const css = fs.readFileSync(brand, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
	assert.ok(css.trim().startsWith("@layer norn.oss {"));
	const shared = new Set(readTokens().map(({ name }) => name));
	assert.ok(!/^\s*--[\w-]+\s*:/m.test(css), "sets no custom property");
	for (const [, name] of css.matchAll(/var\((--norn-[\w-]+)/g)) assert.ok(shared.has(name), `${name} is a shared token`);
	const rules = [...css.matchAll(/^\t(\S[^{\n]*?)\s*\{/gm)].map(([, selector]) => selector);
	assert.ok(rules.length > 0 && rules.every((selector) => /^norn-[a-z-]+ > /.test(selector)), rules.join(", "));
	assert.match(css, /norn-header > header \{[\s\S]*?&::after \{[\s\S]*?block-size: 3px;[\s\S]*?background: linear-gradient\(90deg, #d22d6f 0 25%, #ff944d 25% 50%, #ffd36b 50% 75%, #1f91ad 75%\);/, "the header strip");
	assert.match(css, /norn-footer > footer > div:first-child > :first-child strong:first-of-type \{\s*color: var\(--norn-text-accent, [^;]+\);\s*font-family: var\(--norn-font-mono, [^;]+\);\s*font-size: 1\.2rem;/, "the footer name");
});

test("fonts: a forward-slash folder holding the four woff2 files", () => {
	assert.ok(!fonts.includes("\\"));
	assert.deepEqual(fs.readdirSync(fonts).sort(), ["instrument-sans-italic-var.woff2", "instrument-sans-var.woff2", "pt-mono.woff2", "yellowtail.woff2"]);
});

test("the package ships the four OSS components, and no page body or generic chrome", () => {
	assert.deepEqual(components, ["oss-bar", "oss-credit", "oss-cta", "oss-head"]);
});

test("each OSS component inlines its SVGs with an accessible name or a decorative mark", () => {
	const read = (name) => fs.readFileSync(path.join(COMPONENTS, `${name}.webc`), "utf8");
	const label = 'role="img" aria-label="Brought to you by Allons-y Studio"';
	assert.equal((read("oss-bar").match(new RegExp(`<svg ${label}`, "g")) ?? []).length, 1);
	assert.equal((read("oss-credit").match(new RegExp(`<svg ${label}`, "g")) ?? []).length, 1, "one lockup that follows the scheme");
	assert.ok(/style="fill:light-dark\(#EFEBDF,#33394E\);stroke:light-dark\(#33394E,#FBF9F3\)"/.test(read("oss-credit")), "its paint reads the scheme");
	assert.equal((read("oss-cta").match(/<svg aria-hidden="true" width="72" height="72"/g) ?? []).length, 1);
	for (const name of ["oss-bar", "oss-cta", "oss-credit"]) assert.ok(!/<svg[^>]*>\s*<\/svg>/.test(read(name)), `${name} has no empty placeholder`);
});

test("the Allons-y Studio contact address lives only in oss-cta, and no component carries an HTML comment", () => {
	for (const name of components) {
		const text = fs.readFileSync(path.join(COMPONENTS, `${name}.webc`), "utf8");
		assert.equal(/consulting@allons-y\.studio|mailto:/.test(text), name === "oss-cta", name);
		assert.ok(!text.replace(/<!---[\s\S]*?--->/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").includes("<!--"), `${name} has no HTML comment`);
		assert.ok(text.startsWith("<!---\n/*\n * SPDX-License-Identifier: MPL-2.0"), `${name} starts with the license header`);
	}
});

test("prepare: adds the attributes, drops the XML prolog, and keeps the markup", () => {
	assert.equal(prepare('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>\n', 'role="img"'), '<svg role="img" viewBox="0 0 1 1"><path d="M0 0"/></svg>');
});

test("prepare: crops to the given viewBox, and only on the svg's own tag", () => {
	assert.equal(
		prepare('<svg viewBox="0 0 1600 64"><svg viewBox="0 0 9 9"/></svg>', 'role="img"', "551 0 500 64"),
		'<svg role="img" viewBox="551 0 500 64"><svg viewBox="0 0 9 9"/></svg>',
	);
	assert.throws(() => prepare("<svg></svg>", 'role="img"', "0 0 1 1"), /no viewBox/);
});

test("prepare: refuses script, style, foreignObject, event handlers, and anything that is not an svg", () => {
	for (const bad of ["<svg><script>1</script></svg>", "<svg><style>a{}</style></svg>", "<svg><foreignObject/></svg>", '<svg onload="x()"></svg>', "<div></div>"]) {
		assert.throws(() => prepare(bad, 'role="img"'), /plain markup/, bad);
	}
});

test("prepare: refuses WebC directives, which run when the component is built, and keeps an @ or : that is only text or a value", () => {
	for (const bad of ['<svg><rect :data-x="process.env.NPM_TOKEN"/></svg>', '<svg><g @html="1"></g></svg>', "<svg><g @raw='1'></g></svg>", '<svg><g webc:type="js"></g></svg>', "<svg webc:nokeep><path/></svg>", '<svg><path\n\t:d="1"/></svg>']) {
		assert.throws(() => prepare(bad, 'role="img"'), /WebC directives/, bad);
	}
	const fine = '<svg viewBox="0 0 1 1" aria-label="Follow @allons-y on x:y"><text>Follow @allons-y :)</text><use xlink:href="#a" xml:space="preserve"/></svg>';
	assert.equal(prepare(fine, 'role="img"'), fine.replace("<svg", '<svg role="img"'));
});

test("readAsset: fetches from the pinned commit, never a branch", async () => {
	assert.match(ASSETS_COMMIT, /^[0-9a-f]{40}$/);
	const saved = [process.env.OSS_ASSETS, globalThis.fetch];
	delete process.env.OSS_ASSETS;
	const urls = [];
	globalThis.fetch = async (url) => (urls.push(url), new Response("<svg></svg>"));
	try {
		await readAsset("svg", "mark.svg");
	} finally {
		[process.env.OSS_ASSETS, globalThis.fetch] = saved;
		if (saved[0] === undefined) delete process.env.OSS_ASSETS;
	}
	assert.deepEqual(urls, [`https://raw.githubusercontent.com/allonsy-studio/.github/${ASSETS_COMMIT}/assets/svg/mark.svg`]);
});
