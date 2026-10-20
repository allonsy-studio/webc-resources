/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import fs from "node:fs";
import path from "node:path";

import hostedGitInfo from "hosted-git-info";
import { minVersion, validRange } from "semver";

/** Where a project may keep its own policy files, in the order they are looked for. */
const POLICY_DIRS = ["", ".github", "docs"];

/** @param {string} file */
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** Lowest major in an engines range, as `24+`; null when unbounded. */
function minimumVersion(range) {
	if (!validRange(range)) return null;
	const { major } = minVersion(range);
	return major ? `${major}+` : null;
}

/** First sentence, minus the period. */
const firstSentence = (text) => text.split(/(?<=\.)\s/)[0].replace(/\.$/, "");

/**
 * The blob URL of a policy file the project keeps, or null.
 *
 * @param {string} root - The project root
 * @param {string} repo - The repository's browse URL
 * @param {string} name - A file name, such as `SECURITY.md`
 * @returns {string | null}
 */
function policyUrl(root, repo, name) {
	const found = POLICY_DIRS.map((dir) => path.posix.join(dir, name)).find((file) => fs.existsSync(path.join(root, ...file.split("/"))));
	return found ? `${repo}/blob/main/${found}` : null;
}

/**
 * Site facts from the project's `package.json` and `project.json`, for a project's mapping to the layout props.
 *
 * @param {{ packagePath: string, projectPath?: string, host?: string }} options - The two files, and a host that serves the site at one path per repository, such as `https://example.github.io`, for the URL when `project.json` sets none
 * @returns {Record<string, string | null>} The site facts
 * @throws {Error} When the package has no name, license, description, or repository, or its repository is not a hosted Git URL
 */
export function buildSite({ packagePath, projectPath, host }) {
	const pkg = readJson(packagePath);
	const project = projectPath && fs.existsSync(projectPath) ? readJson(projectPath) : {};
	for (const key of ["name", "license", "description"]) {
		if (typeof pkg[key] !== "string" || !pkg[key]) {
			throw new Error(`${packagePath} has no \`${key}\`. The site's facts are resolved from it: set it there.`);
		}
	}
	const raw = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
	if (!raw) throw new Error(`${packagePath} has no \`repository\`. The site's links are resolved from it.`);
	const info = hostedGitInfo.fromUrl(raw);
	if (!info) throw new Error(`${packagePath} has a \`repository\` that is not a hosted Git URL: ${raw}`);

	const repo = info.browse();
	const repoName = repo.split("/").pop();
	const root = path.dirname(packagePath);

	return {
		name: pkg.name.split("/").pop(),
		packageName: pkg.name,
		tagline: project.tagline ?? firstSentence(pkg.description),
		description: pkg.description,
		license: pkg.license,
		licenseUrl: `${repo}/blob/main/LICENSE`,
		repo,
		repoName,
		npm: pkg.private ? null : `https://www.npmjs.com/package/${pkg.name}`,
		node: minimumVersion(pkg.engines?.node),
		url: project.url ? project.url.replace(/\/?$/, "/") : host ? `${host.replace(/\/$/, "")}/${repoName}/` : null,
		issuesUrl: pkg.bugs?.url ?? `${repo}/issues`,
		contributingUrl: `${repo}/blob/main/.github/CONTRIBUTING.md`,
		changelogUrl: `${repo}/blob/main/CHANGELOG.md`,
		conductUrl: policyUrl(root, repo, "CODE_OF_CONDUCT.md"),
		securityUrl: policyUrl(root, repo, "SECURITY.md"),
	};
}
