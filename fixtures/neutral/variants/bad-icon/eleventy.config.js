/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { at, configure } from "../../site.js";

/** The neutral site over a content folder of its own, so the page the test writes never reaches a build that runs beside it. */
export default function (config) {
	const options = configure(config, { output: "_site-bad-icon" });
	return { ...options, dir: { ...options.dir, input: at("variants/bad-icon/content") } };
}
