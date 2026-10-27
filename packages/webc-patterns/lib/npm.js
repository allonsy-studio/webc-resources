/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";

/** How long a registry answer is reused. */
const CACHE_MS = 60 * 60 * 1000;

/** Registry answers by package name: `{ at, released }`. */
const cache = new Map();

/**
 * Whether the package has a release on npm: a `latest` dist-tag. A missing package, a private one, or no network counts as no release.
 *
 * @param {string | null | undefined} packageName
 * @param {{ fetch?: typeof globalThis.fetch, now?: () => number }} [options] - A fetch to use instead of the global one, and a clock, for tests
 * @returns {Promise<boolean>}
 */
export async function npmRelease(packageName, { fetch = globalThis.fetch, now = Date.now } = {}) {
	if (!packageName || typeof fetch !== "function") return false;
	const hit = cache.get(packageName);
	if (hit && now() - hit.at < CACHE_MS) return hit.released;
	let released;
	try {
		// The abbreviated document still has `dist-tags`, without the metadata of every version.
		const response = await fetch(`https://registry.npmjs.org/${packageName.replace("/", "%2F")}`, { signal: AbortSignal.timeout(5000), headers: { accept: "application/vnd.npm.install-v1+json" } });
		released = response.ok && typeof (await response.json())?.["dist-tags"]?.latest === "string";
	} catch {
		released = false;
	}
	cache.set(packageName, { at: now(), released });
	return released;
}

/**
 * The project accent as six hex digits, for the badge color: the first `--norn-ui-accent: #rrggbb` in a stylesheet.
 *
 * @param {string} cssPath
 * @returns {string | null} Null when the file or the declaration is missing
 */
export function accentHex(cssPath) {
	if (!fs.existsSync(cssPath)) return null;
	const match = fs.readFileSync(cssPath, "utf8").match(/--norn-ui-accent:\s*#([0-9a-f]{6})\b/i);
	return match ? match[1].toLowerCase() : null;
}
