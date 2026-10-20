/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import webc from "@11ty/eleventy-plugin-webc";

import { configure } from "../../site.js";

/** The project registers the WebC plugin too: the build must fail. */
export default function (config) {
	config.addPlugin(webc, { components: [] });
	return configure(config, { output: "_site-webc-twice" });
}
