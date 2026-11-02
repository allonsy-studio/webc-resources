/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/*
 * Optional data builders for a project site: facts from package.json and project.json, one entry per workspace, the npm release check,
 * and the accent for badges. A project maps what they return to the layout props through the Norn plugin's `props`.
 */

export { accentHex, npmRelease } from "./lib/npm.js";
export { buildSite } from "./lib/site.js";
export { buildWorkspaces } from "./lib/workspaces.js";
