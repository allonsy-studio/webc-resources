/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-fact-list",
	component: "norn-fact-list",
	argTypes: {
		gap: { description: "The space between rows: `xs`, `s`, `m`, or `l`, each a `--norn-space-*` step. The facts in a row are always `m` apart. A hero sets `l`.", options: ["xs", "s", "m", "l"], table: { defaultValue: { summary: "xs" } } },
		default: { description: "The facts, as `<li>` elements." },
	},
	parameters: {
		webc: {
			overrides: {
				"gap options": "`xs` is the CSS default for an unset gap, so the code tests only `s`, `m`, and `l`.",
				"gap table.defaultValue": "`xs` is the CSS default for an unset gap, so the code does not say it.",
			},
		},
		docs: {
			description: {
				component: "Short facts in a row, such as a license or a runtime: an optional icon and a few words each, with no box. Static text, not controls. Pass each fact as an `<li>`, which may start with a `norn-icon`. The list has `role=\"list\"`, which Safari needs once the markers are gone.",
			},
		},
	},
};

export const Default = {
	args: { default: '<li><norn-icon @name="check"></norn-icon>Free &amp; open source</li>\n<li><norn-icon @name="check"></norn-icon>License: MPL-2.0</li>\n<li><norn-icon @name="check"></norn-icon>Node 24+</li>' },
};
