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

import { merge, prepare, readAsset } from "./lib.js";

const COMPONENTS = path.join(import.meta.dirname, "..", "components");
const ALT = "Brought to you by Allons-y Studio";

/** The banner's lockup with 24 units of room each side. The source is 1600 wide with the lockup centered, and scaling all of it down made the text unreadable on a phone. */
const BANNER_VIEWBOX = "551 0 500 64";

/** The credit art is 880 by 150 with about 270 units of blank canvas each side: crop to the art, at 300 by 135. */
const CREDIT_VIEWBOX = "273 0 334 150";

/** Component file to its SVGs in order: the source file, an optional dark twin to merge into it, the attributes the inline copy gets, and an optional cropped viewBox. */
const INLINE = {
	"oss-bar.webc": [{ file: "oss-banner.svg", attributes: `role="img" aria-label="${ALT}" width="500" height="64"`, viewBox: BANNER_VIEWBOX }],
	"oss-cta.webc": [{ file: "mark.svg", attributes: 'aria-hidden="true" width="72" height="72"' }],
	"oss-credit.webc": [{ file: "oss-footer-light.svg", dark: "oss-footer-dark.svg", attributes: `role="img" aria-label="${ALT}" width="300" height="135"`, viewBox: CREDIT_VIEWBOX }],
};

const SVG = /<svg\b[\s\S]*?<\/svg>/g;

for (const [component, svgs] of Object.entries(INLINE)) {
	const file = path.join(COMPONENTS, component);
	const text = fs.readFileSync(file, "utf8");
	const found = text.match(SVG) ?? [];
	if (found.length !== svgs.length) throw new Error(`${component} has ${found.length} <svg> blocks; expected ${svgs.length}.`);
	const inlined = await Promise.all(
		svgs.map(async ({ file: name, dark, attributes, viewBox }) => {
			const light = prepare((await readAsset("svg", name)).toString("utf8"), attributes, viewBox);
			return dark ? merge(light, prepare((await readAsset("svg", dark)).toString("utf8"), attributes, viewBox)) : light;
		}),
	);
	let index = 0;
	fs.writeFileSync(file, text.replace(SVG, () => inlined[index++]));
}
