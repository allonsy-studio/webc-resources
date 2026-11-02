/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/*
 * The Markdown add-on. It writes the `<norn-code-block>` tag an author would write by hand
 * and no text of its own: the component's slot fallbacks and `componentStrings` supply every string.
 */

/**
 * markdown-it amend: render fenced code as `<norn-code-block>`, with the fence's first word as its `language`.
 * It fills no slots: the component names the code ("js code") and its copy button, and takes the button texts from the site's `componentStrings`, then English.
 *
 * @param {import("markdown-it")} md
 */
export function highlightFences(md) {
	md.renderer.rules.fence = (tokens, idx) => {
		const { content, info } = tokens[idx];
		const language = info.trim().split(/\s+/)[0];
		return `<norn-code-block @code="${md.utils.escapeHtml(content)}" @language="${md.utils.escapeHtml(language)}"></norn-code-block>\n`;
	};
}
