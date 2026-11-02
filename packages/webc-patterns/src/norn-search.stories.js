/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-search",
	component: "norn-search",
	argTypes: {
		bundle: { description: "Pagefind's script. Pass `url('/pagefind/pagefind.js')` under a path prefix." },
		action: { description: "Where the plain form sends the query." },
		site: { description: "The site's host, sent with the plain form as `sites`, to keep results on the site." },
		label: { description: 'The field\'s label, the button\'s text, and the landmark\'s name, as one element. Falls back to "Search".' },
		none: { description: 'The status when nothing matches. Falls back to "No results".' },
		"results-one": { description: 'The status for a count in the `one` plural category, with `{count}` for the number. Falls back to "{count} result", or to `results-other` when the site\'s strings set only that.' },
		"results-other": { description: 'The status for any other count. Falls back to "{count} results".' },
		"results-zero": { description: "The status for the `zero` category." },
		"results-two": { description: "The status for the `two` category." },
		"results-few": { description: "The status for the `few` category." },
		"results-many": { description: "The status for the `many` category." },
	},
	parameters: {
		docs: {
			description: {
				component:
					"Site search: a search landmark with a field that lists results as the visitor types, from a Pagefind index. Without a script, or before the index is built, it is a plain form that searches the site on the web: `@action` with the query as `q`, limited to `@site`. The field has a magnifier at its start, and its label as the placeholder once the script runs. The results float over the page on a raised surface. The status texts are in the page, hidden, and the script shows them. Each falls back to the site's `componentStrings`, then English. The script picks the status for a count by the plural rules of the nearest `lang`, with `Intl.PluralRules`, and formats the number for it. An empty form falls back to `results-other`. Build the index with Pagefind after Eleventy. Results read their title and excerpt from the index; the excerpt keeps only Pagefind's `<mark>` highlights.",
			},
		},
	},
};
