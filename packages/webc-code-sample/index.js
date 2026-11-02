/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import path from "node:path";

import { addLanguages, tokenize } from "./tokenize.js";

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
	addLanguages(languages.flat());
	cache.clear();
}

/** Absolute glob-safe path to `components/norn-code-block.webc`, for the project's WebC `components` list. */
export const codeBlock = path.join(import.meta.dirname, "components", "norn-code-block.webc").split(path.sep).join("/");

/**
 * Tokenize code with Shiki into highlight ranges, in the compact form `data-tokens` carries (see `encodeRanges`).
 *
 * @param {string} code
 * @param {string} [language]
 * @returns {string | undefined} JSON `[groups, numbers]`; undefined when the language isn't loaded or nothing matched
 */
export function tokenRanges(code, language = "") {
	const key = `${language}\0${code}`;
	if (cache.has(key)) return cache.get(key);
	const found = tokenize(code, language);
	const ranges = found && encodeRanges(found);
	if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
	cache.set(key, ranges);
	return ranges;
}

/**
 * Write ranges in the compact `data-tokens` form: `[groups, numbers]`, the group names once each, in order of first use,
 * then three numbers per range: the group's index in `groups`, the gap from the end of the range before (or from 0), and the length.
 *
 * @param {[string, number, number][]} ranges - `[group, start, end]`, ordered and apart
 * @returns {string}
 */
function encodeRanges(ranges) {
	const groups = [];
	const numbers = [];
	let previousEnd = 0;
	for (const [group, start, end] of ranges) {
		if (!groups.includes(group)) groups.push(group);
		numbers.push(groups.indexOf(group), start - previousEnd, end - start);
		previousEnd = end;
	}
	return JSON.stringify([groups, numbers]);
}

/**
 * Read a `tokenRanges` string, the `data-tokens` value, back into `[group, start, end][]` character offsets.
 *
 * @param {string | undefined} value - The compact form; undefined, as `tokenRanges` returns for no ranges, reads as none
 * @returns {[string, number, number][]}
 * @throws {TypeError} When the value is not the compact form, naming what is wrong
 */
export function decodeRanges(value) {
	if (value === undefined) return [];
	if (typeof value !== "string") throw new TypeError(`decodeRanges takes a string, not ${typeof value}.`);
	let parsed;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new TypeError("decodeRanges: the value is not JSON.");
	}
	const [groups, numbers] = Array.isArray(parsed) ? parsed : [];
	if (parsed?.length !== 2 || !Array.isArray(groups) || !Array.isArray(numbers)) throw new TypeError("decodeRanges: the value is not a group table and a list of numbers.");
	if (!groups.every((group) => typeof group === "string")) throw new TypeError("decodeRanges: the group table holds group names only.");
	if (numbers.length % 3) throw new TypeError("decodeRanges: the list of numbers is not a multiple of three long.");
	const ranges = [];
	let end = 0;
	for (let at = 0; at < numbers.length; at += 3) {
		const [index, gap, length] = numbers.slice(at, at + 3);
		if (!Number.isInteger(index) || !Object.hasOwn(groups, index)) throw new TypeError(`decodeRanges: range ${at / 3} names group ${index}, which the table lacks.`);
		if (!Number.isInteger(gap) || gap < 0) throw new TypeError(`decodeRanges: range ${at / 3} has gap ${gap}, not a whole number of 0 or more.`);
		if (!Number.isInteger(length) || length < 1) throw new TypeError(`decodeRanges: range ${at / 3} has length ${length}, not a whole number of 1 or more.`);
		const start = end + gap;
		end = start + length;
		ranges.push([groups[index], start, end]);
	}
	return ranges;
}
