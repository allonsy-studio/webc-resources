/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { codeBlock, tokenRanges } from "./index.js";

/** Pair each range with the text it covers. */
const slices = (code, language) => JSON.parse(tokenRanges(code, language)).map(([group, start, end]) => [group, code.slice(start, end)]);

test("codeBlock is a forward-slash path to the component", () => {
	assert.ok(codeBlock.endsWith("/components/norn-code-block.webc"));
	assert.ok(!codeBlock.includes("\\"));
});

test("tokenRanges: offsets are ordered, in bounds, and match the source text", () => {
	const code = 'const greeting = "hello"; // hi\n';
	const ranges = JSON.parse(tokenRanges(code, "js"));
	let previousEnd = 0;
	for (const [, start, end] of ranges) {
		assert.ok(start >= previousEnd && end > start && end <= code.length);
		previousEnd = end;
	}
	assert.deepEqual(slices(code, "js").slice(0, 3), [
		["keyword", "const"],
		["punctuation", "="],
		["string", '"hello"'],
	]);
	assert.deepEqual(slices(code, "js").at(-1), ["comment", "// hi"]);
});

test("tokenRanges: unknown or missing language returns undefined", () => {
	assert.equal(tokenRanges("x", "nope"), undefined);
	assert.equal(tokenRanges("x"), undefined);
	assert.equal(tokenRanges("", "js"), undefined);
});

test("tokenRanges: loads the default extra languages", () => {
	const samples = { bash: "echo $HOME", css: "a { color: red; }", diff: "+ added", json: '{"a": 1}', typescript: "const a: number = 1;", yaml: "a: 1" };
	for (const [language, code] of Object.entries(samples)) {
		assert.equal(typeof tokenRanges(code, language), "string", `${language} is loaded`);
	}
});

test("tokenRanges: plain text inside a token inherits the token's group", () => {
	const keywords = slices('<a href="x">t</a>', "html").filter(([group]) => group === "keyword");
	assert.deepEqual(
		keywords.map(([, text]) => text),
		["a", " ", "a"],
	);
});

