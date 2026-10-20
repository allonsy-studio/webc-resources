/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { configure, STRINGS } from "../../site.js";

/** Strings far longer than the defaults, for the page under test: the skip link, the header's navigation name, and the footer's. */
const LONG = {
	fr: {
		...STRINGS.fr,
		"norn-skip-link": { label: "Sauter directement au contenu principal, sans la navigation." },
		"norn-header": { label: "Navigation principale du laboratoire et de ses ressources associées" },
		"norn-base": { footer: "Liens du projet, regroupés par thème et par usage" },
	},
};

/** The neutral site with its own output folder and long strings, so `long-text.test.js` can build beside the other test files. */
export default function (config) {
	return configure(config, { strings: LONG, output: "_site-long-text" });
}
