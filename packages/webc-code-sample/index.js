/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import path from "node:path";

import Prism from "prismjs";
import loadLanguages from "prismjs/components/index.js";

loadLanguages(["bash", "css", "diff", "json", "markdown", "typescript", "yaml"]);

export { loadLanguages };

/** Absolute glob-safe path to `components/norn-code-block.webc`, for the project's WebC `components` list. */
export const codeBlock = path.join(import.meta.dirname, "components", "norn-code-block.webc").split(path.sep).join("/");

/** Highlight group by Prism token type. */
const GROUPS = {
	comment: ["comment", "prolog", "doctype", "cdata", "shebang"],
	string: ["string", "attr-value", "char", "inserted"],
	keyword: ["keyword", "atom", "important", "tag"],
	function: ["function", "class-name", "attr-name", "property", "selector"],
	number: ["number", "boolean", "constant", "symbol", "parameter"],
	punctuation: ["punctuation", "operator"],
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

const GROUP_OF = new Map(Object.entries(GROUPS).flatMap(([group, types]) => types.map((type) => [type, group])));

/**
 * Tokenize code with Prism into highlight ranges.
 *
 * @param {string} code
 * @param {string} [language]
 * @returns {string | undefined} JSON `[group, start, end][]` of character offsets; undefined when the language isn't loaded or nothing matched
 */
export function tokenRanges(code, language = "") {
	const session = SESSION.has(language);
	const grammar = Prism.languages[session ? "bash" : language];
	if (!grammar) return undefined;
	let ranges = [];
	const walk = (tokens, inherited, at) => {
		for (const token of tokens) {
			if (typeof token === "string") {
				if (inherited) ranges.push([inherited, at, at + token.length]);
				at += token.length;
				continue;
			}
			const types = [token.type, ...[].concat(token.alias ?? [])];
			const group = types.map((type) => GROUP_OF.get(type)).find(Boolean) ?? inherited;
			at = walk([].concat(token.content), group, at);
		}
		return at;
	};
	walk(Prism.tokenize(code, grammar), undefined, 0);
	if (SHELL.has(language) || session) ranges = shellWords(code, ranges, session);
	return ranges.length ? JSON.stringify(ranges) : undefined;
}

/**
 * Give the words of each shell line their roles over Prism's ranges: the command is a `function`, the first plain word after it a `keyword` (the subcommand), a flag a `flag`, and any other word a `string`.
 * Comments, quoted strings, and variables keep what Prism gave them. A `$ ` prompt stays punctuation.
 *
 * @param {string} code
 * @param {[string, number, number][]} ranges - Prism's ranges, in order
 * @param {boolean} session - Only lines that start with a `$ ` prompt are commands
 * @returns {[string, number, number][]}
 */
function shellWords(code, ranges, session) {
	const roles = [];
	if (session) {
		// Output lines are plain: keep Prism's ranges only on the lines that start with a prompt.
		let at = 0;
		const kept = new Set();
		for (const line of code.split("\n")) {
			if (/^\s*\$\s/.test(line)) kept.add(at);
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
		if (!continued) {
			command = !session || prompted;
			sub = false;
			dashes = false;
		}
		continued = words.at(-1)?.[0] === "\\";
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
			if (!command && session && !prompted && !continued) continue;
			if (SEPARATOR.test(word)) {
				command = true;
				continue;
			}
			if (OPERATOR.test(word) || word === "\\") continue;
			if (command && ASSIGNMENT.test(word)) continue;
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
	// The roles replace whatever Prism gave the same characters.
	const cut = ranges.flatMap(([group, start, end]) => {
		let pieces = [[start, end]];
		for (const [, from, to] of roles) pieces = pieces.flatMap(([a, b]) => (to <= a || from >= b ? [[a, b]] : [[a, Math.min(b, from)], [Math.max(a, to), b]].filter(([x, y]) => y > x)));
		return pieces.map(([a, b]) => [group, a, b]);
	});
	return [...cut, ...roles].sort((a, b) => a[1] - b[1]);
}
