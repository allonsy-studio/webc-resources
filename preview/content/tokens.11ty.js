/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { readTokens } from "../../scripts/build-components.js";

// The preview's own tokens.css: the app shell reads the shared tokens in its CSS, so it defines each one, as a project would.
// The component frames do not load it, so they show the compiled fallbacks.

export const data = {
	permalink: "/assets/styles/tokens.css",
	eleventyExcludeFromCollections: true,
};

/** @returns {string} A `:root` rule with every shared token set to its default */
export function render() {
	const lines = readTokens().map(({ name, resolved }) => `\t${name}: ${resolved};`);
	return `/* Generated from tokens.json. */\n:root {\n${lines.join("\n")}\n}\n`;
}
