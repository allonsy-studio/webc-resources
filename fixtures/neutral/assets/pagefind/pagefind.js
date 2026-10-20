/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// A stand-in for Pagefind's script, with the two calls norn-search makes.

const PAGES = [
	{ url: "/docs/one/", meta: { title: "First page" }, excerpt: "The <mark>first</mark> page &amp; its <b>body</b>." },
	{ url: "/docs/two/", meta: { title: "Second page" }, excerpt: "After the <mark>first</mark> one." },
	{ url: "/plain/", meta: { title: "Plain page" }, excerpt: "No components." },
];

export async function options() {}

export async function debouncedSearch(query) {
	const term = query.toLowerCase();
	const hits = PAGES.filter((page) => `${page.meta.title} ${page.excerpt}`.toLowerCase().includes(term));
	return { results: hits.map((page) => ({ data: async () => page })) };
}
