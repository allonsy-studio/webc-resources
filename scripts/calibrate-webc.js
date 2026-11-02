/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Compare what the analyzer derives from each source with what its docs say: the CSF file where there is one,
// else the JSDoc. Prints a Markdown table of every difference. Run `node scripts/calibrate-webc.js`.
// A custom property a component owns is a failure in components.test.js, so only a documented one the code does not read is listed here.

import fs from "node:fs";
import path from "node:path";

import { csfFile, effectiveArgTypes, parseDoc, readCsf } from "../preview/lib/catalog.js";
import { analyzeFile, derivedArgTypes, helperNames, sourceFiles } from "./analyze-webc.js";
import { PACKAGES, readTokens } from "./build-components.js";

/** The coarse type a JSDoc or CSF type names. */
const coarse = (type = "") => {
	const text = type.trim();
	if (!text) return "";
	if (/\[\]$/.test(text)) return "array";
	if (/^\{/.test(text)) return "object";
	if (/^"/.test(text)) return "string";
	return text.split("|")[0].trim();
};

/**
 * The documented API of a source: props with type, default, and whether required, slots, and custom properties.
 * A CSF file is read with the derived argTypes under it, as the preview reads it, so a difference there is an override.
 *
 * @param {string} file
 * @param {ReturnType<typeof analyzeFile>} analysis
 */
async function documented(file, analysis) {
	const layout = path.basename(path.dirname(file)) === "layouts";
	const name = path.basename(file, ".webc");
	const packageDir = path.join(PACKAGES, path.relative(PACKAGES, file).split(path.sep)[0]);
	const stories = csfFile(packageDir, name, layout);
	if (!file.includes(`${path.sep}fallback${path.sep}`) && fs.existsSync(stories)) {
		const argTypes = effectiveArgTypes(derivedArgTypes(analysis), (await readCsf(stories)).meta.argTypes);
		const of = (category) => Object.entries(argTypes).filter(([, argType]) => argType.table?.category === category);
		return {
			source: "CSF",
			props: of("props").map(([prop, argType]) => ({ name: prop, type: coarse(argType.table?.type?.summary ?? argType.type?.name), default: argType.table?.defaultValue?.summary, required: argType.type?.required === true, options: argType.options })),
			slots: of("slots").map(([slot]) => slot),
			cssprops: of("css custom properties").map(([prop]) => prop),
		};
	}
	const doc = parseDoc(fs.readFileSync(file, "utf8"));
	return {
		source: "JSDoc",
		props: doc.props.map(({ name: prop, type, optional, description }) => ({ name: prop, type: coarse(type), default: description.match(/Falls back to <code>([^<]+)<\/code>/)?.[1] ?? description.match(/(\d) to \d\. (?:Anything else falls|Falls) back to (\d)/)?.[2], required: !optional })),
		slots: doc.slots.map(({ name: slot }) => slot),
		cssprops: doc.cssprops.map(({ name: prop }) => prop),
	};
}

/**
 * Every difference between the analysis and the docs of each source, as table rows.
 *
 * @returns {Promise<string[][]>} Rows of component, fact, derived, documented
 */
export async function differences() {
	const tokens = readTokens();
	const helpers = helperNames();
	const rows = [];
	for (const file of sourceFiles()) {
		const component = path.relative(PACKAGES, file).replace(/\/src\//, "/");
		const analysis = analyzeFile(file, { tokens, helpers });
		const doc = await documented(file, analysis);
		const row = (fact, derived, written) => rows.push([`${component} (${doc.source})`, fact, derived, written]);
		const docProps = new Map(doc.props.map((entry) => [entry.name, entry]));
		for (const prop of analysis.props) {
			const written = docProps.get(prop.name);
			if (!written) {
				row(`prop ${prop.name}`, "found", "not documented");
				continue;
			}
			if (prop.type && written.type && prop.type !== written.type) row(`prop ${prop.name} type`, prop.type, written.type);
			if (!prop.type && written.type) row(`prop ${prop.name} type`, "none", written.type);
			if (String(prop.default ?? "") !== String(written.default ?? "")) row(`prop ${prop.name} default`, String(prop.default ?? "none"), String(written.default ?? "none"));
			if (Boolean(prop.required) !== written.required) row(`prop ${prop.name} required`, String(Boolean(prop.required)), String(written.required));
			if (written.options && JSON.stringify(written.options) !== JSON.stringify(prop.options)) row(`prop ${prop.name} options`, JSON.stringify(prop.options ?? null), JSON.stringify(written.options));
			if (!written.options && prop.options) row(`prop ${prop.name} options`, JSON.stringify(prop.options), "none listed as options");
		}
		for (const name of docProps.keys()) if (!analysis.props.some((prop) => prop.name === name)) row(`prop ${name}`, "not found", "documented");
		const slots = analysis.slots.map(({ name }) => name);
		for (const slot of slots) if (!doc.slots.includes(slot)) row(`slot ${slot}`, "found", "not documented");
		for (const slot of doc.slots) if (!slots.includes(slot)) row(`slot ${slot}`, "not found", "documented");
		const owned = analysis.owned.map(({ name }) => name);
		for (const prop of doc.cssprops) if (!owned.includes(prop)) row(`custom property ${prop}`, analysis.tokens.some(({ name }) => name === prop) ? "a global token" : "not read", "documented");
	}
	return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
	const rows = await differences();
	console.log("| Component | Fact | Derived | Documented |\n| --- | --- | --- | --- |");
	for (const row of rows) console.log(`| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`);
	console.log(`\n${rows.length} differences`);
}
