/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { configure } from "../../site.js";

/** A project layout named like a shipped one: the build must fail. */
export default function (config) {
	return configure(config, { output: "_site-same-name", layouts: "../variants/same-name/_layouts" });
}
