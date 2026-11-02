/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// A stand-in for Pagefind's script whose results carry long, accented strings.

const PAGES = [
	{
		url: "/docs/one/",
		meta: { title: "Un titre de résultat extraordinairement long, avec des accents comme écoresponsabilité et hétérogénéité" },
		excerpt: "Un extrait de résultat qui contient le mot <mark>composant</mark> et continue sur de nombreuses lignes, avec un identifiant sans espace nornAccordionGroupAvecUnNomBeaucoupTropLongPourTenirSurUneSeuleLigne.",
	},
	{
		url: "/docs/two/",
		meta: { title: "Électroencéphalographiquement" },
		excerpt: "Un second <mark>composant</mark> dont l’extrait est tout aussi long, avec https://example.com/une/adresse/tres/longue/qui/ne/contient/aucune/espace/du/tout.",
	},
];

export async function options() {}

export async function debouncedSearch(query) {
	const term = query.toLowerCase();
	const hits = PAGES.filter((page) => `${page.meta.title} ${page.excerpt}`.toLowerCase().includes(term));
	return { results: hits.map((page) => ({ data: async () => page })) };
}
