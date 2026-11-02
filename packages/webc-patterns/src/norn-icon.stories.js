/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-icon",
	component: "norn-icon",
	// The size cells of the matrix need an icon to draw.
	args: { name: "check" },
	argTypes: {
		name: { description: "A project icon, or a built-in icon." },
		size: { description: "`s`, the default, is --norn-ui-icon-s, which is 1em and follows the text. `m` is --norn-ui-icon-m, for an icon beside a heading or a title. Another value fails the build." },
		label: { description: "The icon's name, as one element, read but not shown. Leave it out for a decorative icon." },
	},
	parameters: {
		docs: {
			description: {
				component:
					"Inline SVG icon from a small built-in set or the project's own, drawn in `currentColor` at 1em. Project icons come from the Norn plugin's `icons` option, which registers them through the `nornIcons` helper. A project icon with a built-in's name replaces it. Without the plugin, only the built-in set is available. A project icon keeps its own `viewBox` (else one from a numeric `width` and `height`, else `0 0 24 24`) and paint, so draw it with `currentColor` to follow the text color. A file with no paint at all is filled with `currentColor`. Decorative by default: the drawing is always hidden from assistive tech. When the icon carries meaning on its own, put its name in the `label` slot, as `<span slot=\"label\">Warning</span>`: it renders as visually hidden text beside the drawing, so it is read as text, in a link or button name too. WebC can't tell whether a slot has content, so the drawing stays `aria-hidden` either way and an empty slot adds nothing to read. Directional icons (`arrow-start`, `arrow-end`, `chevron-end`, and a project icon set to `mirror`) mirror in a right-to-left context.",
			},
		},
	},
};
