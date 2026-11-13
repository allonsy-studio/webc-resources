/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Writes the files that tell an AI agent how to use the packages: `llms.txt` in the repository root
// and in each package. Each package file is a hand-written guide (scripts/llms/*.md) followed by a
// reference generated from the component sources and CSF files, so it cannot drift from the code.
//
//   node scripts/build-llms.js [--check]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCatalog, CATEGORIES } from "../preview/lib/catalog.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUIDES = path.join(ROOT, "scripts", "llms");
const BLOB = "https://github.com/allonsy-studio/webc-resources/blob/main";

/** Package folder to its guide file. */
const PACKAGES = { "webc-patterns": "patterns.md", "webc-code-sample": "code-sample.md", "webc-oss-site": "oss-site.md" };

/**
 * Turns the HTML a component description carries into Markdown.
 *
 * @param {string} html
 * @returns {string}
 */
export const markdown = (html) =>
	html
		.replace(/<code>([\s\S]*?)<\/code>/g, "`$1`")
		.replace(/<[^>]+>/g, "")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&amp;", "&");

/**
 * @param {string} name
 * @param {Record<string, any>} argType
 * @returns {string} one prop as a Markdown list item
 */
function propLine(name, argType) {
	const facts = [argType.table?.type?.summary ?? "string"];
	facts.push(argType.type?.required ? "required" : "optional");
	if (argType.table?.defaultValue) facts.push(`default \`${argType.table.defaultValue.summary}\``);
	if (argType.options) facts.push(`one of ${argType.options.map((option) => `\`${option}\``).join(", ")}`);
	const note = argType.description ? `: ${argType.description}` : "";
	return `- \`${name}\` (${facts.join(", ")})${note}`;
}

/**
 * @param {Record<string, any>} component a catalog entry
 * @returns {string} the component's section of the reference
 */
function section(component) {
	const lines = [`#### ${component.name}`, ""];
	const usage = component.layout ? `Layout: front matter \`${component.tag}\`.` : `Tag: \`${component.tag}\`.`;
	lines.push(usage, "");
	for (const paragraph of component.description) lines.push(markdown(paragraph), "");
	const entries = Object.entries(component.argTypes);
	const props = entries.filter(([, argType]) => argType.table?.category === "props");
	const slots = entries.filter(([, argType]) => argType.table?.category === "slots");
	if (props.length) lines.push("Props:", "", ...props.map(([name, argType]) => propLine(name, argType)), "");
	if (slots.length) {
		lines.push("Slots:", "");
		for (const [name, argType] of slots) lines.push(`- \`${name}\`${argType.description ? `: ${argType.description}` : ""}`);
		lines.push("");
	}
	if (component.tokens.length) lines.push(`Global tokens it reads: ${component.tokens.map((token) => `\`${token.name}\``).join(", ")}.`, "");
	return lines.join("\n");
}

/**
 * @param {{ components: Record<string, any>[] }} pkg a catalog package
 * @returns {string} the generated reference for one package
 */
function reference(pkg) {
	const order = CATEGORIES.map(({ id }) => id);
	const sorted = [...pkg.components].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name));
	const lines = ["## Reference", "", "Generated from the component sources and their CSF files. Do not edit by hand: run `yarn llms`.", ""];
	let current;
	for (const component of sorted) {
		const category = CATEGORIES.find(({ id }) => id === component.category);
		if (category && category.id !== current) {
			current = category.id;
			lines.push(`### ${category.title} components`, "", category.description, "");
		}
		lines.push(section(component));
	}
	return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/**
 * @returns {Promise<Map<string, string>>} each generated file's repository-relative path and content
 */
export async function buildLlms() {
	const catalog = await buildCatalog({ packagesDir: path.join(ROOT, "packages"), storiesDir: path.join(ROOT, "preview", "content", "stories") });
	const files = new Map();
	for (const [folder, guide] of Object.entries(PACKAGES)) {
		const pkg = catalog.packages.find(({ id }) => id === folder.replace(/^webc-/, ""));
		const text = fs.readFileSync(path.join(GUIDES, guide), "utf8").trimEnd();
		files.set(`packages/${folder}/llms.txt`, `${text}\n\n${reference(pkg)}`);
	}
	const index = fs.readFileSync(path.join(GUIDES, "index.md"), "utf8").trimEnd();
	const links = catalog.packages.map((pkg) => {
		const summary = pkg.description.replace(/\s+/g, " ");
		return `- [${pkg.name}](${BLOB}/packages/webc-${pkg.id}/llms.txt): ${summary}`;
	});
	const more = [
		"## Docs",
		"",
		...links,
		`- [README](${BLOB}/README.md): the project overview.`,
		`- [AGENTS.md](${BLOB}/AGENTS.md): conventions for changing this repository.`,
		"- [Component preview](https://allonsy-studio.github.io/webc-resources/): every component with its stories and tokens.",
	];
	files.set("llms.txt", `${index}\n\n${more.join("\n")}\n`);
	return files;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const check = process.argv.includes("--check");
	let stale = 0;
	for (const [file, content] of await buildLlms()) {
		const dest = path.join(ROOT, file);
		const current = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : undefined;
		if (current === content) continue;
		if (check) {
			stale++;
			console.error(`${file} is out of date`);
		} else {
			fs.writeFileSync(dest, content);
			console.log(`wrote ${file}`);
		}
	}
	if (stale) {
		console.error("Run `yarn llms` and commit the result.");
		process.exit(1);
	}
}
