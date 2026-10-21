/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

const COMPONENTS = path.join(import.meta.dirname, "components");

/** Component names in the package, from the files in `components/`. */
const names = () =>
	fs
		.readdirSync(COMPONENTS)
		.filter((file) => file.endsWith(".webc"))
		.map((file) => file.slice(0, -".webc".length))
		.sort();

/**
 * Absolute glob for the package's components, for the project's WebC `components` list.
 *
 * @param {{ exclude?: string[] }} [options] - Component names to leave out, so the project can supply its own
 * @returns {string}
 * @throws {Error} When `exclude` names a component the package does not have
 */
export function patterns({ exclude = [] } = {}) {
	const available = names();
	const unknown = exclude.filter((name) => !available.includes(name));
	if (unknown.length) {
		throw new Error(`patterns: no component named ${unknown.map((name) => `"${name}"`).join(", ")}. Available: ${available.join(", ")}`);
	}
	const dir = COMPONENTS.split(path.sep).join("/");
	return exclude.length ? `${dir}/!(${exclude.join("|")}).webc` : `${dir}/*.webc`;
}

/**
 * The pages before and after one in a collection, for `norn-pager`.
 *
 * @param {{ url: string }[]} pages - A collection, in order
 * @param {{ url: string }} page - The current page
 * @returns {{ prev?: object, next?: object }} Both undefined when the page is not in the collection
 */
export function adjacent(pages, page) {
	const index = pages.findIndex((candidate) => candidate.url === page.url);
	if (index === -1) return { prev: undefined, next: undefined };
	return { prev: pages[index - 1], next: pages[index + 1] };
}

/** The empty bundle tags a page without CSS or JS is left with. HtmlBasePlugin may have rewritten the empty URL to `.`. */
const EMPTY_BUNDLE_TAGS = /[\t ]*<link rel="stylesheet" href="[./]*">\n?|[\t ]*<script src="[./]*"[^>]*><\/script>\n?/g;

/**
 * Eleventy transform: drop the empty bundle `<link>` and `<script>` that `norn-head` leaves on a page with no bundles.
 * `webc:if` can't guard them, because the bundle URL resolves after render. The Norn plugin registers it; without the plugin,
 * register it yourself: `config.addTransform("empty-bundle-tags", dropEmptyBundleTags)`.
 *
 * @param {string} content
 * @returns {string}
 */
export function dropEmptyBundleTags(content) {
	return typeof content === "string" ? content.replace(EMPTY_BUNDLE_TAGS, "") : content;
}

/** The English defaults, frozen below as `defaultStrings`. The `norn-*` layouts have no caller to fill a slot, so their texts are keyed here by layout. */
const STRINGS = {
	"norn-base": { footer: "Footer", license: "Licensed under {license}" },
	"norn-docs": { nav: "Documentation", search: "Search the docs" },
	"norn-docs-home": { actions: "Get started", docs: "Read the docs", repo: "View on GitHub", contents: "Documentation" },
	"norn-landing": {
		actions: "Get started",
		start: "Get started",
		repo: "View on GitHub",
		free: "Free & open source",
		license: "License: {license}",
		node: "Node {node}",
		install: "Install",
		features: "Features",
		packages: "Packages",
	},
	"norn-workspace": { nav: "Packages" },
	"norn-workspaces-home": { actions: "Get started", browse: "Browse packages", repo: "View on GitHub", packages: "Packages" },
	"norn-breadcrumb-nav": { label: "Breadcrumb" },
	"norn-callout": { note: "Note", tip: "Tip", important: "Important", warning: "Warning", caution: "Caution" },
	"norn-code-block": { label: "{language} code", "copy-label": "Copy {name} to clipboard" },
	"norn-code-tabs": { label: "Code samples", sample: "Sample {n}" },
	"norn-copy-button": { copy: "Copy", copied: "Copied", failed: "Copy failed" },
	"norn-header": { label: "Primary", summary: "Menu" },
	"norn-notice": { info: "Note: ", success: "Success: ", warning: "Warning: ", error: "Error: " },
	"norn-pager": { label: "Pager" },
	"norn-toc": { label: "On this page" },
	"norn-search": {
		label: "Search",
		none: "No results",
		"results-zero": null,
		"results-one": "{count} result",
		"results-two": null,
		"results-few": null,
		"results-many": null,
		"results-other": "{count} results",
	},
	"norn-side-nav": { label: "Pages" },
	"norn-sidebar-layout": { summary: "Menu" },
	"norn-skip-link": { label: "Skip to content" },
	"norn-theme-toggle": { label: "Color scheme", light: "Light", system: "System", dark: "Dark" },
};

/**
 * Every string the components and layouts show or read, with its English default, by component or layout and key.
 * A component's key is the slot it fills when the page leaves that slot empty, or for `norn-callout` and `norn-notice` the variant or severity whose `heading` or `prefix` it is.
 * A layout's key names a text it writes itself, such as `norn-landing`'s `license`, a template with `{license}` for the value.
 * `norn-code-block` takes its button texts from the `norn-copy-button` keys.
 * A `null` default means the component has none and falls back to another key.
 */
export const defaultStrings = Object.freeze(Object.fromEntries(Object.entries(STRINGS).map(([component, keys]) => [component, Object.freeze(keys)])));

/** Throw on a component or key `defaultStrings` doesn't list, naming the ones it does. */
function checkStrings(table, where) {
	for (const [component, keys] of Object.entries(table)) {
		if (!Object.hasOwn(defaultStrings, component)) throw new Error(`componentStrings: no component named "${component}"${where}. Available: ${Object.keys(defaultStrings).join(", ")}`);
		for (const [key, value] of Object.entries(keys ?? {})) {
			if (!Object.hasOwn(defaultStrings[component], key)) {
				const hint = /[A-Z]/.test(key) ? `; keys are slot names, as "${key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())}"` : "";
				throw new Error(`componentStrings: ${component} has no string "${key}"${where}${hint}. Available: ${Object.keys(defaultStrings[component]).join(", ")}`);
			}
			if (typeof value !== "string") throw new Error(`componentStrings: ${component}.${key}${where} must be a string`);
		}
	}
}

/**
 * Site-wide strings for every component and layout, so a page in another language needs no slot on each tag.
 * The Norn plugin registers the result of its `strings` option. Without the plugin, register it once:
 * `config.addJavaScriptFunction("nornComponentStrings", componentStrings({ "norn-toc": { label: "Sur cette page" } }))`.
 * Keys are the slot names, as `label` or `results-one`. For several languages, key the tables by language tag, as `{ fr: { … }, de: { … } }`:
 * a page picks its table by `page.lang`, which Eleventy's i18n plugin sets.
 * A slot filled on the tag still wins, a missing string keeps the English default, and an unknown component or key throws.
 *
 * @param {Record<string, Record<string, string>>} table - Strings by component and key, or such tables by language tag
 * @returns {(component: string, key: string, page?: { lang?: string }) => string | undefined}
 */
export function componentStrings(table) {
	const byLanguage = new Map();
	for (const [key, value] of Object.entries(table)) {
		if (Object.hasOwn(defaultStrings, key)) continue;
		const [lang] = canonical(key) ?? [];
		if (!lang) throw new Error(`componentStrings: "${key}" is neither a component nor a language tag. Components: ${Object.keys(defaultStrings).join(", ")}`);
		checkStrings(value, ` (in "${key}")`);
		byLanguage.set(lang, value);
	}
	const shared = Object.fromEntries(Object.entries(table).filter(([key]) => Object.hasOwn(defaultStrings, key)));
	checkStrings(shared, "");
	return (component, key, page) => {
		const [lang] = canonical(page?.lang) ?? [];
		const own = lang && (byLanguage.get(lang) ?? byLanguage.get(lang.split("-")[0]));
		return own?.[component]?.[key] ?? shared[component]?.[key];
	};
}

/** A language tag in its canonical case, or nothing for a missing or malformed one. */
function canonical(tag) {
	try {
		return tag ? Intl.getCanonicalLocales(tag) : undefined;
	} catch {
		return undefined;
	}
}
