/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import path from "node:path";

import bash from "@shikijs/langs/shellscript";
import css from "@shikijs/langs/css";
import diff from "@shikijs/langs/diff";
import html from "@shikijs/langs/html";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import markdown from "@shikijs/langs/markdown";
import typescript from "@shikijs/langs/typescript";
import yaml from "@shikijs/langs/yaml";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/** Shiki needs a theme to tokenize. The colors come from the page's CSS, so this one has none. */
const THEME = { name: "norn", type: "light", fg: "#000", bg: "#fff", settings: [] };

const highlighter = createHighlighterCoreSync({
	themes: [THEME],
	langs: [bash, css, diff, html, javascript, json, markdown, typescript, yaml],
	engine: createJavaScriptRegexEngine(),
});

/**
 * Ranges by language and code, for the life of the process. The code is the key, so a watch-mode rebuild with changed code tokenizes again.
 * Holds at most `CACHE_LIMIT` samples and drops the oldest first.
 */
const cache = new Map();
const CACHE_LIMIT = 1000;

/**
 * Add languages beyond the defaults.
 *
 * @param {...import("shiki/core").LanguageRegistration[]} languages - Shiki language registrations, such as the default export of `@shikijs/langs/rust`
 */
export function loadLanguages(...languages) {
	highlighter.loadLanguageSync(languages.flat());
	cache.clear();
}

/** Absolute glob-safe path to `components/norn-code-block.webc`, for the project's WebC `components` list. */
export const codeBlock = path.join(import.meta.dirname, "components", "norn-code-block.webc").split(path.sep).join("/");

/** Highlight group by TextMate scope prefix, most specific first. The deepest scope of a token that matches a prefix decides. */
const SCOPES = [
	["comment", "comment"],
	["punctuation.definition.comment", "comment"],
	["punctuation.definition.string", "string"],
	["string.unquoted", undefined],
	["string", "string"],
	["markup.inserted", "string"],
	["constant.character.escape.line-continuation", "punctuation"],
	["constant.numeric", "number"],
	["constant.language", "number"],
	["keyword.operator", "punctuation"],
	["keyword", "keyword"],
	["storage", "keyword"],
	["entity.name.tag", "keyword"],
	["markup.heading", "keyword"],
	["entity.name.function", "function"],
	["entity.name.command", "function"],
	["entity.name.type", "function"],
	["entity.name.class", "function"],
	["entity.other.attribute-name", "function"],
	["entity.other.inherited-class", "function"],
	["support.function", "function"],
	["support.class", "function"],
	["support.type.property-name", "function"],
	["meta.object-literal.key", "function"],
	["punctuation", "punctuation"],
];

/** The highlight group of a stack of scopes, from the outermost to the deepest. A prefix with no group, such as an unquoted word, stops the search: it stays plain. */
const groupOf = (scopes) => {
	for (const { scopeName } of scopes.toReversed()) {
		const match = SCOPES.find(([prefix]) => scopeName === prefix || scopeName.startsWith(`${prefix}.`));
		if (match) return match[1];
	}
	return undefined;
};

/** Languages that read as shell commands, and the ones whose lines are commands only after a `$ ` prompt. */
const SHELL = new Set(["sh", "bash", "shell"]);
const SESSION = new Set(["shell-session", "sh-session", "shellsession"]);

/** Words that start a command list again: after one, the next word is a command. */
const CONTROL = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "time"]);

/** Words made only of operator characters: a pipe or a list separator starts a command, a redirect does not. */
const OPERATOR = /^[<>|&;()0-9]*[<>|&;()]+$/;
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const SEPARATOR = /^(\|\|?|&&|&|;|\(|\|&)$/;

/** Whether a line ends with a lone backslash, so its command goes on in the next line. */
const continues = (line) => line.trimEnd().split(/\s+/).at(-1) === "\\";


/**
 * Tokenize code with Shiki into highlight ranges.
 *
 * @param {string} code
 * @param {string} [language]
 * @returns {string | undefined} JSON `[group, start, end][]` of character offsets; undefined when the language isn't loaded or nothing matched
 */
export function tokenRanges(code, language = "") {
	const key = `${language}\0${code}`;
	if (cache.has(key)) return cache.get(key);
	const ranges = tokenize(code, language);
	if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
	cache.set(key, ranges);
	return ranges;
}

/**
 * The uncached work of `tokenRanges`.
 *
 * @param {string} code
 * @param {string} language
 * @returns {string | undefined}
 */
function tokenize(code, language) {
	const session = SESSION.has(language);
	const lang = session ? "bash" : language;
	if (!lang || !highlighter.getLoadedLanguages().includes(lang)) return undefined;
	let ranges = [];
	const { tokens } = highlighter.codeToTokens(code, { lang, theme: THEME.name, includeExplanation: true });
	for (const lineTokens of tokens) {
		for (const token of lineTokens) {
			let at = token.offset;
			for (const { content, scopes } of token.explanation ?? []) {
				const group = groupOf(scopes);
				const end = at + content.length;
				if (group && content.trim()) {
					const previous = ranges.at(-1);
					if (previous?.[0] === group && previous[2] === at) previous[2] = end;
					else ranges.push([group, at, end]);
				}
				at = end;
			}
		}
	}
	if (SHELL.has(language) || session) ranges = shellWords(code, ranges, session);
	return ranges.length ? JSON.stringify(ranges) : undefined;
}

/**
 * Give the words of each shell line their roles over Shiki's ranges: the command is a `function`, the first plain word after it a `keyword` (the subcommand), a flag a `flag`, and any other word a `string`.
 * Comments, quoted strings, and variables keep what Shiki gave them. A `$ ` prompt stays punctuation.
 *
 * @param {string} code
 * @param {[string, number, number][]} ranges - Shiki's ranges, in order
 * @param {boolean} session - Only lines that start with a `$ ` prompt are commands
 * @returns {[string, number, number][]}
 */
function shellWords(code, ranges, session) {
	const roles = [];
	if (session) {
		// Output lines are plain: keep Shiki's ranges only on the lines of a command, which start with a prompt and go on while a line ends with a backslash.
		let at = 0;
		let running = false;
		const kept = new Set();
		for (const line of code.split("\n")) {
			const command = running || /^\s*\$\s/.test(line);
			if (command) kept.add(at);
			running = command && continues(line);
			at += line.length + 1;
		}
		const lineStart = (offset) => code.lastIndexOf("\n", offset - 1) + 1;
		ranges = ranges.filter(([, start]) => kept.has(lineStart(start)));
	}
	const within = (at, groups) => ranges.some(([group, start, end]) => groups.includes(group) && at >= start && at < end);
	let command = true;
	let sub = true;
	let dashes = false;
	let continued = false;
	let offset = 0;
	for (const line of code.split("\n")) {
		const words = [...line.matchAll(/\S+/g)];
		const prompted = /^\s*\$\s/.test(line);
		const continuing = continued;
		if (!continuing) {
			command = !session || prompted;
			sub = false;
			dashes = false;
		}
		continued = (!session || prompted || continuing) && continues(line);
		for (const [index, match] of words.entries()) {
			const [word] = match;
			const start = offset + match.index;
			const end = start + word.length;
			if (within(start, ["comment", "string"])) {
				if (within(start, ["comment"])) break;
				continue;
			}
			if (index === 0 && prompted && word === "$") {
				roles.push(["punctuation", start, end]);
				continue;
			}
			if (!command && session && !prompted && !continuing) continue;
			if (SEPARATOR.test(word)) {
				command = true;
				continue;
			}
			if (OPERATOR.test(word) || word === "\\") continue;
			if (command && ASSIGNMENT.test(word)) {
				const equals = word.indexOf("=");
				const value = word.slice(equals + 1);
				roles.push(["punctuation", start + equals, start + equals + 1]);
				if (value && !/^["']/.test(value)) roles.push([/^\d+$/.test(value) ? "number" : "string", start + equals + 1, end]);
				continue;
			}
			if (word.startsWith("$")) {
				if (!command) roles.push(["string", start, end]);
				continue;
			}
			if (command) {
				if (CONTROL.has(word)) {
					roles.push(["keyword", start, end]);
				} else {
					roles.push(["function", start, end]);
					command = false;
					sub = false;
					dashes = false;
				}
			} else if (word === "--") {
				dashes = true;
				roles.push(["punctuation", start, end]);
			} else if (word.startsWith("-") && word.length > 1) {
				const equals = word.indexOf("=");
				const stop = equals === -1 ? end : start + equals;
				roles.push(["flag", start, stop]);
				if (equals !== -1) roles.push(["punctuation", stop, stop + 1]);
				if (equals !== -1 && equals + 1 < word.length) roles.push(["string", start + equals + 1, end]);
			} else if (!sub && !dashes) {
				roles.push(["keyword", start, end]);
				sub = true;
			} else {
				roles.push(["string", start, end]);
			}
		}
		offset += line.length + 1;
	}
	// The roles replace whatever Shiki gave the same characters.
	const cut = ranges.flatMap(([group, start, end]) => {
		let pieces = [[start, end]];
		for (const [, from, to] of roles) pieces = pieces.flatMap(([a, b]) => (to <= a || from >= b ? [[a, b]] : [[a, Math.min(b, from)], [Math.max(a, to), b]].filter(([x, y]) => y > x)));
		return pieces.map(([a, b]) => [group, a, b]);
	});
	return [...cut, ...roles].sort((a, b) => a[1] - b[1]);
}
