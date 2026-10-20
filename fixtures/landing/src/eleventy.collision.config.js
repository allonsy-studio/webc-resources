/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import path from "node:path";

import { configure } from "./eleventy.config.js";

const here = path.relative(process.cwd(), import.meta.dirname) || ".";

/** A project component named like a locked studio component: the build must fail.
 *
 * @param {import("@11ty/eleventy").UserConfig} config */
export default function (config) {
	return configure(config, [path.posix.join(here.split(path.sep).join("/"), "_collision/*.webc")]);
}
