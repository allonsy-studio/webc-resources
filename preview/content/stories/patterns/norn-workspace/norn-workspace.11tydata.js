/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// The layout reads one `workspace`: the first of the sample workspaces.

export default {
	eleventyComputed: { workspace: (data) => data.workspaces[0] },
};
