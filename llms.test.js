/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// The llms.txt files tell an AI agent how to use the packages. They are generated from the sources, so
// these tests keep them current, complete, and linked to files that exist.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildCatalog } from "./preview/lib/catalog.js";
import { buildLlms, markdown } from "./scripts/build-llms.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const files = await buildLlms();
const catalog = await buildCatalog({ packagesDir: path.join(ROOT, "packages"), storiesDir: path.join(ROOT, "preview", "content", "stories") });

describe("llms.txt", () => {
	it("is current: run `yarn llms` after changing a component, a CSF file, or a guide", () => {
		for (const [file, content] of files) {
			const dest = path.join(ROOT, file);
			assert.ok(fs.existsSync(dest), `${file} is missing`);
			assert.equal(fs.readFileSync(dest, "utf8"), content, `${file} is out of date`);
		}
	});

	it("covers every component and layout, with each prop and slot", () => {
		for (const pkg of catalog.packages) {
			const text = files.get(`packages/webc-${pkg.id}/llms.txt`);
			for (const component of pkg.components) {
				const at = text.indexOf(`#### ${component.name}\n`);
				assert.ok(at >= 0, `${pkg.name}: ${component.name} is not in its llms.txt`);
				const next = text.indexOf("\n#### ", at + 1);
				const block = text.slice(at, next < 0 ? undefined : next);
				for (const name of Object.keys(component.argTypes)) assert.ok(block.includes(`\`${name}\``), `${component.name}: \`${name}\` is not in its reference`);
			}
		}
	});

	it("names every shipped layout in the patterns guide", () => {
		const text = files.get("packages/webc-patterns/llms.txt");
		const layouts = fs.readdirSync(path.join(ROOT, "packages", "webc-patterns", "src", "layouts")).filter((file) => file.endsWith(".webc"));
		assert.ok(layouts.length >= 6);
		for (const layout of layouts) assert.ok(text.includes(`| \`${layout}\``), `${layout} is not in the layout table`);
	});

	it("states the item shape and the no-custom-property rule where an agent reads first", () => {
		for (const file of ["llms.txt", "packages/webc-patterns/llms.txt"]) {
			const text = files.get(file);
			assert.match(text, /`href`[^.]*`title`[^.]*`description`/, `${file}: item shape`);
			assert.match(text, /no custom propert(y|ies) of (its|their) own/, `${file}: custom properties`);
		}
	});

	it("links only to files that exist in the repository", () => {
		for (const [file, content] of files) {
			for (const [, rel] of content.matchAll(/\]\(https:\/\/github\.com\/allonsy-studio\/webc-resources\/(?:blob|tree)\/main\/([^)#]+)\)/g)) {
				assert.ok(fs.existsSync(path.join(ROOT, rel)), `${file} links to ${rel}, which does not exist`);
			}
		}
	});

	it("ships with each package", () => {
		for (const pkg of catalog.packages) {
			const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "packages", `webc-${pkg.id}`, "package.json"), "utf8"));
			assert.ok(manifest.files.includes("llms.txt"), `${manifest.name} does not publish llms.txt`);
		}
	});

	it("follows the writing rules: no em dashes, no attribution", () => {
		for (const [file, content] of files) {
			assert.ok(!content.includes("—"), `${file} has an em dash`);
			assert.ok(!/generated (with|by) |co-authored-by/i.test(content), `${file} has an attribution line`);
		}
	});

	it("turns a description's HTML into Markdown", () => {
		assert.equal(markdown("Pass <code>&lt;span slot=&quot;a&quot;&gt;</code> &amp; more <em>now</em>."), 'Pass `<span slot="a">` & more now.');
	});
});
