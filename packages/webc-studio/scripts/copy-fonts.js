/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Copy the org's self-hosted fonts into the package. Run by `prepack`.

import fs from "node:fs";
import path from "node:path";

import { readAsset } from "./lib.js";

const FONTS = path.join(import.meta.dirname, "..", "fonts");
const FILES = ["instrument-sans-italic-var.woff2", "instrument-sans-var.woff2", "pt-mono.woff2", "yellowtail.woff2"];

for (const name of FILES) fs.writeFileSync(path.join(FONTS, name), await readAsset("fonts", name));
