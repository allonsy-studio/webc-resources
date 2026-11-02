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

import { accentHex, buildSite, buildWorkspaces, npmRelease } from "./project.js";

/** A host that serves sites at one path per repository. */
const HOST = "https://pages.example.com";

/** A temporary project directory with the given files, as `{ "path": content }`. */
function project(files) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "oss-site-"));
	for (const [file, content] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		fs.writeFileSync(path.join(root, file), typeof content === "string" ? content : JSON.stringify(content));
	}
	return root;
}

const PKG = { name: "@acme/widget", description: "Builds widgets. Fast, and small.", license: "MPL-2.0", repository: "git+https://github.com/acme/widget.git" };

/** `buildSite` for a package.json with the given overrides; a key set to undefined is removed. */
function site(overrides = {}, files = {}, projectJson) {
	const pkg = { ...PKG, ...overrides };
	for (const key of Object.keys(pkg)) if (pkg[key] === undefined) delete pkg[key];
	const root = project({ "package.json": pkg, ...files, ...(projectJson ? { "project.json": projectJson } : {}) });
	return buildSite({ packagePath: path.join(root, "package.json"), projectPath: projectJson ? path.join(root, "project.json") : undefined, host: HOST });
}

test("buildSite: the facts come from package.json", () => {
	assert.deepEqual(site({ engines: { node: ">=24" } }), {
		name: "widget",
		packageName: "@acme/widget",
		tagline: "Builds widgets",
		description: "Builds widgets. Fast, and small.",
		license: "MPL-2.0",
		licenseUrl: "https://github.com/acme/widget/blob/main/LICENSE",
		repo: "https://github.com/acme/widget",
		repoName: "widget",
		npm: "https://www.npmjs.com/package/@acme/widget",
		node: "24+",
		url: "https://pages.example.com/widget/",
		issuesUrl: "https://github.com/acme/widget/issues",
		contributingUrl: "https://github.com/acme/widget/blob/main/.github/CONTRIBUTING.md",
		changelogUrl: "https://github.com/acme/widget/blob/main/CHANGELOG.md",
		conductUrl: null,
		securityUrl: null,
	});
});

test("buildSite: a missing name, license, description, or repository throws a message naming the field", () => {
	for (const field of ["name", "license", "description", "repository"]) {
		assert.throws(() => site({ [field]: undefined }), (error) => error.message.includes(`\`${field}\``), field);
	}
});

test("buildSite: a repository that is not a hosted Git URL throws", () => {
	assert.throws(() => site({ repository: "not a url" }), /not a hosted Git URL/);
});

test("buildSite: the repository may be a string, an object, or a shorthand", () => {
	for (const repository of ["github:acme/widget", "git+https://github.com/acme/widget.git", { type: "git", url: "git+https://github.com/acme/widget.git" }]) {
		assert.equal(site({ repository }).repo, "https://github.com/acme/widget");
	}
});

test("buildSite: a private package has no npm link", () => {
	assert.equal(site({ private: true }).npm, null);
});

test("buildSite: the tagline is the first sentence unless the project sets one", () => {
	assert.equal(site().tagline, "Builds widgets");
	assert.equal(site({}, {}, { tagline: "Widgets, built" }).tagline, "Widgets, built");
});

test("buildSite: the url is the project's with a trailing slash, else the host's path for the repository, else none", () => {
	assert.equal(site({}, {}, { url: "https://widget.example.com" }).url, "https://widget.example.com/");
	assert.equal(site({}, {}, { url: "https://widget.example.com/docs/" }).url, "https://widget.example.com/docs/");
	assert.equal(site().url, "https://pages.example.com/widget/");
	const root = project({ "package.json": PKG });
	assert.equal(buildSite({ packagePath: path.join(root, "package.json") }).url, null, "no host, no url");
	assert.equal(buildSite({ packagePath: path.join(root, "package.json"), host: "https://pages.example.com/" }).url, "https://pages.example.com/widget/", "a trailing slash on the host");
	assert.ok(!("oss" in site({ "oss-docs": { oss: false } })), "the oss setting is the OSS site theme's to read");
});

test("buildSite: the node version is the lowest major, or null when unbounded", () => {
	assert.equal(site({ engines: { node: "^20.1 || ^22" } }).node, "20+");
	assert.equal(site({ engines: { node: "*" } }).node, null);
	assert.equal(site().node, null);
});

test("buildSite: the issues url honors bugs.url", () => {
	assert.equal(site({ bugs: { url: "https://tracker.example.com/widget" } }).issuesUrl, "https://tracker.example.com/widget");
});

test("buildSite: conduct and security links point at policy files the project keeps", () => {
	const files = { "CODE_OF_CONDUCT.md": "x", ".github/SECURITY.md": "x" };
	const found = site({}, files);
	assert.equal(found.conductUrl, "https://github.com/acme/widget/blob/main/CODE_OF_CONDUCT.md");
	assert.equal(found.securityUrl, "https://github.com/acme/widget/blob/main/.github/SECURITY.md");
	assert.equal(site({}, { "docs/SECURITY.md": "x" }).securityUrl, "https://github.com/acme/widget/blob/main/docs/SECURITY.md");
});

test("buildSite: file links take the form the repository's host uses, with GitHub's unchanged", () => {
	const found = site({ repository: "git+https://bitbucket.org/acme/widget.git" }, { "SECURITY.md": "x" });
	assert.equal(found.licenseUrl, "https://bitbucket.org/acme/widget/src/main/LICENSE");
	assert.equal(found.contributingUrl, "https://bitbucket.org/acme/widget/src/main/.github/CONTRIBUTING.md");
	assert.equal(found.changelogUrl, "https://bitbucket.org/acme/widget/src/main/CHANGELOG.md");
	assert.equal(found.securityUrl, "https://bitbucket.org/acme/widget/src/main/SECURITY.md");
	assert.equal(site({}).licenseUrl, "https://github.com/acme/widget/blob/main/LICENSE");
});

test("buildSite: a missing project.json is fine", () => {
	assert.equal(buildSite({ packagePath: path.join(project({ "package.json": PKG }), "package.json"), projectPath: "/nowhere/project.json" }).name, "widget");
});

const workspace = (name, description, files = {}) => ({ [`packages/${name}/package.json`]: { name: `@acme/${name}`, description }, ...Object.fromEntries(Object.entries(files).map(([file, text]) => [`packages/${name}/${file}`, text])) });

test("buildWorkspaces: one entry per workspace, sorted, with its page", () => {
	const root = project({
		"package.json": { workspaces: ["packages/*"] },
		...workspace("zed", "Last.", { "README.md": "# zed\n\nZed's readme.\n" }),
		...workspace("alpha", "First.", { "README.md": "# alpha\n\nAlpha's readme.\n" }),
	});
	assert.deepEqual(
		buildWorkspaces({ root }).map(({ name, title, description, slug, href, url }) => ({ name, title, description, slug, href, url })),
		[
			{ name: "@acme/alpha", title: "@acme/alpha", description: "First.", slug: "alpha", href: "/alpha/", url: undefined },
			{ name: "@acme/zed", title: "@acme/zed", description: "Last.", slug: "zed", href: "/zed/", url: undefined },
		],
	);
});

test("buildWorkspaces: negated patterns exclude workspaces", () => {
	const root = project({ "package.json": { workspaces: ["packages/*", "!packages/internal"] }, ...workspace("public", "Yes."), ...workspace("internal", "No.") });
	assert.deepEqual(buildWorkspaces({ root }).map((entry) => entry.slug), ["public"]);
});

test("buildWorkspaces: the workspaces field may be an object with packages", () => {
	const root = project({ "package.json": { workspaces: { packages: ["packages/*"] } }, ...workspace("only", "Yes.") });
	assert.deepEqual(buildWorkspaces({ root }).map((entry) => entry.slug), ["only"]);
});

test("buildWorkspaces: SKILL.md wins over README.md, and front matter and the first heading come off", () => {
	const root = project({
		"package.json": { workspaces: ["packages/*"] },
		...workspace("skilled", "A skill.", { "README.md": "# readme\n\nThe readme.\n", "SKILL.md": "---\nname: skilled\n---\n# Skilled\n\nThe skill.\n\n## Later heading\n" }),
	});
	const [entry] = buildWorkspaces({ root });
	assert.ok(entry.html.includes("<p>The skill.</p>") && entry.html.includes('<norn-heading-anchor @slug="later-heading">Later heading</norn-heading-anchor>'));
	assert.ok(!entry.html.includes("The readme.") && !entry.html.includes("<h1>") && !entry.html.includes("name: skilled"));
});

test("buildWorkspaces: Windows line endings lose the front matter and the first heading too", () => {
	const root = project({
		"package.json": { workspaces: ["packages/*"] },
		...workspace("crlf", "A skill.", { "SKILL.md": "---\r\nname: crlf\r\n---\r\n# Title\r\n\r\nThe skill.\r\n" }),
	});
	const [entry] = buildWorkspaces({ root });
	assert.ok(entry.html.includes("<p>The skill.</p>"));
	assert.ok(!entry.html.includes("name: crlf") && !entry.html.includes("<h1>") && !entry.html.includes("<hr>"), entry.html);
});

test("buildWorkspaces: code fences render as code samples, and a workspace without a page has empty html", () => {
	const root = project({
		"package.json": { workspaces: ["packages/*"] },
		...workspace("coded", "Code.", { "README.md": "```js\nlet a = 1;\n```\n" }),
		...workspace("bare", "Nothing."),
	});
	const entries = Object.fromEntries(buildWorkspaces({ root }).map((entry) => [entry.slug, entry]));
	assert.equal(entries.coded.html, '<norn-code-block @code="let a = 1;\n" @language="js"></norn-code-block>\n');
	assert.equal(entries.bare.html, "");
});

/** A fetch that answers with the given body and status, and counts its calls. */
const registry = (body, status = 200) => {
	const fake = async (url, init) => {
		fake.calls++;
		fake.requests.push({ url, init });
		return { ok: status === 200, json: async () => body };
	};
	fake.calls = 0;
	fake.requests = [];
	return fake;
};

test("npmRelease: a latest dist-tag is a release, and the answer is reused within the hour", async () => {
	const fetch = registry({ "dist-tags": { latest: "1.2.3" } });
	let clock = 0;
	assert.equal(await npmRelease("@example/released", { fetch, now: () => clock }), true);
	assert.equal(await npmRelease("@example/released", { fetch, now: () => clock }), true);
	assert.equal(fetch.calls, 1, "cached");
	assert.equal(fetch.requests[0].url, "https://registry.npmjs.org/@example%2Freleased");
	assert.equal(fetch.requests[0].init.headers.accept, "application/vnd.npm.install-v1+json", "the abbreviated document, which still holds dist-tags");
	clock = 60 * 60 * 1000;
	await npmRelease("@example/released", { fetch, now: () => clock });
	assert.equal(fetch.calls, 2, "asked again after an hour");
});

test("npmRelease: a missing package, no dist-tag, no network, or no name is no release", async () => {
	assert.equal(await npmRelease("@example/missing", { fetch: registry({}, 404) }), false);
	assert.equal(await npmRelease("@example/untagged", { fetch: registry({ "dist-tags": {} }) }), false);
	assert.equal(
		await npmRelease("@example/offline", {
			fetch: async () => {
				throw new TypeError("fetch failed");
			},
		}),
		false,
	);
	assert.equal(await npmRelease(null, { fetch: registry({ "dist-tags": { latest: "1.0.0" } }) }), false);
});

test("accentHex: the first accent declared in a stylesheet, lowercased, or null", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "accent-"));
	const css = path.join(dir, "project.css");
	fs.writeFileSync(css, ":root {\n\t--norn-ui-accent: #FF944D;\n}\n");
	assert.equal(accentHex(css), "ff944d");
	fs.writeFileSync(css, ":root { --norn-ui-accent: oklch(0.6 0.2 30); }");
	assert.equal(accentHex(css), null);
	assert.equal(accentHex(path.join(dir, "missing.css")), null);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("buildWorkspaces: a README renders with the site's add-ons and ids, and its HTML as HTML, as on GitHub", () => {
	const readme = [
		"# kit",
		"",
		'<p align="center"><img src="logo.svg" alt="Kit logo"></p>',
		"",
		"## Install",
		"",
		"| a | b |",
		"| - | - |",
		"| 1 | 2 |",
		"",
		"<details>",
		"<summary>More</summary>",
		"",
		"Hidden **text**.",
		"",
		"</details>",
		"",
		'<norn-callout @variant="tip">',
		"",
		"A tip.",
		"",
		"</norn-callout>",
		"",
		"## Install",
		"",
	].join("\n");
	const root = project({ "package.json": { workspaces: ["packages/*"] }, ...workspace("kit", "Kit.", { "README.md": readme }) });
	const [entry] = buildWorkspaces({ root });
	assert.ok(entry.html.includes('<p align="center"><img src="logo.svg" alt="Kit logo"></p>'), entry.html);
	assert.ok(entry.html.includes("<details>\n<summary>More</summary>\n<p>Hidden <strong>text</strong>.</p>\n</details>"), entry.html);
	assert.ok(entry.html.includes('<norn-callout @variant="tip">\n<p>A tip.</p>\n</norn-callout>'), entry.html);
	assert.ok(entry.html.includes("<norn-simple-table><table>"), entry.html);
	assert.deepEqual([...entry.html.matchAll(/<norn-heading-anchor @slug="([^"]+)">/g)].map((match) => match[1]), ["install", "install-2"]);
});

/** The `project.json` schema the package ships. */
const SCHEMA = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "schema", "project.schema.json"), "utf8"));

/**
 * The errors of a value against a schema, for the keywords `project.schema.json` uses: `type`, `required`, `properties`, `additionalProperties`, `items`, `minLength`, `enum`, and `not`.
 *
 * @param {object} schema - A JSON schema, or one of its subschemas
 * @param {unknown} value - The value to check
 * @param {string} [at] - The value's path, for the messages
 * @returns {string[]} One message per error; none when the value is valid
 */
function errors(schema, value, at = "") {
	const kind = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
	if (schema.not) return errors(schema.not, value, at).length ? [] : [`${at}: matches a forbidden schema`];
	if (schema.type && schema.type !== kind) return [`${at}: is not ${schema.type}`];
	if (schema.enum && !schema.enum.includes(value)) return [`${at}: is not one of ${schema.enum.join(", ")}`];
	if (kind === "string" && value.length < (schema.minLength ?? 0)) return [`${at}: is too short`];
	if (kind === "array" && schema.items) return value.flatMap((item, index) => errors(schema.items, item, `${at}[${index}]`));
	if (kind !== "object") return [];
	return [
		...(schema.required ?? []).filter((key) => !(key in value)).map((key) => `${at}: has no ${key}`),
		...Object.entries(value).flatMap(([key, child]) => {
			if (schema.properties?.[key]) return errors(schema.properties[key], child, `${at}.${key}`);
			return schema.additionalProperties === false ? [`${at}: has an unknown key ${key}`] : [];
		}),
	];
}

test("project.schema.json: a package card is { title, description, href? }, and a card with name in place of title fails", () => {
	assert.deepEqual(errors(SCHEMA, { packages: [{ title: "@acme/core", description: "The core.", href: "https://example.com/core" }] }), []);
	assert.deepEqual(errors(SCHEMA, { packages: [{ name: "@acme/core", description: "The core." }] }), [".packages[0]: has no title"]);
	assert.equal(SCHEMA.properties.packages.items.additionalProperties, undefined, "other keys stay allowed, as before");
});

test("project.schema.json: a feature card is { title, description, href? }, and a card with body in place of description fails", () => {
	assert.deepEqual(errors(SCHEMA, { features: [{ title: "Fast", description: "Quick to read.", href: "/fast/" }] }), []);
	assert.deepEqual(errors(SCHEMA, { features: [{ title: "Fast", body: "Quick to read." }] }), [".features[0]: has no description"]);
	assert.deepEqual(errors(SCHEMA, { features: [{ title: "Fast", description: "" }] }), [".features[0].description: is too short"]);
	assert.equal(SCHEMA.properties.features.items.additionalProperties, undefined, "other keys stay allowed, as before");
});

test("project.schema.json: the fixtures' and the preview's project data validate", () => {
	const root = path.resolve(import.meta.dirname, "..", "..");
	for (const file of ["fixtures/landing/src/_data/project.json", "fixtures/docs/src/_data/project.json", "fixtures/workspaces/src/_data/project.json", "preview/_data/project.json"]) {
		assert.deepEqual(errors(SCHEMA, JSON.parse(fs.readFileSync(path.join(root, file), "utf8"))), [], file);
	}
});
