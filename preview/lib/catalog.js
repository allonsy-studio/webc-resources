/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { analyzeFile, derivedArgTypes, helperNames, kindOf } from "../../scripts/analyze-webc.js";
import { readTokens as readTokensFile } from "../../scripts/build-components.js";
import { matrixCells, PROPS, renderMatrix, renderStory, SLOTS } from "./render-story.js";

/** Components that live in the document head: they have no canvas, since every frame renders them. */
export const HEAD_COMPONENTS = new Set(["norn-head", "oss-head"]);

/** The kinds of component, in the order the preview shows them. A component's category is the first part of its CSF title, or the `@category` of its JSDoc until it has a CSF file. */
export const CATEGORIES = [
	{ id: "layout", title: "Layout", description: "Arranges other things: page frames." },
	{ id: "landmark", title: "Landmark", description: "A page region with a role and a name: header, navigation, footer." },
	{ id: "container", title: "Container", description: "A bounded surface that holds content: a card, a card grid, a section, a hero." },
	{ id: "component", title: "Component", description: "A self-contained element: a link, a code block, a lockup." },
	{ id: "template", title: "Template", description: "An Eleventy layout: a whole page, filled from props." },
	{ id: "document", title: "Document", description: "The head and the foundation styles, with no body markup." },
];

/** The OSS site package's own group, after the categories: its components are listed together, by name, whatever their category. */
const OSS_SITE = { id: "oss-site", title: "OSS site", description: "The OSS site theme: its bar, call to action, credit, and head, from one package." };

/** Package folder to the heading the preview shows, in the order shown. */
const PACKAGES = [
	["webc-patterns", "Patterns"],
	["webc-code-sample", "Code sample"],
	["webc-oss-site", "OSS site"],
];

/** The id of each package, as the preview's URLs and story folders name it. */
export const PACKAGE_IDS = PACKAGES.map(([folder]) => folder.replace(/^webc-/, ""));

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Escape text and turn `code` spans into elements: the only Markdown the docs use. */
export const inline = (text) => escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");

/** What a shared token looks like: the analyzer's reading of its path. */
export { kindOf };

/**
 * The shared tokens in tokens.json, by custom property, with their defaults.
 *
 * @returns {Map<string, { path: string, group: string, value: string, comment: string, kind: string }>}
 */
export function readTokens() {
	return new Map(readTokensFile().map(({ name, path: tokenPath, group, resolved, comment }) => [name, { path: tokenPath, group, value: resolved.replace(/\s+/g, " ").trim(), comment, kind: kindOf(tokenPath) }]));
}

/** Paragraphs separated by a blank line, each on one line. */
const paragraphsOf = (text) =>
	text
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
		.filter(Boolean);

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
 * @returns {{ description: string[], text: string[], category: string, props: object[], slots: object[], cssprops: { name: string, raw: string }[] }} The `cssprops` are read for the calibration only: the preview lists the tokens a component reads instead
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

	const paragraphs = paragraphsOf(description.join("\n"));

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

/** Start case, as Storybook names a story from its export: `LongText` is "Long Text". */
export const startCase = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (first) => first.toUpperCase());

/** Kebab case, for a story's URL: `LongText` is `long-text`. */
export const kebabCase = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/**
 * Read a CSF file: its meta and its stories, in the order they are exported.
 * A module namespace lists its exports by name, so the order comes from the source, as Storybook reads it.
 * The import carries the file's modification time, so a rebuild in the same process reads an edited file again.
 *
 * @param {string} file - A `<name>.stories.js`
 * @returns {Promise<{ meta: object, stories: { exportName: string, name?: string, args?: object, argTypes?: object, parameters?: object, tags?: string[] }[], order: string[], exports: string[] }>}
 */
export async function readCsf(file) {
	const text = fs.readFileSync(file, "utf8");
	const module = await import(`${pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs}`);
	const order = [...text.matchAll(/^export const (\w+)/gm)].map(([, name]) => name);
	return { meta: module.default, stories: order.map((exportName) => ({ exportName, ...module[exportName] })), order, exports: Object.keys(module).filter((key) => key !== "default") };
}

/** The argTypes of one category, in the order they are written. */
const argTypesIn = (argTypes, category) => Object.entries(argTypes ?? {}).filter(([, argType]) => argType.table?.category === category);

/**
 * What the props table shows for a prop: its description, then the options when it does not name each one, then its default.
 *
 * @param {{ description?: string, options?: unknown[], table?: { defaultValue?: { summary?: string } } }} argType
 */
function propText({ description = "", options, table }) {
	const parts = [description.trim()];
	if (Array.isArray(options) && !options.every((option) => description.includes(`\`${option}\``))) {
		const named = options.map((option) => `\`${option}\``);
		parts.push(`One of ${named.length > 1 ? `${named.slice(0, -1).join(", ")}, or ${named.at(-1)}` : named[0]}.`);
	}
	if (table?.defaultValue?.summary) parts.push(`Falls back to \`${table.defaultValue.summary}\`.`);
	return parts.filter(Boolean).join(" ");
}

/**
 * A component's docs from its CSF meta and its effective argTypes, in the shape `parseDoc` gives the JSDoc.
 * The category is the title's first part, lowercased, except where `parameters.webc.category` names it (the OSS site group).
 *
 * @param {{ title: string, argTypes?: object, parameters?: { docs?: { description?: { component?: string } }, webc?: { category?: string } } }} meta
 * @param {object} [argTypes] - The effective argTypes, the derived ones with the CSF file's over them
 */
export function csfDoc(meta, argTypes = meta.argTypes) {
	const paragraphs = paragraphsOf(meta.parameters?.docs?.description?.component ?? "");
	return {
		description: paragraphs.map(inline),
		text: paragraphs,
		category: meta.parameters?.webc?.category ?? meta.title.split("/")[0].toLowerCase(),
		props: argTypesIn(argTypes, PROPS).map(([name, argType]) => ({ name, type: argType.table?.type?.summary ?? argType.type?.name ?? "", optional: argType.type?.required !== true, description: inline(propText(argType)) })),
		slots: argTypesIn(argTypes, SLOTS).map(([name, argType]) => ({ name, description: inline(argType.description ?? "") })),
	};
}

/** A plain object, not an array. */
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** `over` deep-merged onto `base`: objects merge key by key, and any other value replaces. */
const deepMerge = (base, over) => (isRecord(base) && isRecord(over) ? Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(over)])].map((key) => [key, key in over ? deepMerge(base[key], over[key]) : structuredClone(base[key])])) : structuredClone(over));

/**
 * The argTypes the preview, the renderer, and the matrix read: the derived ones with the CSF file's deep-merged over them.
 * They follow the CSF file's order, then any derived argType it does not name.
 *
 * @param {Record<string, object>} derived - From `derivedArgTypes`
 * @param {Record<string, object>} [written] - The CSF meta's `argTypes`
 * @returns {Record<string, object>}
 */
export function effectiveArgTypes(derived, written = {}) {
	const names = [...new Set([...Object.keys(written), ...Object.keys(derived)])];
	return Object.fromEntries(names.map((name) => [name, name in derived ? (name in written ? deepMerge(derived[name], written[name]) : structuredClone(derived[name])) : structuredClone(written[name])]));
}

/**
 * A CSF file as plain page data, for the story pages of its component (`$data.csf`): the meta, the argTypes by category,
 * and the stories with their resolved args. A page reads the options, defaults, and slots from here instead of repeating them.
 *
 * @param {Awaited<ReturnType<typeof readCsf>>} csf
 * @param {object} argTypes - The effective argTypes
 */
export function csfData({ meta, stories }, argTypes) {
	const byCategory = (category) => Object.fromEntries(argTypesIn(argTypes, category).map(([name, argType]) => [name, structuredClone(argType)]));
	return {
		title: meta.title,
		component: meta.component,
		args: structuredClone(meta.args ?? {}),
		argTypes: { props: byCategory(PROPS), slots: byCategory(SLOTS) },
		stories: stories.map(({ exportName, name, args }) => ({ exportName, name: name ?? startCase(exportName), args: structuredClone({ ...meta.args, ...args }) })),
	};
}

/** The frame data a story may set in `parameters.webc`, as a story page sets it in its front matter. */
const FRAME_DATA = ["hiddenH2", "ownH1"];

/**
 * The stories a CSF file renders, each through the default renderer, then the matrix.
 * A story's args and argTypes are the meta's with its own over them, and its frame data is the meta's `parameters.webc` with its own over it.
 *
 * @param {Awaited<ReturnType<typeof readCsf>>} csf
 * @param {object} effective - The meta's effective argTypes
 * @param {{ packageId: string, name: string, layout: boolean, head: boolean }} component
 */
function csfStories({ meta, stories }, effective, { packageId, name, layout, head }) {
	const frameData = (...sources) => Object.fromEntries(FRAME_DATA.map((key) => [key, sources.reduce((value, parameters) => parameters?.webc?.[key] ?? value, false)]));
	const rendered = stories.map((story) => {
		const slug = kebabCase(story.exportName);
		const argTypes = { ...effective, ...story.argTypes };
		return {
			slug,
			title: story.name ?? startCase(story.exportName),
			language: "html",
			source: renderStory(meta.component, { ...meta.args, ...story.args }, argTypes),
			frameUrl: `/frames/${packageId}/${name}/${slug}/`,
			frame: frameData(meta.parameters, story.parameters),
		};
	});
	if (layout || head) return { stories: rendered, matrix: undefined };
	const cells = matrixCells({ ...meta, argTypes: effective }, stories.find(({ exportName }) => exportName === "Default"));
	const matrix = cells.length ? { slug: "matrix", title: "Matrix", language: "html", source: renderMatrix(meta.component, cells, effective), frameUrl: `/frames/${packageId}/${name}/matrix/`, frame: frameData(meta.parameters), matrix: true } : undefined;
	return { stories: rendered, matrix };
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
 * The story pages for one component or layout: the files in `stories/<package>/<name>/`.
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
 * A component's CSF file: `src/<name>.stories.js` beside its source, or `src/layouts/<name>.stories.js` for a layout.
 *
 * @param {string} packageDir
 * @param {string} name
 * @param {boolean} layout
 */
export const csfFile = (packageDir, name, layout) => path.join(packageDir, "src", ...(layout ? ["layouts"] : []), `${name}.stories.js`);

/**
 * A component's source in `src/`, which the analyzer reads: the compiled copy has its tokens filled in.
 *
 * @param {string} packageDir
 * @param {string} name
 * @param {boolean} layout
 */
export const sourceFile = (packageDir, name, layout) => path.join(packageDir, "src", ...(layout ? ["layouts"] : []), `${name}.webc`);

/**
 * The tokens table of a component: each global token it reads, with its type and default from tokens.json.
 *
 * @param {ReturnType<typeof analyzeFile>} analysis
 * @param {Map<string, { comment: string }>} tokens
 */
const tokensTable = (analysis, tokens) => analysis.tokens.map(({ name, type, value }) => ({ name, description: inline(tokens.get(name)?.comment ?? ""), type, value }));

/**
 * Every package, with its components and layouts documented from their CSF files and joined to their stories.
 * The props, slots, and tokens are derived from each source by the analyzer, and the CSF file adds the rest.
 * A component with no CSF file yet is documented from its JSDoc, with its tokens derived.
 * `frames` lists every frame a CSF file renders, which the preview builds as virtual templates.
 *
 * @param {{ packagesDir: string, storiesDir: string }} options
 */
export async function buildCatalog({ packagesDir, storiesDir }) {
	const tokens = readTokens();
	const analyzer = { tokens: readTokensFile(), helpers: helperNames() };
	const packages = await Promise.all(PACKAGES.map(async ([folder, title]) => {
		const id = folder.replace(/^webc-/, "");
		const pkg = JSON.parse(fs.readFileSync(path.join(packagesDir, folder, "package.json"), "utf8"));
		const found = FOLDERS.flatMap(({ folder: kind, layout }) => {
			const dir = path.join(packagesDir, folder, kind);
			if (!fs.existsSync(dir)) return [];
			return fs
				.readdirSync(dir)
				.filter((file) => file.endsWith(".webc"))
				.sort()
				.map((file) => ({ file: path.join(dir, file), name: file.slice(0, -".webc".length), layout }));
		});
		const components = await Promise.all(found.map(async ({ file, name, layout }) => {
			const head = HEAD_COMPONENTS.has(name);
			const stories = csfFile(path.join(packagesDir, folder), name, layout);
			const csf = fs.existsSync(stories) ? await readCsf(stories) : undefined;
			const analysis = analyzeFile(sourceFile(path.join(packagesDir, folder), name, layout), analyzer);
			const argTypes = csf ? effectiveArgTypes(derivedArgTypes(analysis), csf.meta.argTypes) : undefined;
			const doc = csf ? csfDoc(csf.meta, argTypes) : parseDoc(fs.readFileSync(file, "utf8"));
			const own = csf ? csfStories(csf, argTypes, { packageId: id, name, layout, head }) : { stories: [], matrix: undefined };
			const pages = readStories(storiesDir, id, name);
			const all = [...own.stories, ...pages, ...(own.matrix ? [own.matrix] : [])];
			const clash = all.find((story, index) => all.findIndex(({ slug }) => slug === story.slug) !== index);
			if (clash) throw new Error(`${id}/${name}: two stories share the URL ${clash.frameUrl}. Rename the story page or the CSF export.`);
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
				head,
				csf: csf ? stories : undefined,
				argTypes,
				csfData: csf ? csfData(csf, argTypes) : undefined,
				summary: doc.description[0]?.split(/(?<=\.)\s/)[0] ?? "",
				summaryText: (doc.text[0]?.split(/(?<=\.)\s/)[0] ?? "").replaceAll("`", ""),
				description: doc.description,
				props: doc.props,
				slots: doc.slots,
				tokens: tokensTable(analysis, tokens),
				stories: all,
			};
		}));
		return { id, title, name: pkg.name, version: pkg.version, description: pkg.description, components };
	}));
	const components = packages.flatMap((pkg) => pkg.components);
	const byName = (a, b) => a.name.localeCompare(b.name);
	const own = components.filter((component) => component.packageId !== OSS_SITE.id);
	const categories = [
		...CATEGORIES.map((category) => ({ ...category, components: own.filter((component) => component.category === category.id).sort(byName) })),
		{ ...OSS_SITE, components: components.filter((component) => component.packageId === OSS_SITE.id).sort(byName) },
	];
	const frames = components.flatMap((component) => component.stories.filter((story) => story.frame).map((story) => ({ packageId: component.packageId, url: story.frameUrl, title: story.title, source: story.source, ...story.frame })));
	return { packages, categories, components, frames };
}
