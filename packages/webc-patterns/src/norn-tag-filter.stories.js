/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Container/norn-tag-filter",
	component: "norn-tag-filter",
	argTypes: {
		default: { description: 'The tags and the items they filter: `norn-tag`s with `@href` and `@tag`, and elements with `data-tags`, a space-separated list such as `data-tags="css html"`. Often a list of tags, then a list of items.' },
		clear: { description: 'The text of the button that turns every filter off, as one element. Falls back to the site\'s `componentStrings`, then "Clear filters".' },
		"shown-one": { description: 'The status after a change, for a count in the `one` plural category, with `{count}` for the number of items shown. Falls back to "{count} item shown", or to `shown-other` when the site\'s strings set only that.' },
		"shown-other": { description: 'The status for any other count. Falls back to "{count} items shown".' },
		"shown-zero": { description: "The status for the `zero` category." },
		"shown-two": { description: "The status for the `two` category." },
		"shown-few": { description: "The status for the `few` category." },
		"shown-many": { description: "The status for the `many` category." },
	},
	parameters: {
		docs: {
			description: {
				component: "Filters a list by its tags. Without a script the tags stay links, such as to each tag's page. With one, every `norn-tag` inside that has `@tag` becomes a toggle button. Several can be on at once, and an item shows when it carries any active tag. Nothing on shows everything, so there is no \"All\" tag. While any filter is on, a button turns them all off, and after each change a status message says how many items show, by the plural rules of the nearest `lang`. The texts are in the page, hidden, and the script reads them.",
			},
		},
	},
};

export const Default = {
	args: {
		default:
			'<ul role="list"><li><norn-tag @href="#css" @tag="css">CSS</norn-tag></li><li><norn-tag @href="#html" @tag="html">HTML</norn-tag></li><li><norn-tag @href="#a11y" @tag="a11y">Accessibility</norn-tag></li></ul>\n<ul><li data-tags="css">Logical properties</li><li data-tags="html a11y">Native dialogs</li><li data-tags="css a11y">Forced colors</li></ul>',
	},
};
