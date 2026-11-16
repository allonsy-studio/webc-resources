/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Inline the org's SVGs into the compiled OSS components, so the package ships no asset folder.
// Run by `prepack`, after the build writes `components/` from `src/`. Idempotent: each component's SVGs are replaced in place, in order.

import fs from "node:fs";
import path from "node:path";

import { prepare, readAsset } from "./lib.js";

const COMPONENTS = path.join(import.meta.dirname, "..", "components");

/** Component file to its SVGs in order: the source file, the attributes the inline copy gets, and an optional cropped viewBox. */
const INLINE = {
	"oss-cta.webc": [{ file: "mark.svg", attributes: 'aria-hidden="true" width="72" height="72"' }],
};

const SVG = /<svg\b[\s\S]*?<\/svg>/g;

for (const [component, svgs] of Object.entries(INLINE)) {
	const file = path.join(COMPONENTS, component);
	const text = fs.readFileSync(file, "utf8");
	const found = text.match(SVG) ?? [];
	if (found.length !== svgs.length) throw new Error(`${component} has ${found.length} <svg> blocks; expected ${svgs.length}.`);
	const inlined = await Promise.all(
		svgs.map(async ({ file: name, attributes, viewBox }) => prepare((await readAsset("svg", name)).toString("utf8"), attributes, viewBox)),
	);
	let index = 0;
	fs.writeFileSync(file, text.replace(SVG, () => inlined[index++]));
}
