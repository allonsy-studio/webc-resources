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

import { prepare } from "./scripts/lib.js";
import studio, { components as glob, fonts, host, policies, studioEnabled, studioProps, tokens } from "./index.js";

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

test("studioEnabled: on unless package.json sets oss-docs.studio to false", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-"));
	const packagePath = path.join(root, "package.json");
	for (const [settings, expected] of [[undefined, true], [{ flavor: "docs" }, true], [{ studio: true }, true], [{ studio: false }, false]]) {
		fs.writeFileSync(packagePath, JSON.stringify({ name: "x", "oss-docs": settings }));
		assert.equal(studioEnabled({ packagePath }), expected, JSON.stringify(settings));
	}
	fs.rmSync(root, { recursive: true, force: true });
	assert.equal(host, "https://projects.allons-y.studio");
});

test("studioProps: the head, header, and footer props from the site facts and project.json", () => {
	const props = studioProps(SITE, { favicon: "favicon.svg", logo: "logo.svg", features: [{ title: "Fast", body: "Quick." }], usage: { language: "js", code: "x" } }, { docs: [{ url: "/start/", title: "Start" }], anchors: true });
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

test("studioProps: conduct and security come from the project first, and the studio's policies only with the studio on", () => {
	const help = (options) => studioProps(SITE, {}, options).footer.groups[1].links;
	assert.deepEqual(help().slice(2).map(({ url }) => url), [SITE.conductUrl, policies.security]);
	assert.deepEqual(help({ studio: false }).slice(2).map(({ url }) => url), [SITE.conductUrl], "no studio policy");
});

test("studioProps: missing data gives empty props and the studio's policies, never a throw", () => {
	for (const args of [[], [undefined, undefined], [{}, {}], [null, "x", { docs: "x" }]]) {
		const props = studioProps(...args);
		assert.deepEqual([props.nav, props.features, props.packages, props.footer.badges], [[], [], [], []], JSON.stringify(args));
		assert.deepEqual(props.footer.groups.flatMap(({ links }) => links.map(({ url }) => url)), [policies.conduct, policies.security]);
	}
	assert.deepEqual(studioProps(undefined, undefined, { studio: false }).footer.groups, [], "with the studio off, no group is left empty");
});

/** A stand-in for Eleventy's config that records what the studio plugin registers. */
function fakeConfig() {
	const calls = { plugins: [], passthrough: [] };
	return { calls, addPlugin: (plugin, options) => calls.plugins.push({ plugin, options }), addPassthroughCopy: (copy) => calls.passthrough.push(copy) };
}

test("the studio plugin adds Norn with the studio components, the theme color, and the project's options, and copies the fonts", () => {
	const config = fakeConfig();
	const props = () => ({});
	studio(config, { props, components: ["_includes/*.webc"], defaults: { locale: "fr_FR" } });
	assert.equal(config.calls.plugins.length, 1);
	const [{ plugin, options }] = config.calls.plugins;
	assert.equal(plugin, norn);
	assert.equal(options.props, props);
	assert.deepEqual(options.components, [glob, "_includes/*.webc"]);
	assert.deepEqual(options.defaults, { themeColor: "#33394e", locale: "fr_FR" });
	assert.deepEqual(config.calls.passthrough, [{ [fonts]: "assets/fonts" }]);
	assert.ok(glob.endsWith("/components/*.webc") && !glob.includes("\\"));
});

test("the brand tokens set only custom properties, in the norn.studio layer", () => {
	const css = fs.readFileSync(tokens, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
	assert.ok(css.trim().startsWith("@layer norn.studio {\n\t:root {"));
	const declarations = [...css.matchAll(/^\s*([\w-]+)\s*:/gm)].map(([, name]) => name);
	assert.ok(declarations.length > 8 && declarations.every((name) => name.startsWith("--norn-")), declarations.join(", "));
	for (const name of ["--norn-font-mono", "--norn-feature-1", "--norn-code-block-dot-1", "--norn-header-stripe", "--norn-footer-name"]) assert.ok(declarations.includes(name), name);
});

test("fonts: a forward-slash folder holding the four woff2 files", () => {
	assert.ok(!fonts.includes("\\"));
	assert.deepEqual(fs.readdirSync(fonts).sort(), ["instrument-sans-italic-var.woff2", "instrument-sans-var.woff2", "pt-mono.woff2", "yellowtail.woff2"]);
});

test("the package ships the four studio components, and no page body or generic chrome", () => {
	assert.deepEqual(components, ["studio-bar", "studio-credit", "studio-cta", "studio-head"]);
});

test("each studio component inlines its SVGs with an accessible name or a decorative mark", () => {
	const read = (name) => fs.readFileSync(path.join(COMPONENTS, `${name}.webc`), "utf8");
	const label = 'role="img" aria-label="Brought to you by Allons-y Studio"';
	assert.equal((read("studio-bar").match(new RegExp(`<svg ${label}`, "g")) ?? []).length, 1);
	assert.equal((read("studio-credit").match(new RegExp(`<svg ${label}`, "g")) ?? []).length, 2);
	assert.equal((read("studio-cta").match(/<svg aria-hidden="true" width="72" height="72"/g) ?? []).length, 1);
	for (const name of ["studio-bar", "studio-cta", "studio-credit"]) assert.ok(!/<svg[^>]*>\s*<\/svg>/.test(read(name)), `${name} has no empty placeholder`);
});

test("the studio contact address lives only in studio-cta, and no component carries an HTML comment", () => {
	for (const name of components) {
		const text = fs.readFileSync(path.join(COMPONENTS, `${name}.webc`), "utf8");
		assert.equal(/consulting@allons-y\.studio|mailto:/.test(text), name === "studio-cta", name);
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
