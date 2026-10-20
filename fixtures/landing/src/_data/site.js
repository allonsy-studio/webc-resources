/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import path from "node:path";

import { buildSite } from "@allons-y/webc-patterns/project";
import { host } from "@allons-y/webc-studio";

export default () =>
	buildSite({
		packagePath: process.env.SITE_PACKAGE_JSON ?? path.resolve(import.meta.dirname, "../../package.json"),
		projectPath: path.join(import.meta.dirname, "project.json"),
		host,
	});
