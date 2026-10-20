/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

import { readTokens as readTokensFile } from "../../scripts/build-components.js";

/** Components that live in the document head: they have no canvas, since every frame renders them. */
export const HEAD_COMPONENTS = new Set(["norn-head", "oss-head"]);

/** The kinds of component, in the order the preview shows them. Each component names its own in its JSDoc with `@category`. */
export const CATEGORIES = [
	{ id: "layout", title: "Layout", description: "Arranges other things: page frames." },
	{ id: "landmark", title: "Landmark", description: "A page region with a role and a name: header, navigation, footer." },
	{ id: "container", title: "Container", description: "A bounded surface that holds content: a card, a card grid, a section, a hero." },
	{ id: "component", title: "Component", description: "A self-contained element: a link, a code block, a lockup." },
	{ id: "template", title: "Template", description: "An Eleventy layout: a whole page, filled from props." },
	{ id: "document", title: "Document", description: "The head and the foundation styles, with no body markup." },
];

/** Package folder to the heading the preview shows, in the order shown. */
const PACKAGES = [
	["webc-patterns", "Patterns"],
	["webc-code-sample", "Code sample"],
	["webc-oss-site", "OSS site"],
];

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Escape text and turn `code` spans into elements: the only Markdown the JSDoc uses. */
export const inline = (text) => escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");

/** What a shared token looks like, so a page can show a swatch or a sample, and a custom property that falls back to it has a type. */
export const kindOf = (tokenPath) => {
	if (tokenPath.startsWith("space.")) return "space";
	if (tokenPath.startsWith("font.")) return "font";
	if (tokenPath === "ui.border.radius") return "radius";
	if (tokenPath === "ui.shadow") return "shadow";
	if (tokenPath === "text.measure") return "measure";
	return "color";
};

/** The CSS type each kind of shared token has. */
const KIND_TYPES = { color: "<color>", space: "<length>", radius: "<length>", measure: "<length>", font: "<font-family>", shadow: "<shadow>" };

/**
 * The shared tokens in tokens.json, by custom property, with their defaults.
 *
 * @returns {Map<string, { path: string, group: string, value: string, comment: string, kind: string }>}
 */
export function readTokens() {
	return new Map(readTokensFile().map(({ name, path: tokenPath, group, resolved, comment }) => [name, { path: tokenPath, group, value: resolved.replace(/\s+/g, " ").trim(), comment, kind: kindOf(tokenPath) }]));
}

/**
 * Split a custom property's note into what it is and what it falls back to, and work out its type and default.
 * The type comes from the shared token it falls back to, or from a literal such as `17rem`. Where neither tells, it is left empty.
 *
 * @param {string} text - The raw note, such as "Border color. Falls back to --norn-ui-border-color."
 * @param {Map<string, { value: string, kind: string }>} tokens
 */
function describeProp(text, tokens) {
	const [summary, rest] = text.split(/\s*Falls back to\s+/);
	const fallback = rest?.replace(/\.$/, "") ?? "";
	const known = [...fallback.matchAll(/--norn-[a-z0-9-]+/g)].map(([name]) => name).find((name) => tokens.has(name));
	let type = known ? (KIND_TYPES[tokens.get(known).kind] ?? "") : "";
	if (!type && /\d(rem|em|px)\b/.test(fallback)) type = "<length>";
	if (!type && /#[0-9a-f]{3,8}\b|Text\b|Canvas|Allons-y Studio (magenta|orange|yellow|teal)/i.test(fallback)) type = "<color>";
	const single = /^--norn-[a-z0-9-]+$/.test(fallback) && tokens.has(fallback);
	return { description: inline(summary.trim()), fallback, fallbackValue: single ? tokens.get(fallback).value : "", type };
}

/**
 * Take a `{type}` off the front of a string, balancing the braces.
 *
 * @param {string} text
 * @returns {[string, string]} The type, and the rest
 */
function takeType(text) {
	if (!text.startsWith("{")) return ["", text];
	let depth = 0;
	for (let index = 0; index < text.length; index++) {
		if (text[index] === "{") depth++;
		if (text[index] === "}" && --depth === 0) return [text.slice(1, index), text.slice(index + 1).trim()];
	}
	return ["", text];
}

/**
 * Read a component's JSDoc, the block inside the `<!--- … --->` server-only comment at the top of its file.
 *
 * @param {string} source - The `.webc` file
 * @returns {{ description: string[], text: string[], category: string, props: object[], slots: object[], cssprops: { name: string, raw: string }[] }}
 */
export function parseDoc(source) {
	const comment = source.match(/<!---([\s\S]*?)--->/)?.[1] ?? "";
	const block = comment.match(/\/\*\*([\s\S]*?)\*\//)?.[1] ?? "";
	const lines = block.split("\n").map((line) => line.replace(/^\s*\* ?/, "").trimEnd());

	const description = [];
	const tags = [];
	for (const line of lines) {
		if (line.startsWith("@")) tags.push(line);
		else if (tags.length) tags[tags.length - 1] += ` ${line.trim()}`;
		else description.push(line);
	}

	const paragraphs = description
		.join("\n")
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
		.filter(Boolean);

	const props = [];
	const slots = [];
	const cssprops = [];
	let category = "";
	for (const tag of tags) {
		const [, kind, rest] = tag.match(/^@(\w+)\s+([\s\S]*)$/) ?? [];
		if (kind === "prop") {
			const [type, after] = takeType(rest);
			const match = after.match(/^(\[?)([\w-]+)\]?(?:\s+-\s+([\s\S]*))?$/);
			if (match) props.push({ name: match[2], type, optional: match[1] === "[", description: inline((match[3] ?? "").trim()) });
		} else if (kind === "category") {
			category = rest.trim();
		} else if (kind === "slot") {
			// An unnamed slot is the default one: `@slot - The body.`
			const [, name = "default", text = ""] = rest.match(/^([\w-]+)?(?:\s*-\s+([\s\S]*))?$/) ?? [];
			slots.push({ name, description: inline(text.trim()) });
		} else if (kind === "cssprop") {
			const [, name, text = ""] = rest.match(/^(--[\w-]+)(?:\s+-\s+([\s\S]*))?$/) ?? [];
			if (name) cssprops.push({ name, raw: text.trim() });
		}
	}
	return { description: paragraphs.map(inline), text: paragraphs, category, props, slots, cssprops };
}

/** The `key: value` lines of a story's front matter, and the markup after it. */
export function splitStory(text) {
	const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
	const data = {};
	for (const line of (match?.[1] ?? "").split("\n")) {
		const [, key, value] = line.match(/^([\w-]+):\s*(.*)$/) ?? [];
		if (key) data[key] = value.replace(/^["']|["']$/g, "");
	}
	return { data, body: text.slice(match?.[0].length ?? 0).trim() };
}

/**
 * The stories for one component or layout: the files in `stories/<package>/<name>/`.
 * A layout's story is a page on that layout, so its whole file is the source: the front matter names the layout.
 *
 * @param {string} storiesDir
 * @param {string} packageId
 * @param {string} name
 */
function readStories(storiesDir, packageId, name) {
	const dir = path.join(storiesDir, packageId, name);
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((file) => /\.(webc|md)$/.test(file))
		.map((file) => {
			const slug = file.replace(/\.(webc|md)$/, "");
			const text = fs.readFileSync(path.join(dir, file), "utf8");
			const { data, body } = splitStory(text);
			return {
				slug,
				title: data.title ?? slug,
				order: Number(data.order ?? 0),
				language: file.endsWith(".md") ? "markdown" : "html",
				source: data.layout ? text.trim() : body,
				frameUrl: `/frames/${packageId}/${name}/${slug}/`,
			};
		})
		.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

/** The folders a package ships pages from: its components, and the patterns package's layouts. */
const FOLDERS = [
	{ folder: "components", layout: false },
	{ folder: "layouts", layout: true },
];

/**
 * Every package, with its components and layouts parsed from their JSDoc and joined to their stories.
 *
 * @param {{ packagesDir: string, storiesDir: string }} options
 */
export function buildCatalog({ packagesDir, storiesDir }) {
	const tokens = readTokens();
	const packages = PACKAGES.map(([folder, title]) => {
		const id = folder.replace(/^webc-/, "");
		const pkg = JSON.parse(fs.readFileSync(path.join(packagesDir, folder, "package.json"), "utf8"));
		const components = FOLDERS.flatMap(({ folder: kind, layout }) => {
			const dir = path.join(packagesDir, folder, kind);
			if (!fs.existsSync(dir)) return [];
			return fs
				.readdirSync(dir)
				.filter((file) => file.endsWith(".webc"))
				.sort()
				.map((file) => ({ file: path.join(dir, file), name: file.slice(0, -".webc".length), layout }));
		}).map(({ file, name, layout }) => {
			const doc = parseDoc(fs.readFileSync(file, "utf8"));
			return {
				name,
				layout,
				file,
				tag: layout ? `layout: ${name}.webc` : `<${name}>`,
				slug: `${id}/${name}`,
				url: `/components/${id}/${name}/`,
				packageId: id,
				packageName: pkg.name,
				category: doc.category,
				head: HEAD_COMPONENTS.has(name),
				summary: doc.description[0]?.split(/(?<=\.)\s/)[0] ?? "",
				summaryText: (doc.text[0]?.split(/(?<=\.)\s/)[0] ?? "").replaceAll("`", ""),
				description: doc.description,
				props: doc.props,
				slots: doc.slots,
				cssprops: doc.cssprops.map(({ name, raw }) => ({ name, ...describeProp(raw, tokens) })),
				stories: readStories(storiesDir, id, name),
			};
		});
		return { id, title, name: pkg.name, version: pkg.version, description: pkg.description, components };
	});
	const components = packages.flatMap((pkg) => pkg.components);
	const categories = CATEGORIES.map((category) => ({ ...category, components: components.filter((component) => component.category === category.id).sort((a, b) => a.name.localeCompare(b.name)) }));
	return { packages, categories, components };
}
