/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-code-block",
	component: "norn-code-block",
	argTypes: {
		code: { description: "The code to show.", type: { name: "string", required: true } },
		language: { description: "A language Shiki has loaded: the defaults or one added with `loadLanguages`. Unknown or empty renders plain text." },
		caption: { description: "Also names the code and its copy button." },
		label: { description: 'The code\'s name without a caption, as one element. Falls back to "{language} code", with the language filled in, or "code" with no language.' },
		"copy-label": { description: 'The copy button\'s name, with `{name}` for the code\'s name, as one element. Falls back to "Copy {name} to clipboard".' },
		copy: { description: 'The copy button\'s text. Falls back to "Copy".' },
		copied: { description: 'The copy button\'s text after a copy. Falls back to "Copied".' },
		failed: { description: 'The copy button\'s text when the copy fails. Falls back to "Copy failed".' },
	},
	parameters: {
		docs: {
			description: {
				component:
					"Code sample tokenized at build time. Its script registers `norn-code-block` as a custom element that adds the highlight colors; without the script the markup is the whole sample. A compact `norn-copy-button` from `@allons-y/webc-patterns` sits over the top end corner of the code, as its icon until the pointer or focus is on it, and copies the code without any leading `$ ` prompts. While the button shows, the code scrolls in an area that stops short of it, so no code runs beneath it. A caption, when there is one, sits above the code. The code reads left to right in any page direction. Shell samples (`sh`, `bash`, `shell`, `shell-session`) color the command, its subcommand, its flags, and its arguments apart. Needs `tokenRanges` registered as the `nornTokenRanges` JavaScript function, and the patterns package's components. The names and the copy button's texts are in the page, hidden: the script names the code while it scrolls, and shows the button. Each falls back to the site's `componentStrings`, under `norn-code-block` for `label` and `copy-label` and under `norn-copy-button` for the rest, then English.",
			},
		},
	},
};

export const Default = { name: "JavaScript with a caption", args: { language: "js", caption: "example.js", code: "import { greet } from '@example/core';\n\nconsole.log(greet('world')); // hello, world\n" } };

export const Shell = { name: "Shell prompt", args: { language: "sh", code: "$ npm install @example/core\n$ npx example --help\n" } };

export const Overflow = { name: "Long line", args: { language: "js", caption: "long.js", code: "const message = 'This line is long enough to scroll sideways inside the sample, which is when the code becomes a keyboard stop';\n" } };

export const Plain = { name: "No language", args: { code: "Plain text, with no highlighting.\nA second line.\n" } };
