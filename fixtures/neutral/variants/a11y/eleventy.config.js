/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { configure } from "../../site.js";

/** The neutral site with its own output folder, so `a11y.test.js` can build beside the other test files. */
export default function (config) {
	return configure(config, { output: "_site-a11y" });
}
