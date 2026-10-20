/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Token overrides for the preview. Every page loads this in its head: the overrides saved from the Foundations page apply before first paint.
// They live in localStorage under one key, so a change in one tab reaches the other open tabs and frames through the `storage` event.

(() => {
	const KEY = "norn-preview-tokens";
	const PREFIX = "--norn-";

	/** The adopted sheet holds one `:root` rule. Setting a property through the CSSOM parses one value, so a stored value can't break out of it. */
	const sheet = new CSSStyleSheet();
	sheet.insertRule(":root {}");
	const rule = sheet.cssRules[0];
	document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

	/** Kept in memory too, for a browser that blocks storage. */
	let state = {};

	const load = () => {
		try {
			const stored = JSON.parse(localStorage.getItem(KEY));
			return stored && typeof stored === "object" ? stored : {};
		} catch {
			return state;
		}
	};

	const save = () => {
		try {
			if (Object.keys(state).length) localStorage.setItem(KEY, JSON.stringify(state));
			else localStorage.removeItem(KEY);
		} catch {
			// Storage is blocked: the overrides last for this page only.
		}
	};

	const apply = () => {
		rule.style.cssText = "";
		for (const [name, value] of Object.entries(state)) rule.style.setProperty(name, value);
		window.dispatchEvent(new CustomEvent("previewtokenschange"));
	};

	window.previewTokens = {
		/** @returns {Record<string, string>} A copy of the saved overrides */
		get: () => ({ ...state }),

		/**
		 * @param {string} name - An `--norn-` token
		 * @param {string} value - Any CSS value; empty clears the override
		 */
		set(name, value) {
			if (!name.startsWith(PREFIX)) return;
			if (value.trim()) state[name] = value.trim();
			else delete state[name];
			save();
			apply();
		},

		reset() {
			state = {};
			save();
			apply();
		},
	};

	window.addEventListener("storage", (event) => {
		if (event.key !== KEY && event.key !== null) return;
		state = load();
		apply();
	});

	state = load();
	apply();
})();
