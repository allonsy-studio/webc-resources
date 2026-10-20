/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { readIcons } from "./lib/icons.js";

const STROKE = `<?xml version="1.0"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 32 32" class="icon" style="color: red" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap='round'>
	<title>Ring</title>
	<desc>A ring</desc>
	<script>alert(1)</script>
	<circle cx="16" cy="16" r="8" onclick="steal()" onmouseover='steal()'/>
	<a href="javascript:alert(1)"><path d="M0 0h4"/></a>
</svg>`;
const FILLED = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M2 2h20v20H2z"/></svg>';

/** A folder of files, removed when the callback ends. */
function withFiles(files, run) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "norn-icons-"));
	try {
		for (const [name, text] of Object.entries(files)) {
			fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
			fs.writeFileSync(path.join(root, name), text);
		}
		return run(root);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

test("readIcons returns no icons without the option", () => {
	assert.deepEqual(readIcons(undefined), {});
});

test("a glob names each icon for its file, and a list of globs adds them up", () => {
	withFiles({ "icons/ring.svg": STROKE, "icons/solid-square.svg": FILLED, "more/dot.svg": FILLED, "icons/notes.txt": "x" }, (root) => {
		assert.deepEqual(Object.keys(readIcons("icons/*.svg", root)), ["ring", "solid-square"]);
		assert.deepEqual(Object.keys(readIcons(["icons/*.svg", "more/*.svg"], root)), ["ring", "solid-square", "dot"]);
		assert.deepEqual(readIcons("nothing/*.svg", root), {}, "a glob that matches nothing adds nothing");
	});
});

test("an icon keeps its viewBox and drawing, and loses its size, title, scripts, and handlers", () => {
	withFiles({ "ring.svg": STROKE, "solid.svg": FILLED }, (root) => {
		const { ring, solid } = readIcons("*.svg", root);
		assert.equal(ring.viewBox, "0 0 32 32");
		assert.equal(ring.mirror, false);
		assert.ok(ring.body.startsWith('<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">'), "the root's paint moves to a group");
		assert.ok(ring.body.includes('<circle cx="16" cy="16" r="8"/>'));
		assert.ok(ring.body.includes('<a><path d="M0 0h4"/></a>'), "a javascript: link loses its href");
		assert.ok(!/title|desc|script|alert|onclick|onmouseover|\swidth|height|class|style|<\?xml|DOCTYPE/i.test(ring.body), ring.body);
		assert.deepEqual(solid, { viewBox: "0 0 24 24", body: '<path fill="currentColor" d="M2 2h20v20H2z"/>', mirror: false }, "no viewBox gives the default, and no root paint adds no group");
	});
});

test("a file with no viewBox takes one from a numeric width and height", () => {
	withFiles({ "sized.svg": '<svg width="16px" height="16"><path d="M1 1h14"/></svg>', "relative.svg": '<svg width="100%" height="1em"><path d="M1 1h14"/></svg>' }, (root) => {
		const { sized, relative } = readIcons("*.svg", root);
		assert.equal(sized.viewBox, "0 0 16 16");
		assert.equal(relative.viewBox, "0 0 24 24", "a size in other units gives the default");
	});
});

test("a record names each icon, and mirror is opt-in", () => {
	withFiles({ "a/ring.svg": STROKE, "b.svg": FILLED }, (root) => {
		const icons = readIcons({ "arrow-end": "b.svg", ring: { src: "a/ring.svg", mirror: true }, plain: { src: "b.svg", mirror: false } }, root);
		assert.deepEqual(Object.keys(icons), ["arrow-end", "ring", "plain"]);
		assert.deepEqual([icons["arrow-end"].mirror, icons.ring.mirror, icons.plain.mirror], [false, true, false]);
		assert.equal(icons.ring.viewBox, "0 0 32 32");
	});
});

test("paths resolve against the root, and the working directory by default", () => {
	withFiles({ "ring.svg": STROKE }, (root) => {
		assert.deepEqual(Object.keys(readIcons({ ring: "ring.svg" }, root)), ["ring"]);
		assert.deepEqual(Object.keys(readIcons({ ring: path.join(root, "ring.svg") }, "/nowhere")), ["ring"], "an absolute path stands");
		const cwd = process.cwd();
		process.chdir(root);
		try {
			assert.deepEqual(Object.keys(readIcons("*.svg")), ["ring"]);
		} finally {
			process.chdir(cwd);
		}
	});
});

test("a bad shape throws, naming the option", () => {
	for (const bad of [7, true, null, [], [""], ["*.svg", 1], "", { ring: 7 }, { ring: {} }, { ring: { src: "" } }, { ring: ["a.svg"] }]) {
		assert.throws(() => readIcons(bad, os.tmpdir()), /norn: `icons` must be a glob|norn: icons: "ring" must be a path/, JSON.stringify(bad));
	}
	assert.throws(() => readIcons({ ring: { src: "ring.svg", mirrored: true } }, os.tmpdir()), /"ring" has an unknown option "mirrored". Options: src, mirror/);
	assert.throws(() => readIcons({ ring: { src: "ring.svg", mirror: "yes" } }, os.tmpdir()), /the mirror option of "ring" must be true or false/);
});

test("a missing file, a name that is not lowercase kebab, and two files with one name throw", () => {
	withFiles({ "Big Ring.svg": STROKE, "a/ring.svg": STROKE, "b/ring.svg": FILLED, "ring.txt": "x", "icons.svg/x": "" }, (root) => {
		assert.throws(() => readIcons({ ring: "missing.svg" }, root), /"ring" points at missing.svg, which is not a file/);
		assert.throws(() => readIcons({ ring: "a" }, root), /"ring" points at a, which is not a file/);
		for (const name of ["Ring", "ring_2", "-ring", "ring-", "2ring", "my ring", "ring--two"]) {
			assert.throws(() => readIcons({ [name]: "a/ring.svg" }, root), /is not a lowercase kebab name/, name);
		}
		assert.throws(() => readIcons("Big*.svg", root), /Big Ring.svg names the icon "Big Ring", which is not a lowercase kebab name/);
		assert.throws(() => readIcons("*/ring.svg", root), /two files are named "ring": a\/ring.svg and b\/ring.svg/);
		assert.throws(() => readIcons("ring.*", root), /ring.txt is not an SVG file/);
	});
});

test("a file without an svg element, a drawing, or a numeric viewBox throws", () => {
	withFiles({ "html.svg": "<p>No</p>", "empty.svg": '<svg viewBox="0 0 1 1"><title>Only</title></svg>', "self.svg": '<svg viewBox="0 0 1 1"/>', "box.svg": '<svg viewBox="0 0 wide 1"><path d="M0 0"/></svg>' }, (root) => {
		assert.throws(() => readIcons({ html: "html.svg" }, root), /html.svg has no <svg> element/);
		assert.throws(() => readIcons({ empty: "empty.svg" }, root), /empty.svg has no drawing/);
		assert.throws(() => readIcons({ self: "self.svg" }, root), /self.svg has no drawing/);
		assert.throws(() => readIcons({ box: "box.svg" }, root), /box.svg has the viewBox "0 0 wide 1", which is not four numbers/);
	});
});
