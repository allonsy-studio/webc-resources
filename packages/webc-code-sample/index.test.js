/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import rust from "@shikijs/langs/rust";

import { codeBlock, decodeRanges, loadLanguages, tokenRanges } from "./index.js";
import { tokenize } from "./tokenize.js";

/** Every sample the tests below tokenize, by language and code, for the round trip at the end. */
const tried = new Map();

/** The ranges of a sample, decoded from `tokenRanges`. */
const rangesOf = (code, language) => {
	tried.set(`${language}\0${code}`, [code, language]);
	return decodeRanges(tokenRanges(code, language));
};

/** Pair each range with the text it covers. */
const slices = (code, language) => rangesOf(code, language).map(([group, start, end]) => [group, code.slice(start, end)]);

test("codeBlock is a forward-slash path to the component", () => {
	assert.ok(codeBlock.endsWith("/components/norn-code-block.webc"));
	assert.ok(!codeBlock.includes("\\"));
});

test("tokenRanges: offsets are ordered, in bounds, and match the source text", () => {
	const code = 'const greeting = "hello"; // hi\n';
	const ranges = rangesOf(code, "js");
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

test("tokenRanges: the tag names of markup are keywords, and the text between them is plain", () => {
	const found = slices('<a href="x">t</a>', "html");
	assert.deepEqual(
		found.filter(([group]) => group === "keyword").map(([, text]) => text),
		["a", "a"],
	);
	assert.ok(!found.some(([, text]) => text === "t"));
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

test("tokenRanges: a repeat sample comes from the cache, and changed code is tokenized again", () => {
	const code = Array.from({ length: 40 }, (_, line) => `const value${line} = compute("${line}", ${line}); // line ${line}`).join("\n");
	let start = performance.now();
	const first = tokenRanges(code, "js");
	const cold = performance.now() - start;
	start = performance.now();
	for (let i = 0; i < 10; i++) assert.equal(tokenRanges(code, "js"), first);
	const repeat = (performance.now() - start) / 10;
	assert.ok(repeat < cold / 10, `a repeat call (${repeat.toFixed(2)} ms) is much faster than the first (${cold.toFixed(2)} ms)`);
	const changed = tokenRanges(`${code}\nlet more = 1;`, "js");
	assert.notEqual(changed, first);
	assert.deepEqual(decodeRanges(changed).at(-2), ["number", code.length + 12, code.length + 13]);
});

test("tokenRanges: a line that takes Shiki longer than its time limit is still tokenized to the end", () => {
	const count = 40000;
	const code = `const a = [${Array.from({ length: count }, (_, index) => `"s${index}"`).join(", ")}];`;
	const ranges = rangesOf(code, "js");
	assert.equal(ranges.filter(([group]) => group === "string").length, count, "every string");
	assert.deepEqual(ranges.at(-1), ["punctuation", code.length - 1, code.length]);
});

test("tokenRanges: the aliases of the loaded languages have grammars", () => {
	const samples = { sh: "ls", shell: "ls", "shell-session": "$ ls", ts: "const a: number = 1;", html: "<a>t</a>", md: "# Title", markdown: "**b**", yml: "a: 1", js: "const a = 1;" };
	for (const [language, code] of Object.entries(samples)) assert.equal(typeof tokenRanges(code, language), "string", `${language} has a grammar`);
});

test("loadLanguages: adds a Shiki language, which tokenRanges then highlights", () => {
	assert.equal(tokenRanges('fn main() { println!("hi"); }', "rust"), undefined);
	loadLanguages(rust);
	assert.deepEqual(slices('fn main() { println!("hi"); }', "rust").filter(([group]) => group === "string"), [["string", '"hi"']]);
});

/** A 37-line JavaScript module, the size of a long sample on a docs page. */
const MODULE = `import fs from "node:fs";
import path from "node:path";

/** Default options for the loader. */
const DEFAULTS = { root: "src", extensions: [".md", ".webc"], limit: 100 };

/**
 * Read every page under a folder.
 *
 * @param {string} folder
 * @param {object} [options]
 * @returns {Promise<string[]>}
 */
export async function readPages(folder, options = {}) {
	const { root, extensions, limit } = { ...DEFAULTS, ...options };
	const found = [];
	for (const entry of await fs.promises.readdir(path.join(root, folder), { withFileTypes: true })) {
		if (found.length >= limit) break;
		if (entry.isDirectory()) {
			found.push(...(await readPages(path.join(folder, entry.name), options)));
		} else if (extensions.includes(path.extname(entry.name))) {
			found.push(await fs.promises.readFile(path.join(root, folder, entry.name), "utf8"));
		}
	}
	return found;
}

// Count the words of each page, skipping front matter.
export const wordCounts = (pages) =>
	pages.map((page) => {
		const body = page.replace(/^---\\n[\\s\\S]*?\\n---\\n/, "");
		return body.split(/\\s+/).filter(Boolean).length;
	});

const pages = await readPages("content", { limit: 20 });
console.log(\`\${pages.length} pages, \${wordCounts(pages).reduce((a, b) => a + b, 0)} words\`);
export default pages;
`;

/** An attribute value as the page carries it. */
const attribute = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

test("tokenRanges: a 37-line JavaScript sample is at most a quarter of the size of the plain range list", (t) => {
	assert.equal(MODULE.split("\n").length - 1, 37, "37 lines");
	const plain = attribute(JSON.stringify(tokenize(MODULE, "js"))).length;
	const compact = attribute(tokenRanges(MODULE, "js")).length;
	t.diagnostic(`plain ${plain} bytes, compact ${compact} bytes`);
	assert.ok(compact * 4 <= plain, `compact ${compact} bytes, plain ${plain} bytes`);
	assert.deepEqual(rangesOf(MODULE, "js"), tokenize(MODULE, "js"));
});

test("decodeRanges: no ranges is an empty list, and anything else malformed throws a TypeError that says why", () => {
	assert.deepEqual(decodeRanges(undefined), []);
	assert.deepEqual(decodeRanges("[[],[]]"), []);
	assert.deepEqual(decodeRanges('[["keyword","string"],[0,0,5,1,3,4,0,0,1]]'), [
		["keyword", 0, 5],
		["string", 8, 12],
		["keyword", 12, 13],
	]);
	const garbage = {
		"not json": /not JSON/,
		"": /not JSON/,
		"{}": /group table and a list of numbers/,
		"[]": /group table and a list of numbers/,
		'[["keyword",0,5]]': /group table and a list of numbers/,
		"[[1],[0,0,1]]": /group names/,
		'[["a"],[0,0]]': /multiple of three/,
		'[["a"],[1,0,1]]': /group 1/,
		'[["a"],[0,-1,1]]': /gap/,
		'[["a"],[0,0.5,1]]': /gap/,
		'[["a"],[0,0,0]]': /length/,
		'[["a"],[0,0,"1"]]': /length/,
	};
	for (const [value, message] of Object.entries(garbage)) assert.throws(() => decodeRanges(value), (error) => error instanceof TypeError && message.test(error.message), JSON.stringify(value));
	assert.throws(() => decodeRanges(42), TypeError);
});

/** The language of a tracked file, by extension or name; undefined for one with no grammar. */
const LANGUAGES = { ".js": "js", ".cjs": "js", ".webc": "html", ".njk": "html", ".md": "md", ".json": "json", ".css": "css", ".yml": "yaml", "post-commit": "sh" };

test("decodeRanges reads back exactly the ordered, non-overlapping ranges of every tracked source file and every sample above", () => {
	const root = path.resolve(import.meta.dirname, "..", "..");
	const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
	const samples = [...tried.values()];
	// The vendored Yarn release is not a source file.
	for (const file of files.filter((name) => !name.startsWith(".yarn/"))) {
		const language = LANGUAGES[path.extname(file) || path.basename(file)];
		if (language) samples.push([fs.readFileSync(path.join(root, file), "utf8"), language, file]);
	}
	assert.ok(samples.length > 300, `${samples.length} samples`);
	for (const [code, language, file = language] of samples) {
		const plain = tokenize(code, language);
		const compact = tokenRanges(code, language);
		if (!plain) {
			assert.equal(compact, undefined, file);
			continue;
		}
		let previousEnd = 0;
		for (const [group, start, end] of plain) {
			assert.ok(typeof group === "string" && start >= previousEnd && end > start && end <= code.length, `${file}: ordered and apart at ${start}`);
			previousEnd = end;
		}
		assert.deepEqual(decodeRanges(compact), plain, file);
	}
});
