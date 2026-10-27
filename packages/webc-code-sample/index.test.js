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


test("tokenRanges: a shell command, its subcommand, and its argument are three groups", () => {
	assert.deepEqual(slices("npm install @example/project", "sh"), [
		["function", "npm"],
		["keyword", "install"],
		["string", "@example/project"],
	]);
	assert.deepEqual(slices("yarn add @example/project", "bash"), [
		["function", "yarn"],
		["keyword", "add"],
		["string", "@example/project"],
	]);
});

test("tokenRanges: a shell flag is a flag, never a number", () => {
	const found = slices("pnpm add -D @example/project", "shell");
	assert.deepEqual(found, [
		["function", "pnpm"],
		["keyword", "add"],
		["flag", "-D"],
		["string", "@example/project"],
	]);
	assert.ok(!found.some(([group]) => group === "number"));
	assert.deepEqual(slices("npm run build -- --watch", "sh"), [
		["function", "npm"],
		["keyword", "run"],
		["string", "build"],
		["punctuation", "--"],
		["flag", "--watch"],
	]);
	assert.deepEqual(slices("ls --color=auto", "sh").slice(1), [
		["flag", "--color"],
		["punctuation", "="],
		["string", "auto"],
	]);
});

test("tokenRanges: a prompt is punctuation, a trailing comment is a comment, and a quoted string is a string", () => {
	assert.deepEqual(slices("$ npm install --save-dev x # then build", "sh"), [
		["punctuation", "$"],
		["function", "npm"],
		["keyword", "install"],
		["flag", "--save-dev"],
		["string", "x"],
		["comment", "# then build"],
	]);
	assert.deepEqual(slices('echo "a b" | grep a', "sh"), [
		["function", "echo"],
		["string", '"a b"'],
		["punctuation", "|"],
		["function", "grep"],
		["keyword", "a"],
	]);
});

test("tokenRanges: each line of a script has its own command, and a continued line stays one", () => {
	const script = "#!/bin/sh\nset -e\nnpm run build \\\n  --silent\nFOO=1 node cli.js\n";
	assert.deepEqual(slices(script, "sh").map(([group, text]) => `${group}:${text}`), [
		"comment:#!/bin/sh",
		"function:set",
		"flag:-e",
		"function:npm",
		"keyword:run",
		"string:build",
		"punctuation:\\",
		"flag:--silent",
		"punctuation:=",
		"number:1",
		"function:node",
		"keyword:cli.js",
	]);
});

test("tokenRanges: a shell session colors only the lines that start with a prompt", () => {
	assert.deepEqual(slices("$ npm i\nadded 1 package\n$ ls -la", "shell-session").map(([group, text]) => `${group}:${text}`), ["punctuation:$", "function:npm", "keyword:i", "punctuation:$", "function:ls", "flag:-la"]);
});

test("tokenRanges: a shell session colors every line of a command that goes on after a backslash, and none of the output", () => {
	const roles = (code) => slices(code, "shell-session").map(([group, text]) => `${group}:${text}`);
	assert.deepEqual(roles("$ docker run \\\n    --rm \\\n    alpine\nbooted ok\n$ ls"), ["punctuation:$", "function:docker", "keyword:run", "punctuation:\\", "flag:--rm", "punctuation:\\", "string:alpine", "punctuation:$", "function:ls"], "the last line of the command is a command line too");
	assert.deepEqual(roles('$ git commit \\\n  -m "a b"'), ["punctuation:$", "function:git", "keyword:commit", "punctuation:\\", "flag:-m", 'string:"a b"'], "a quoted argument on a continuation line is one string");
	assert.deepEqual(roles("$ echo hi\nC:\\dir\\\nnot a command\n$ ls"), ["punctuation:$", "function:echo", "keyword:hi", "punctuation:$", "function:ls"], "output that ends in a backslash does not continue anything");
});

test("tokenRanges: the aliases of the loaded languages have grammars", () => {
	const samples = { sh: "ls", shell: "ls", "shell-session": "$ ls", ts: "const a: number = 1;", html: "<a>t</a>", md: "# Title", markdown: "**b**", yml: "a: 1", js: "const a = 1;" };
	for (const [language, code] of Object.entries(samples)) assert.equal(typeof tokenRanges(code, language), "string", `${language} has a grammar`);
});
