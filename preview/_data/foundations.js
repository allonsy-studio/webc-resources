/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { inline, readTokens } from "../lib/catalog.js";

/** The light and dark hex a color token starts from, when its default spells them out. Derived colors have none: the page resolves them. */
const hexes = (value) => {
	const pair = value.match(/^light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i);
	if (pair) return { light: pair[1], dark: pair[2] };
	return /^#[0-9a-f]{6}$/i.test(value) ? { light: value, dark: value } : {};
};

/** The shared tokens in tokens.json: name, group, default value, and what each is for. */
export default () =>
	[...readTokens()].map(([name, { path, group, value, comment, kind }]) => ({ name, path, group, description: inline(comment), value, kind, valueHtml: inline(value), ...hexes(value) }));
