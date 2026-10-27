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

/** A custom element's name: a hyphen makes it a component, so ordinary HTML keeps CommonMark's rules. */
const NAME = String.raw`[a-z][a-z0-9]*-[a-z0-9._-]*`;
/** An attribute with any name WebC reads (`@variant`, `:@level`, `webc:if`), and an optional value. */
const ATTR = String.raw`\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>\x60]+))?`;
const OPEN = new RegExp(String.raw`^<${NAME}(?:${ATTR})*\s*\/?>`, "i");
const CLOSE = new RegExp(String.raw`^<\/${NAME}\s*>`, "i");
const TAG_LINE = new RegExp(String.raw`^(?:<${NAME}(?:${ATTR})*\s*\/?>|<\/${NAME}\s*>)\s*$`, "i");

/**
 * markdown-it amend: a component tag stays raw HTML with WebC's attribute names, so `<norn-callout @variant="tip">` reaches WebC as written.
 * CommonMark's attribute names have no `@`, so markdown-it escapes such a tag to text without it.
 * A line that is only a component's open or close tag starts an HTML block that runs to the next blank line, as CommonMark's own do; a tag inside a paragraph stays inline.
 * Fences and code spans stay literal. It does nothing when the library's `html` option is off.
 *
 * @param {import("markdown-it").default} md
 */
export function webcTags(md) {
	if (!md.options.html) return;
	md.block.ruler.before(
		"html_block",
		"webc_block",
		(state, startLine, endLine, silent) => {
			if (state.sCount[startLine] - state.blkIndent >= 4) return false;
			const line = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine]);
			if (!TAG_LINE.test(line)) return false;
			// Like CommonMark's HTML block of type 7, it can't interrupt a paragraph.
			if (silent) return false;
			let next = startLine + 1;
			while (next < endLine && !state.isEmpty(next)) next++;
			state.line = next;
			const token = state.push("html_block", "", 0);
			token.map = [startLine, next];
			token.content = state.getLines(startLine, next, state.blkIndent, true);
			return true;
		},
		{ alt: ["paragraph", "reference", "blockquote"] },
	);
	md.inline.ruler.before("html_inline", "webc_inline", (state, silent) => {
		if (state.src.charCodeAt(state.pos) !== 0x3c) return false;
		const rest = state.src.slice(state.pos);
		const match = OPEN.exec(rest) ?? CLOSE.exec(rest);
		if (!match) return false;
		if (!silent) state.push("html_inline", "", 0).content = match[0];
		state.pos += match[0].length;
		return true;
	});
}

/**
 * markdown-it amend: wrap each Markdown table in `<norn-simple-table>`, so a wide one scrolls in its own box.
 *
 * @param {import("markdown-it").default} md
 */
export function scrollTables(md) {
	const render = (tokens, index, options, env, self) => self.renderToken(tokens, index, options);
	const open = md.renderer.rules.table_open ?? render;
	const close = md.renderer.rules.table_close ?? render;
	md.renderer.rules.table_open = (...args) => `<norn-simple-table>${open(...args)}`;
	md.renderer.rules.table_close = (...args) => `${close(...args)}</norn-simple-table>\n`;
}

const CALLOUT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

/**
 * markdown-it amend: a blockquote that opens with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` renders as `<norn-callout>`, as on GitHub.
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
	const callout = (variant) => `<norn-callout @variant="${variant}">\n`;
	const open = md.renderer.rules.blockquote_open ?? render;
	const close = md.renderer.rules.blockquote_close ?? render;
	md.renderer.rules.blockquote_open = (tokens, index, ...rest) => (tokens[index].meta?.callout ? callout(tokens[index].meta.callout) : open(tokens, index, ...rest));
	md.renderer.rules.blockquote_close = (tokens, index, ...rest) => (tokens[index].meta?.callout ? "</norn-callout>\n" : close(tokens, index, ...rest));
}

/** Text for comparing titles: spaces collapsed, case folded. */
const titleText = (text) => String(text).replace(/\s+/g, " ").trim().toLowerCase();

/**
 * markdown-it amend: on a layout that shows the page title as its h1, keep the page to one h1.
 * A leading `# Title` that repeats the title goes, and any other h1 becomes an h2, which `headingAnchors` then anchors.
 * The layout is the page's own `layout`, by name; the title is the layout's, `norn.title`, or else the page's `title`.
 *
 * @param {import("markdown-it").default} md
 * @param {{ layouts?: string[] }} [options] - Layouts that show the title as an h1. Defaults to `norn-docs` and `norn-workspace`.
 */
export function singleTitle(md, { layouts = ["norn-docs", "norn-workspace"] } = {}) {
	const rule = (state) => {
		const env = state.env && typeof state.env === "object" ? state.env : {};
		const layout = String(env.layout ?? "").split("/").pop().replace(/\.webc$/, "");
		if (!layouts.includes(layout)) return;
		const title = env.norn?.workspace?.name ?? env.norn?.title ?? env.title;
		const { tokens } = state;
		const text = (inline) => inline.children.filter((child) => child.type === "text" || child.type === "code_inline").map((child) => child.content).join("");
		if (tokens[0]?.type === "heading_open" && tokens[0].tag === "h1" && typeof title === "string" && titleText(text(tokens[1])) === titleText(title)) tokens.splice(0, 3);
		for (const token of tokens) {
			if ((token.type === "heading_open" || token.type === "heading_close") && token.tag === "h1") {
				token.tag = "h2";
				token.markup = "##";
			}
		}
	};
	// It runs before the anchors, so a demoted heading gets one.
	if (md.core.ruler.__find__("heading_anchors") === -1) md.core.ruler.push("single_title", rule);
	else md.core.ruler.before("heading_anchors", "single_title", rule);
}

/**
 * A URL fragment from heading text: the letters, marks, and digits of any script, lowercase, with accents off Latin letters, and runs of anything else as one hyphen.
 * An ASCII heading keeps the id it always had.
 *
 * @param {string} text
 * @returns {string}
 */
export const slugify = (text) =>
	String(text)
		.normalize("NFKD")
		.toLowerCase()
		.replace(/(?<=\p{Script=Latin})\p{M}+/gu, "")
		.normalize("NFC")
		.replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
		.replace(/^-|-$/g, "") || "section";

/** Ids taken so far, by page: Eleventy hands each Markdown render of a page, such as two Markdown blocks, the same `page` object, and a new one each build. Without a page, by render. */
const taken = new WeakMap();

/**
 * The ids given so far on the page this render belongs to.
 *
 * @param {object} env - The render's environment: Eleventy's page data
 * @returns {Set<string>}
 */
function idsOf(env) {
	const key = env?.page && typeof env.page === "object" ? env.page : env && typeof env === "object" ? env : {};
	if (!taken.has(key)) taken.set(key, new Set());
	return taken.get(key);
}

/**
 * markdown-it amend: give each heading at the chosen levels an id, and render it as `norn-heading-anchor`, as an author writes it, so its text links to itself.
 * A repeated heading gets `-2`, `-3`, and so on, counted across the page. A heading that already has an id keeps it.
 * A heading whose text holds a link gets the id only, so no link nests in another. So does an h1, which the component has no tag for.
 *
 * @param {import("markdown-it").default} md
 * @param {{ levels?: number[] }} [options] - Heading levels to anchor. Defaults to 2 and 3.
 */
export function headingAnchors(md, { levels = [2, 3] } = {}) {
	md.core.ruler.push("heading_anchors", (state) => {
		const ids = idsOf(state.env);
		state.tokens.forEach((token, index) => {
			const level = Number(token.tag.slice(1));
			if (token.type !== "heading_open" || !levels.includes(level)) return;
			const inline = state.tokens[index + 1];
			let id = token.attrGet("id");
			if (!id) {
				const base = slugify(inline.children.filter((child) => child.type === "text" || child.type === "code_inline").map((child) => child.content).join(""));
				id = base;
				for (let count = 2; ids.has(id); count++) id = `${base}-${count}`;
				token.attrSet("id", id);
			}
			ids.add(id);
			// A link can't hold a link: a heading whose text links elsewhere keeps the author's link and takes only the id.
			if (level < 2 || inline.children.some((child) => child.type === "link_open")) return;
			const anchor = { slug: id, level };
			token.meta = { ...token.meta, anchor };
			const close = state.tokens.slice(index).find((next) => next.type === "heading_close");
			close.meta = { ...close.meta, anchor };
		});
	});
	const render = (tokens, index, options, env, self) => self.renderToken(tokens, index, options);
	const open = md.renderer.rules.heading_open ?? render;
	const close = md.renderer.rules.heading_close ?? render;
	md.renderer.rules.heading_open = (tokens, index, ...rest) => {
		const anchor = tokens[index].meta?.anchor;
		if (!anchor) return open(tokens, index, ...rest);
		return `<norn-heading-anchor @slug="${md.utils.escapeHtml(anchor.slug)}"${anchor.level === 2 ? "" : ` :@level="${anchor.level}"`}>`;
	};
	md.renderer.rules.heading_close = (tokens, index, ...rest) => (tokens[index].meta?.anchor ? "</norn-heading-anchor>\n" : close(tokens, index, ...rest));
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };

/** Markup as plain text: tags off, the common entities decoded, spaces collapsed. */
const plain = (markup) =>
	markup
		.replace(/<[^>]+>/g, "")
		.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name) => ENTITIES[name])
		.replace(/\s+/g, " ")
		.trim();

/** A heading with an id, as compiled or written as HTML. */
const HEADING = /<h([1-6])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
/** `norn-heading-anchor` before WebC compiles it: as `headingAnchors` writes it, or as an author does in Markdown. */
const ANCHOR = new RegExp(String.raw`<norn-heading-anchor\b((?:${ATTR})*)\s*>([\s\S]*?)<\/norn-heading-anchor>`, "g");

/**
 * A prop of an uncompiled tag: `@name="x"`, `name="x"`, or `:@name` with a string or number literal.
 *
 * @param {string} attributes
 * @param {string} name
 * @returns {string | undefined}
 */
function prop(attributes, name) {
	const match = new RegExp(String.raw`(?:^|\s)(:?@?)${name}\s*=\s*(?:"([^"]*)"|'([^']*)')`).exec(attributes);
	if (!match) return undefined;
	const value = (match[2] ?? match[3]).replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, entity) => ENTITIES[entity]);
	if (match[1] !== ":@") return value;
	const literal = /^\s*(?:'([^']*)'|"([^"]*)"|(\d+))\s*$/.exec(value);
	return literal ? (literal[1] ?? literal[2] ?? literal[3]) : undefined;
}

/**
 * The headings in rendered HTML that carry an id, for `norn-toc`, in page order.
 * It reads a heading with an id, and a `norn-heading-anchor` that WebC has not compiled yet, as `headingAnchors` writes it in Markdown.
 *
 * @param {string} html
 * @param {{ levels?: number[] }} [options] - Heading levels to list. Defaults to 2 and 3.
 * @returns {{ id: string, text: string, level: number }[]}
 */
export function headings(html, { levels = [2, 3] } = {}) {
	if (typeof html !== "string") return [];
	const found = [...html.matchAll(HEADING)].map((match) => ({ at: match.index, id: match[2], level: Number(match[1]), text: plain(match[3]) }));
	for (const match of html.matchAll(ANCHOR)) {
		const id = prop(match[1], "slug");
		// A compiled anchor has no slug on its tag: the heading inside it is listed above.
		if (id) found.push({ at: match.index, id, level: Number(prop(match[1], "level") ?? 2) || 2, text: plain(match[2]) });
	}
	return found
		.filter((heading) => levels.includes(heading.level))
		.sort((a, b) => a.at - b.at)
		.map(({ id, level, text }) => ({ id, level, text }));
}
