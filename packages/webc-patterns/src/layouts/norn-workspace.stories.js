/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Template/norn-workspace",
	component: "norn-workspace",
	argTypes: {
		workspaces: { description: "The workspaces, for the sidebar.", table: { type: { summary: "{ href: string, title: string, icon?: string }[]" } } },
		workspace: { description: "The workspace on this page. Its `html` is compiled as WebC, so it may hold components.", table: { type: { summary: "{ name: string, description?: string, html?: string }" } } },
		default: { description: "The page's own content, in `norn-rich-text` after the workspace's page." },
	},
	parameters: {
		webc: {
			overrides: {
				"workspaces table.type": "The items' shape: the code reads their fields, not their types.",
				"workspace table.type": "The object's shape: the code reads its fields, not their types.",
			},
		},
		docs: {
			description: {
				component:
					'One workspace\'s page in the docs frame: the workspaces sidebar, its name, its description, and its page, such as its SKILL.md or README.md rendered to HTML. Extends `norn-base`. The page\'s own content follows the workspace\'s, so a pagination template can leave its body empty. The sidebar\'s name ("Packages") comes from `componentStrings` under `norn-workspace`, then English.',
			},
		},
	},
};
