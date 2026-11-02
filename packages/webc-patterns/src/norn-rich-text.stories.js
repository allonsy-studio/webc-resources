/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Container/norn-rich-text",
	component: "norn-rich-text",
	argTypes: {
		default: { description: "The prose, as rendered HTML." },
		measure: {
			description: "Line length: `text`, --norn-text-measure, or `none`, the full width, as in a page whose prose holds to the measure child by child.",
			options: ["text", "none"],
			table: { defaultValue: { summary: "text" } },
		},
	},
	parameters: {
		webc: {
			overrides: {
				"measure options": "The code tests for `none` alone: any other value keeps the measure, so `text` is named here.",
				"measure table.defaultValue": "Without `none` the prose keeps the measure, and the code has no value for that case to derive.",
			},
		},
		docs: {
			description: {
				component: "Prose styles for long-form content: headings, paragraphs, lists, quotes, tables, rules, and inline code, all at one line height. A heading that links to itself is a `norn-heading-anchor`, which styles its own `#` and takes the same space above as a plain heading. Wrap the content in it: `<norn-rich-text><template webc:nokeep @html=\"content\"></template></norn-rich-text>`. Rules in tables and dividers and the quote bar take --norn-ui-border-color, and inline code --norn-surface-code.",
			},
		},
	},
};
