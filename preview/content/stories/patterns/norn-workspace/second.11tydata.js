/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// The second of the sample workspaces, so the sidebar's second link has a page to open.

export default {
	eleventyComputed: { workspace: (data) => data.workspaces[1] },
};
