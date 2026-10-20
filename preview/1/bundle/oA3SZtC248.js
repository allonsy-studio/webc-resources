{
		const LIMIT = 8;
		const DELAY_MS = 200;

		/** Pagefind's excerpt as nodes: text, and `<mark>` for its highlights. Anything else stays text. */
		const excerpt = (html) =>
			html.split(/(<mark>.*?<\/mark>)/).map((part) => {
				const holder = document.createElement("template");
				holder.innerHTML = part.replace(/<\/?mark>/g, "");
				const text = holder.content.textContent;
				if (!part.startsWith("<mark>")) return document.createTextNode(text);
				const mark = document.createElement("mark");
				mark.textContent = text;
				return mark;
			});

		/** Live results from a Pagefind index. Without one, the form searches the web. */
		class SiteSearch extends HTMLElement {
			#wired = false;
			#pagefind;
			#latest = 0;

			async connectedCallback() {
				if (this.#wired) return;
				this.#wired = true;
				const search = this.querySelector("search");
				try {
					this.#pagefind = await import(new URL(search.dataset.bundle, document.baseURI).href);
					await this.#pagefind.options?.({ excerptLength: 20 });
				} catch {
					return;
				}
				this.dataset.live = "";
				const input = this.querySelector('input[type="search"]');
				input.addEventListener("input", () => this.#search(input.value));
				this.querySelector("form").addEventListener("submit", (event) => {
					event.preventDefault();
					this.querySelector("ol a")?.focus();
				});
			}

			async #search(query) {
				const run = ++this.#latest;
				const list = this.querySelector("ol");
				const status = this.querySelector('[role="status"]');
				if (!query.trim()) {
					list.hidden = true;
					list.replaceChildren();
					status.textContent = "";
					return;
				}
				const found = await this.#pagefind.debouncedSearch(query, {}, DELAY_MS);
				if (found === null || run !== this.#latest) return;
				const pages = await Promise.all(found.results.slice(0, LIMIT).map((result) => result.data()));
				if (run !== this.#latest) return;
				list.replaceChildren(
					...pages.map((page) => {
						const item = document.createElement("li");
						const link = document.createElement("a");
						link.href = page.url;
						link.textContent = page.meta?.title || page.url;
						const text = document.createElement("p");
						text.append(...excerpt(page.excerpt ?? ""));
						item.append(link, text);
						return item;
					}),
				);
				list.hidden = !pages.length;
				const total = found.results.length;
				status.textContent = total ? this.#count(total) : this.#string("none");
			}

			/** One of the status texts the page holds, or "" when its slot and fallback are empty. */
			#string(key) {
				return this.querySelector(`search > [hidden] > [data-string="${key}"]`)?.textContent.trim() ?? "";
			}

			/** The status for a count, in the plural form and number format of the nearest `lang`. */
			#count(total) {
				const lang = this.closest("[lang]")?.lang || undefined;
				let category = "other";
				let number = String(total);
				try {
					category = new Intl.PluralRules(lang).select(total);
					number = new Intl.NumberFormat(lang).format(total);
				} catch {
					// An invalid lang keeps the defaults.
				}
				return (this.#string(`results-${category}`) || this.#string("results-other")).replaceAll("{count}", number);
			}
		}

		if (!customElements.get("norn-search")) customElements.define("norn-search", SiteSearch);
	}
{
		/** Marks the link to the last section heading scrolled past, or the first one. */
		class Toc extends HTMLElement {
			#observer;
			#onScroll;

			connectedCallback() {
				const links = [...this.querySelectorAll('a[href^="#"]')];
				const targets = links.map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1)))).filter(Boolean);
				if (!targets.length) return;
				const mark = () => {
					const line = innerHeight * 0.25;
					const current = targets.findLast((target) => target.getBoundingClientRect().top <= line) ?? targets[0];
					for (const link of links) {
						if (link.hash.slice(1) === current.id) link.setAttribute("aria-current", "location");
						else link.removeAttribute("aria-current");
					}
				};
				this.#teardown();
				this.#onScroll = () => requestAnimationFrame(mark);
				addEventListener("scroll", this.#onScroll, { passive: true });
				this.#observer = new ResizeObserver(this.#onScroll);
				this.#observer.observe(document.documentElement);
				mark();
			}

			disconnectedCallback() {
				this.#teardown();
			}

			#teardown() {
				if (this.#onScroll) removeEventListener("scroll", this.#onScroll);
				this.#observer?.disconnect();
			}
		}

		if (!customElements.get("norn-toc")) customElements.define("norn-toc", Toc);
	}
{
		/** A table box that is a named tab stop only while it scrolls. */
		class DataTable extends HTMLElement {
			#observer;

			connectedCallback() {
				const box = this.querySelector(":scope > div");
				if (!box || typeof ResizeObserver === "undefined") return;
				const label = this.querySelector(":scope > span[hidden][id]");
				const caption = box.querySelector("caption");
				if (caption && label) caption.id ||= `${label.id}-caption`;
				const named = label?.textContent.trim() ? label : caption?.textContent.trim() ? caption : undefined;
				const headings = [...this.querySelectorAll("thead th")].map((cell) => cell.textContent.trim()).filter(Boolean);
				const fit = () => {
					if (box.scrollWidth > box.clientWidth) {
						box.setAttribute("tabindex", "0");
						if (named) {
							box.setAttribute("role", "region");
							box.setAttribute("aria-labelledby", named.id);
						} else if (headings.length) {
							box.setAttribute("role", "region");
							box.setAttribute("aria-label", headings.join(", "));
						}
					} else {
						box.removeAttribute("tabindex");
						box.removeAttribute("role");
						box.removeAttribute("aria-labelledby");
						box.removeAttribute("aria-label");
					}
				};
				this.#observer?.disconnect();
				// The box keeps its width when the table grows, so watch both.
				this.#observer = new ResizeObserver(fit);
				this.#observer.observe(box);
				const table = box.querySelector("table");
				if (table) this.#observer.observe(table);
			}

			disconnectedCallback() {
				this.#observer?.disconnect();
				this.#observer = undefined;
			}
		}

		if (!customElements.get("norn-data-table")) customElements.define("norn-data-table", DataTable);
	}