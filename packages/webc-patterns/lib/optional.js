/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Whether an optional peer package is installed. Only a package that cannot be found counts as absent.
 * A package that is installed but fails to load, because one of its own dependencies is missing, is not absent: the caller imports it next and that error is thrown.
 * Matching the error message instead would not tell the two apart, since Node names the importing file in it, and that path holds the peer's name.
 *
 * @param {string} specifier - A bare package name, such as `@allons-y/webc-code-sample`
 * @returns {boolean}
 * @throws {Error} Any resolution failure other than the package not being found
 */
export function isInstalled(specifier) {
	try {
		import.meta.resolve(specifier);
		return true;
	} catch (error) {
		if (error?.code === "ERR_MODULE_NOT_FOUND") return false;
		throw error;
	}
}
