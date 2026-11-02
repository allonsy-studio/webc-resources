/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import js from "@allons-y/opx-lint-js/eslint.config.js";
import json from "@allons-y/opx-lint-json/eslint.config.js";
import md from "@allons-y/opx-lint-md/eslint.config.js";
import licenseHeader from "eslint-plugin-license-header";

/** Required at the top of every `.js` file. */
const header = [
	"/*",
	" * SPDX-License-Identifier: MPL-2.0",
	" * This Source Code Form is subject to the terms of the Mozilla Public",
	" * License, v. 2.0. If a copy of the MPL was not distributed with this",
	" * file, You can obtain one at https://mozilla.org/MPL/2.0/.",
	" */",
];

export default [
	...js,
	...json,
	...md,
	{ ignores: ["**/_site*/**"] },
	// GitHub alerts, which `callouts` renders, read as link labels.
	{ files: ["**/*.md"], rules: { "markdown/no-missing-label-refs": ["error", { allowLabels: ["!NOTE", "!TIP", "!IMPORTANT", "!WARNING", "!CAUTION"] }] } },
	// Fixture pages are test input: fences without a language are deliberate.
	{ files: ["fixtures/**/*.md"], rules: { "markdown/fenced-code-language": "off" } },
	{
		files: ["fixtures/*/build.test.js", "preview/build.test.js"],
		languageOptions: { globals: { CSS: "readonly", customElements: "readonly", document: "readonly", getComputedStyle: "readonly", localStorage: "readonly", navigator: "readonly", window: "readonly" } },
	},
	{
		files: ["preview/content/assets/*.js"],
		languageOptions: { globals: { CSSStyleSheet: "readonly", CustomEvent: "readonly", document: "readonly", localStorage: "readonly", window: "readonly" } },
	},
	{
		files: ["fixtures/lib/browser.js"],
		languageOptions: { globals: { axe: "readonly", document: "readonly", getComputedStyle: "readonly" } },
	},
	{
		files: ["**/*.js"],
		plugins: { "license-header": licenseHeader },
		rules: { "license-header/header": ["error", header] },
	},
];
