/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-link-button",
	component: "norn-link-button",
	argTypes: {
		href: { description: "The link's URL.", control: "text", type: { name: "string", required: true }, table: { category: "props" } },
		variant: {
			description: "`primary`, a filled accent; `secondary`, a 1px outline; or `quiet`, text with no border.",
			control: "select",
			options: ["primary", "secondary", "quiet"],
			table: { category: "props", type: { summary: "string" }, defaultValue: { summary: "primary" } },
		},
		default: { description: "The link text, which may hold a `norn-icon`.", control: "text", table: { category: "slots" } },
		"--norn-link-button-accent": { description: "Primary background.", control: "color", table: { category: "css custom properties", defaultValue: { summary: "--norn-ui-accent" } } },
		"--norn-link-button-on-accent": { description: "Primary text.", control: "color", table: { category: "css custom properties", defaultValue: { summary: "--norn-text-on-accent, then Canvas" } } },
		"--norn-link-button-link": { description: "Secondary and quiet text.", control: "color", table: { category: "css custom properties", defaultValue: { summary: "--norn-text-accent" } } },
		"--norn-link-button-border": { description: "Secondary border color.", control: "color", table: { category: "css custom properties", defaultValue: { summary: "--norn-text-accent" } } },
		"--norn-link-button-border-width": { description: "Border width.", control: "text", table: { category: "css custom properties", defaultValue: { summary: "1px" } } },
		"--norn-link-button-radius": { description: "Corner radius.", control: "text", table: { category: "css custom properties", defaultValue: { summary: "--norn-ui-border-radius" } } },
	},
	parameters: {
		docs: {
			description: {
				component: "A link styled as a button, for a call to action. It navigates, so it stays a link: use a `<button>` for an action on the page. The default slot is the link text, and may hold a `norn-icon`. A hover and a press take a layer of the text color over the background, and the text is never underlined.",
			},
		},
	},
};

export const Default = { args: { href: "#start", default: "Get started" } };

export const Icon = { name: "With an icon", args: { href: "#next", default: 'Next step <norn-icon @name="arrow-end"></norn-icon>' } };
