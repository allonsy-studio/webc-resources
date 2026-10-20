/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import path from "node:path";

import Prism from "prismjs";
import loadLanguages from "prismjs/components/index.js";

loadLanguages(["bash", "css", "diff", "json", "typescript", "yaml"]);

export { loadLanguages };

/** Absolute glob-safe path to `components/norn-code-block.webc`, for the project's WebC `components` list. */
export const codeBlock = path.join(import.meta.dirname, "components", "norn-code-block.webc").split(path.sep).join("/");

/** Highlight group by Prism token type. */
const GROUPS = {
	comment: ["comment", "prolog", "doctype", "cdata"],
	string: ["string", "attr-value", "char", "inserted"],
	keyword: ["keyword", "atom", "important", "tag"],
	function: ["function", "class-name", "attr-name", "property", "selector"],
	number: ["number", "boolean", "constant", "symbol", "parameter"],
	punctuation: ["punctuation", "operator"],
};

const GROUP_OF = new Map(Object.entries(GROUPS).flatMap(([group, types]) => types.map((type) => [type, group])));

/**
 * Tokenize code with Prism into highlight ranges.
 *
 * @param {string} code
 * @param {string} [language]
 * @returns {string | undefined} JSON `[group, start, end][]` of character offsets; undefined when the language isn't loaded or nothing matched
 */
export function tokenRanges(code, language = "") {
	const grammar = Prism.languages[language];
	if (!grammar) return undefined;
	const ranges = [];
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
	return ranges.length ? JSON.stringify(ranges) : undefined;
}
