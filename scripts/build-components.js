/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Compile each package's sources into the folders it ships: `src/*.webc` into `components/`, `src/layouts/*.webc` into `layouts/`,
// and `src/css/*.css` into `css/`.
// A source writes a shared token as `var(--norn-space-m, t('space.m'))`. The build fills each `t()` from the root `tokens.json`,
// so a component renders with no stylesheet beside it, and a project's own `tokens.css` still wins through the custom property.
// Run `node scripts/build-components.js` for every package, or name package folders: `node scripts/build-components.js webc-patterns`.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import designTokens from "@csstools/postcss-design-tokens";
import postcss from "postcss";
import postcssHtml from "postcss-html";

/** The repository root. */
export const ROOT = path.resolve(import.meta.dirname, "..");

/** The folder that holds the packages. */
export const PACKAGES = path.join(ROOT, "packages");

/** The design tokens source of truth. It is not published. */
export const TOKENS_FILE = path.join(ROOT, "tokens.json");

/** Prefix of every shared custom property. */
const PREFIX = "--norn-";

/** A `{path.to.token}` reference inside a token's value. */
const REFERENCE = /\{([\w.-]+)\}/g;

/**
 * @typedef {object} Token
 * @property {string} path - Dotted path, such as `ui.border.color`
 * @property {string} name - Custom property, such as `--norn-ui-border-color`
 * @property {string} value - The default, as written in tokens.json
 * @property {string} resolved - The default with every `{path}` reference replaced
 * @property {string} comment - What the token is for
 * @property {string} group - First segment of the path
 */

/**
 * The custom property a token path names: `--norn-` and the path joined with hyphens.
 *
 * @param {string} tokenPath - Dotted path, such as `ui.border.color`
 * @returns {string}
 */
export const propertyName = (tokenPath) => PREFIX + tokenPath.split(".").join("-");

/**
 * Walk a Style Dictionary 3 tree. A leaf has a `value`; a group never does.
 *
 * @param {object} node
 * @param {string[]} [trail]
 * @returns {{ path: string, value: string, comment: string }[]}
 */
function leaves(node, trail = []) {
	return Object.entries(node).flatMap(([key, child]) => {
		if (!child || typeof child !== "object") throw new Error(`tokens.json: ${[...trail, key].join(".")} must be a token or a group.`);
		if ("value" in child) {
			if (typeof child.value !== "string") throw new Error(`tokens.json: ${[...trail, key].join(".")} must have a string value.`);
			return [{ path: [...trail, key].join("."), value: child.value, comment: String(child.comment ?? "") }];
		}
		return leaves(child, [...trail, key]);
	});
}

/**
 * Read tokens.json: every token with its default, resolved of `{path}` references (dotted paths, nested lookups).
 *
 * @param {string} [file] - The tokens file
 * @returns {Token[]}
 * @throws {Error} When a reference names no token or loops
 */
export function readTokens(file = TOKENS_FILE) {
	const flat = leaves(JSON.parse(fs.readFileSync(file, "utf8")));
	const byPath = new Map(flat.map((token) => [token.path, token]));
	/** @param {string} tokenPath @param {string[]} seen */
	const resolve = (tokenPath, seen) => {
		const token = byPath.get(tokenPath);
		if (!token) throw new Error(`tokens.json: {${tokenPath}} names no token.`);
		if (seen.includes(tokenPath)) throw new Error(`tokens.json: ${[...seen, tokenPath].join(" -> ")} loops.`);
		return token.value.replace(REFERENCE, (_, next) => resolve(next, [...seen, tokenPath]));
	};
	return flat.map((token) => ({ ...token, name: propertyName(token.path), resolved: resolve(token.path, []), group: token.path.split(".")[0] }));
}

/**
 * Write the resolved tokens as a Style Dictionary 3 file the PostCSS plugin reads.
 *
 * @param {Token[]} tokens
 * @param {string} file
 */
function writeResolved(tokens, file) {
	const tree = {};
	for (const token of tokens) {
		const keys = token.path.split(".");
		const leaf = keys.pop();
		const parent = keys.reduce((node, key) => (node[key] ??= {}), tree);
		parent[leaf] = { value: token.resolved, comment: token.comment };
	}
	fs.writeFileSync(file, JSON.stringify(tree, null, "\t"));
}

/** A server-only comment: `<!--- … --->`. WebC drops it from the output, and it holds the file's license header and JSDoc. */
const SERVER_COMMENT = /<!---[\s\S]*?--->/g;

/**
 * Hide the server-only comments from the style handling below: a `<style>` mentioned in one is text, not a block to compile.
 *
 * @param {string} text - The component source
 * @returns {{ masked: string, restore: (compiled: string) => string }} The text with each comment swapped for a marker, and a function that swaps them back
 */
function maskComments(text) {
	const comments = [];
	const masked = text.replace(SERVER_COMMENT, (comment) => `<!--- norn-comment ${comments.push(comment) - 1} --->`);
	return { masked, restore: (compiled) => compiled.replace(/<!--- norn-comment (\d+) --->/g, (_, index) => comments[index]) };
}

/** The `<style>` blocks of a component: the opening tag and the CSS after it. */
const STYLE_OPEN = /<style\b[^>]*>/g;

/** The CSS of every `<style>` block in a file. */
const styleBlocks = (text) => [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]);

/**
 * Give each `<style>` block of the output the leading whitespace its source had: the plugin drops the break after the `@tokens` rule it removes.
 *
 * @param {string} source - The component source
 * @param {string} output - The compiled text
 * @returns {string}
 */
function restoreIndent(source, output) {
	const leading = styleBlocks(source).map((block) => block.match(/^\s*/)[0]);
	let index = 0;
	return output.replace(/(<style\b[^>]*>)\s*/g, (_, open) => open + (leading[index++] ?? ""));
}

/** The source folders of a package and the folders they compile into, with the file type each holds. */
const TARGETS = [
	{ from: "src", to: "components", extension: ".webc" },
	{ from: "src/layouts", to: "layouts", extension: ".webc" },
	{ from: "src/css", to: "css", extension: ".css" },
];

/**
 * Compile one source file: fill each `t()` in its CSS from the resolved tokens.
 * The server-only comment at the top (`<!--- … --->`) is kept as written: the tooling that reads a component's docs reads it from the compiled file, and WebC drops it at render.
 *
 * @param {string} from - Absolute path of the source
 * @param {string} imported - The `@tokens` rule that loads the resolved tokens
 * @param {import("postcss").Processor} processor
 * @returns {Promise<string>} The compiled text
 * @throws {Error} On a PostCSS warning (an unknown token path) or a `t()` left in the output
 */
async function compile(from, imported, processor) {
	const text = fs.readFileSync(from, "utf8");
	if (from.endsWith(".css")) {
		const result = await processor.process(`${imported}\n${text}`, { from });
		const warnings = result.warnings().map((warning) => `${path.relative(ROOT, from)}: ${warning.text}`);
		if (warnings.length) throw new Error(warnings.join("\n"));
		const css = result.css.replace(/^\s*/, "");
		if (/(^|[^\w-])t\(/.test(css)) throw new Error(`${path.relative(ROOT, from)}: a t() is left in the output.`);
		return css;
	}
	const { masked, restore } = maskComments(text);
	if (!styleBlocks(masked).length) return text;
	const result = await processor.process(masked.replace(STYLE_OPEN, (open) => `${open}${imported}`), { from, syntax: postcssHtml });
	const warnings = result.warnings().map((warning) => `${path.relative(ROOT, from)}: ${warning.text}`);
	if (warnings.length) throw new Error(warnings.join("\n"));
	const css = restoreIndent(masked, result.css);
	if (styleBlocks(css).some((block) => /(^|[^\w-])t\(/.test(block))) throw new Error(`${path.relative(ROOT, from)}: a t() is left in the output.`);
	return restore(css);
}

/**
 * Compile one package's sources.
 *
 * @param {string} packageDir - Absolute path of a package folder
 * @param {string} resolvedFile - The resolved tokens file
 * @param {import("postcss").Processor} processor
 * @returns {Promise<string[]>} The compiled components, by file name
 * @throws {Error} On a PostCSS warning (an unknown token path) or a `t()` left in the output
 */
async function buildPackage(packageDir, resolvedFile, processor) {
	if (!fs.existsSync(path.join(packageDir, "src"))) return [];
	const imported = `@tokens url('${resolvedFile.split(path.sep).join("/")}') format('style-dictionary3');`;
	const built = {};
	for (const { from, to, extension } of TARGETS) {
		const source = path.join(packageDir, from);
		const output = path.join(packageDir, to);
		if (!fs.existsSync(source)) {
			if (to !== "components") fs.rmSync(output, { recursive: true, force: true });
			continue;
		}
		fs.mkdirSync(output, { recursive: true });
		const written = [];
		for (const file of fs.readdirSync(source, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(extension)).map((entry) => entry.name).sort()) {
			const css = await compile(path.join(source, file), imported, processor);
			const target = path.join(output, file);
			// Leave an unchanged file alone, so a watcher that follows the compiled files sees no change.
			if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== css) fs.writeFileSync(target, css);
			written.push(file);
		}
		for (const stale of fs.readdirSync(output).filter((name) => !written.includes(name))) fs.rmSync(path.join(output, stale), { recursive: true, force: true });
		built[to] = written;
	}
	return built.components ?? [];
}

/**
 * Compile each package's `src/` into `components/`, `layouts/`, and `css/`.
 *
 * @param {object} [options]
 * @param {string[]} [options.packages] - Package folder names; every package with a `src` by default
 * @returns {Promise<Record<string, string[]>>} Package folder to the compiled file names
 */
export async function buildComponents({ packages } = {}) {
	const tokens = readTokens();
	const folders = packages ?? fs.readdirSync(PACKAGES).filter((name) => fs.existsSync(path.join(PACKAGES, name, "src")));
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), "norn-tokens-"));
	try {
		const resolvedFile = path.join(temp, "tokens.json");
		writeResolved(tokens, resolvedFile);
		const processor = postcss([designTokens({ valueFunctionName: "t", importAtRuleName: "tokens" })]);
		const built = {};
		for (const folder of folders) built[folder] = await buildPackage(path.join(PACKAGES, folder), resolvedFile, processor);
		return built;
	} finally {
		fs.rmSync(temp, { recursive: true, force: true });
	}
}

/**
 * Whether node was started on this file. `import.meta.url` is the real path, so the script's path is resolved the same way:
 * a path through a symlink, such as a symlinked workspace, would otherwise match nothing and the build would silently do nothing.
 */
function isMain() {
	try {
		return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
	} catch {
		return false;
	}
}

if (isMain()) {
	try {
		const built = await buildComponents({ packages: process.argv.length > 2 ? process.argv.slice(2) : undefined });
		for (const [folder, files] of Object.entries(built)) console.log(`${folder}: ${files.length} components`);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
