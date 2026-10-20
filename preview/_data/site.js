/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import path from "node:path";

import { buildSite } from "@allons-y/webc-patterns/project";
import { host } from "@allons-y/webc-oss-site";

/** The sample site facts the layout stories show, built the way an Allons-y Studio project's are. */
export default () =>
	buildSite({
		packagePath: path.resolve(import.meta.dirname, "../package.json"),
		projectPath: path.resolve(import.meta.dirname, "project.json"),
		host,
	});
