/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/*
 * The Markdown add-on. Each amend turns Markdown into the markup an author would write by hand for the same component.
 * None writes a string of its own: the component's slot fallbacks and `componentStrings` supply every text.
 */

/**
 * markdown-it amend: wrap each Markdown table in `<norn-data-table>`, so a wide one scrolls in its own box.
 *
 * @param {import("markdown-it").default} md
 */
export function scrollTables(md) {
	const render = (tokens, index, options, env, self) => self.renderToken(tokens, index, options);
	const open = md.renderer.rules.table_open ?? render;
	const close = md.renderer.rules.table_close ?? render;
	md.renderer.rules.table_open = (...args) => `<norn-data-table>${open(...args)}`;
	md.renderer.rules.table_close = (...args) => `${close(...args)}</norn-data-table>\n`;
}

const CALLOUT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

/**
 * markdown-it amend: a blockquote that opens with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` renders as `<norn-call-out>`, as on GitHub.
 * It writes no title: the component's `heading` slot falls back to the site's `componentStrings`, then English.
 *
 * @param {import("markdown-it").default} md
 */
export function callouts(md) {
	md.core.ruler.push("callouts", (state) => {
		const { tokens } = state;
		for (let index = 0; index < tokens.length; index++) {
			const open = tokens[index];
			const inline = tokens[index + 2];
			if (open.type !== "blockquote_open" || tokens[index + 1]?.type !== "paragraph_open" || inline?.type !== "inline") continue;
			const marker = CALLOUT.exec(inline.content);
			if (!marker) continue;
			const variant = marker[1].toLowerCase();
			inline.content = inline.content.slice(marker[0].length);
			const [first, second] = inline.children;
			first.content = first.content.replace(CALLOUT, "");
			if (!first.content) inline.children.splice(0, second?.type === "softbreak" ? 2 : 1);
			if (!inline.children.length) tokens[index + 1].hidden = tokens[index + 3].hidden = true;
			open.meta = { ...open.meta, callout: variant };
			for (let depth = 0, close = index; close < tokens.length; close++) {
				depth += tokens[close].nesting * (tokens[close].type.startsWith("blockquote") ? 1 : 0);
				if (tokens[close].type === "blockquote_close" && depth === 0) {
					tokens[close].meta = { ...tokens[close].meta, callout: variant };
					break;
				}
			}
		}
	});
	const render = (tokens, index, options, env, self) => self.renderToken(tokens, index, options);
	const callout = (variant) => `<norn-call-out @variant="${variant}">\n`;
	const open = md.renderer.rules.blockquote_open ?? render;
	const close = md.renderer.rules.blockquote_close ?? render;
	md.renderer.rules.blockquote_open = (tokens, index, ...rest) => (tokens[index].meta?.callout ? callout(tokens[index].meta.callout) : open(tokens, index, ...rest));
	md.renderer.rules.blockquote_close = (tokens, index, ...rest) => (tokens[index].meta?.callout ? "</norn-call-out>\n" : close(tokens, index, ...rest));
}

/** A URL fragment from heading text: lowercase, accents off, runs of anything else as one hyphen. */
export const slugify = (text) =>
	String(text)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "") || "section";

/** Slugs taken so far, by render. */
const taken = new WeakMap();

/**
 * markdown-it amend: give each heading at the chosen levels an id, and make its text a link to itself, as `norn-heading-anchor` does.
 * A repeated heading gets `-2`, `-3`, and so on. A heading that already has an id keeps it.
 *
 * @param {import("markdown-it").default} md
 * @param {{ levels?: number[] }} [options] - Heading levels to anchor. Defaults to 2 and 3.
 */
export function headingAnchors(md, { levels = [2, 3] } = {}) {
	md.core.ruler.push("heading_anchors", (state) => {
		const env = state.env && typeof state.env === "object" ? state.env : {};
		if (!taken.has(env)) taken.set(env, new Map());
		const seen = taken.get(env);
		state.tokens.forEach((token, index) => {
			if (token.type !== "heading_open" || !levels.includes(Number(token.tag.slice(1)))) return;
			const inline = state.tokens[index + 1];
			let id = token.attrGet("id");
			if (!id) {
				const base = slugify(inline.children.filter((child) => child.type === "text" || child.type === "code_inline").map((child) => child.content).join(""));
				const count = (seen.get(base) ?? 0) + 1;
				seen.set(base, count);
				id = count === 1 ? base : `${base}-${count}`;
				token.attrSet("id", id);
			}
			const open = new state.Token("link_open", "a", 1);
			open.attrSet("href", `#${id}`);
			inline.children = [open, ...inline.children, new state.Token("link_close", "a", -1)];
		});
	});
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };

/**
 * The headings in rendered HTML that carry an id, for `norn-toc`.
 *
 * @param {string} html
 * @param {{ levels?: number[] }} [options] - Heading levels to list. Defaults to 2 and 3.
 * @returns {{ id: string, text: string, level: number }[]}
 */
export function headings(html, { levels = [2, 3] } = {}) {
	if (typeof html !== "string") return [];
	return [...html.matchAll(/<h([1-6])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)]
		.filter(([, level]) => levels.includes(Number(level)))
		.map(([, level, id, inner]) => ({
			id,
			level: Number(level),
			text: inner
				.replace(/<[^>]+>/g, "")
				.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name) => ENTITIES[name])
				.replace(/\s+/g, " ")
				.trim(),
		}));
}
