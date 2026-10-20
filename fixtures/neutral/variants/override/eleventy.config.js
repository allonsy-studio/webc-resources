/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { at, configure } from "../../site.js";

/** The same project component, with the packaged one excluded: the project's version renders. */
export default function (config) {
	return configure(config, { components: [at("variants/override/_includes/*.webc")], exclude: ["norn-content-card"], output: "_site-override" });
}
