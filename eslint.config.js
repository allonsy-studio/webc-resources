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
	{ ignores: ["**/_site*/**"] },
	...js,
	...json,
	...md,
	{
		files: ["**/*.js"],
		plugins: { "license-header": licenseHeader },
		rules: { "license-header/header": ["error", header] },
	},
	// GitHub alerts read as link labels.
	{ files: ["**/*.md"], rules: { "markdown/no-missing-label-refs": ["error", { allowLabels: ["!NOTE", "!TIP", "!IMPORTANT", "!WARNING", "!CAUTION"] }] } },
];
