/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Stands in for Pagefind's script, which the preview does not build an index for. `norn-search` imports its bundle,
// and when that fails it keeps the plain form. Failing here, rather than on a missing file, keeps a 404 out of the console.

throw new Error("The preview builds no Pagefind index.");
