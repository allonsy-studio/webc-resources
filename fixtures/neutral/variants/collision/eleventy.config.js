/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { at, configure } from "../../site.js";

/** A project component named like a packaged one, with nothing excluded: the build must fail. */
export default function (config) {
	return configure(config, { components: [at("variants/collision/_includes/*.webc")], output: "_site-collision" });
}
