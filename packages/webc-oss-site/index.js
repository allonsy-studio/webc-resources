/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

import norn, { fillHooks } from "@allons-y/webc-patterns/plugin";

const HERE = import.meta.dirname;
const posix = (file) => file.split(path.sep).join("/");

/** A folder path to put at the start of a glob: a backslash before each character a glob reads as syntax, so `Dropbox (Personal)` matches itself. */
const globPath = (folder) => posix(folder).replace(/[\\()*?[\]{|}]|[!+@](?=\()/g, "\\$&");

/** Absolute path to the self-hosted font files. The OSS site plugin copies them to `assets/fonts`. */
export const fonts = posix(path.join(HERE, "fonts"));

/** Absolute glob for the OSS components: `oss-head` and the locked `oss-bar`, `oss-cta`, and `oss-credit`. The OSS site plugin adds it. */
export const components = `${globPath(path.join(HERE, "components"))}/*.webc`;

/** Absolute path to the brand tokens, `css/tokens.css`, in the `norn.oss` layer. The OSS site plugin embeds it in every page's bundle. */
export const tokens = posix(path.join(HERE, "css", "tokens.css"));

/** The host that serves every Allons-y Studio project site, one path per repository: pass it to `buildSite` as `host`. */
export const host = "https://projects.allons-y.studio";

/** Allons-y Studio's own policies, linked from the footer when the project keeps none of its own. */
export const policies = Object.freeze({
	conduct: "https://github.com/allonsy-studio/.github/blob/main/CODE_OF_CONDUCT.md",
	security: "https://github.com/allonsy-studio/.github/blob/main/SECURITY.md",
});

/** The theme color the OSS site theme sets for both schemes: the banner's navy. */
const THEME_COLOR = "#33394e";

/**
 * Whether the project keeps the OSS site layer: false only when its package.json sets `"oss-docs": { "oss": false }`.
 * A project's config picks the OSS site plugin or the plain Norn one by it.
 *
 * @param {{ packagePath: string }} options
 * @returns {boolean}
 */
export function ossEnabled({ packagePath }) {
	return JSON.parse(fs.readFileSync(packagePath, "utf8"))["oss-docs"]?.oss !== false;
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const iconOf = (file) => (typeof file === "string" && file ? `/assets/img/${file}` : undefined);

/**
 * The layout props for an Allons-y Studio project site, from the facts `buildSite` returns and the project's `project.json`.
 * The OSS site theme's link set and texts, in English: the header's anchors, Docs, GitHub, and npm links, the footer's Project and Help groups, and the npm badges once the package is released.
 * Conduct and security links come from the project's own files first, then Allons-y Studio's policies, unless `oss` is false.
 * It never throws on missing data, so it can run in a `props` mapping.
 *
 * @param {object} [site] - What `buildSite` returns, with `npmRelease` and `badgeColor` for the badges
 * @param {object} [project] - The project's `project.json`
 * @param {{ docs?: { url: string, title: string }[], anchors?: boolean, oss?: boolean }} [options] - The docs pages, for the Docs link; whether the header links the page's sections; and whether the OSS site layer is on
 * @returns {object} Props for `norn-base` and the layouts. A mapping adds the page's own, such as `title` and `docs`.
 */
export function ossProps(site, project, { docs = [], anchors = false, oss = true } = {}) {
	const facts = isObject(site) ? site : {};
	const own = isObject(project) ? project : {};
	const features = list(own.features);
	const pages = list(docs);
	const pkg = facts.packageName || facts.name;
	const install = own.install || (pkg ? `npm install ${pkg}` : undefined);
	const color = facts.badgeColor || "2346d4";
	const conduct = facts.conductUrl || (oss ? policies.conduct : null);
	const security = facts.securityUrl || (oss ? policies.security : null);
	return {
		name: facts.name,
		tagline: facts.tagline,
		description: facts.description,
		url: facts.url ?? undefined,
		ogTitle: facts.name && facts.tagline ? `${facts.name}: ${facts.tagline}` : facts.name,
		icon: iconOf(own.favicon),
		touchIcon: iconOf(own.appleTouchIcon),
		logo: own.logo ? { src: iconOf(own.logo), alt: facts.name } : undefined,
		nav: [
			...(anchors ? [{ url: "#install", title: "Install" }] : []),
			...(anchors && own.usage ? [{ url: "#usage", title: "Usage" }] : []),
			...(anchors && features.length ? [{ url: "#features", title: "Features" }] : []),
			...(pages.length ? [{ url: pages[0].url, title: "Docs", icon: "book" }] : []),
			...(facts.repo ? [{ url: facts.repo, title: "GitHub" }] : []),
			...(facts.npm ? [{ url: facts.npm, title: "npm" }] : []),
		],
		footer: {
			name: pkg,
			text: facts.tagline ? `${facts.tagline.replace(/\.$/, "")}.` : undefined,
			badges: facts.npmRelease && pkg
				? [
					{ href: facts.npm, src: `https://img.shields.io/npm/v/${pkg}?logo=npm&labelColor=black&color=%23${color}`, alt: `npm version of ${pkg}`, width: 105, height: 20 },
					{ href: facts.npm, src: `https://img.shields.io/npm/dw/${pkg}?logo=npm&labelColor=black&color=%23${color}`, alt: `weekly npm downloads of ${pkg}`, width: 157, height: 20 },
				]
				: [],
			license: facts.license ? { name: facts.license, url: facts.licenseUrl } : undefined,
			groups: [
				{
					heading: "Project",
					links: [
						...(facts.repo ? [{ url: facts.repo, title: "GitHub" }] : []),
						...(facts.npm ? [{ url: facts.npm, title: "npm" }] : []),
						...(facts.changelogUrl ? [{ url: facts.changelogUrl, title: "Changelog" }] : []),
					],
				},
				{
					heading: "Help",
					links: [
						...(facts.issuesUrl ? [{ url: facts.issuesUrl, title: "Report an issue" }] : []),
						...(facts.contributingUrl ? [{ url: facts.contributingUrl, title: "Contributing guide" }] : []),
						...(conduct ? [{ url: conduct, title: "Code of conduct" }] : []),
						...(security ? [{ url: security, title: "Security policy" }] : []),
					],
				},
			].filter((group) => group.links.length),
		},
		lede: own.lede,
		install,
		repo: facts.repo,
		license: facts.license,
		node: facts.node ?? undefined,
		usage: isObject(own.usage) ? own.usage : undefined,
		features,
		packages: list(own.packages),
	};
}

/**
 * The OSS site theme, as an Eleventy plugin: it adds the Norn plugin with the OSS components, fills the hooks with the OSS head, banner,
 * call to action, and credit, embeds the brand tokens, sets the theme color, and copies the fonts. Add it in place of the Norn plugin, with the same options.
 *
 * @param {import("@11ty/eleventy").UserConfig} config
 * @param {object} [options] - The Norn plugin's options: `props`, `layouts`, `components`, `exclude`, `strings`, `markdown`, `defaults`, `icons`
 */
export default function oss(config, options = {}) {
	config.addPlugin(norn, {
		...options,
		components: [components, ...list(options.components)],
		defaults: { themeColor: THEME_COLOR, locale: "en_US", ...options.defaults },
	});
	fillHooks(config, {
		head: `<meta webc:is="oss-head" webc:nokeep />\n<style>${fs.readFileSync(tokens, "utf8").trim()}</style>`,
		banner: "<oss-bar></oss-bar>",
		cta: "<oss-cta></oss-cta>",
		credit: "<oss-credit></oss-credit>",
	});
	config.addPassthroughCopy({ [fonts]: "assets/fonts" });
}
