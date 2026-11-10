{
		const PILL = "norn-tag > a[data-tag]";

		/** Turns the tags inside it into toggles that show only the items carrying any active tag. */
		class TagFilter extends HTMLElement {
			#active = new Set();
			#hidden = new Set();
			#pills = [];
			#ready;
			#onClick = (event) => this.#click(event);
			#onKey = (event) => this.#key(event);
			#onClear = () => this.#clear();

			connectedCallback() {
				if (document.readyState === "loading") {
					this.#ready = () => this.#setup();
					document.addEventListener("DOMContentLoaded", this.#ready, { once: true });
				} else this.#setup();
			}

			disconnectedCallback() {
				if (this.#ready) document.removeEventListener("DOMContentLoaded", this.#ready);
				this.#ready = undefined;
				this.removeEventListener("click", this.#onClick);
				this.removeEventListener("keydown", this.#onKey);
				this.#button()?.removeEventListener("click", this.#onClear);
				for (const pill of this.#pills) {
					pill.removeAttribute("role");
					pill.removeAttribute("aria-pressed");
				}
				for (const item of this.#hidden) item.hidden = false;
				this.#hidden.clear();
				this.#active.clear();
				this.#pills = [];
				const button = this.#button();
				if (button) button.hidden = true;
			}

			#setup() {
				this.#ready = undefined;
				this.#pills = [...this.querySelectorAll(PILL)];
				for (const pill of this.#pills) {
					pill.setAttribute("role", "button");
					pill.setAttribute("aria-pressed", String(this.#active.has(pill.dataset.tag)));
				}
				const button = this.#button();
				if (button) button.textContent = this.#string("clear");
				this.addEventListener("click", this.#onClick);
				this.addEventListener("keydown", this.#onKey);
				button?.addEventListener("click", this.#onClear);
				this.#apply(false);
			}

			#button() {
				return this.querySelector(":scope > button[data-clear]");
			}

			#string(key) {
				return this.querySelector(`:scope > span[data-strings] [data-string="${key}"]`)?.textContent.trim() ?? "";
			}

			#pill(event) {
				const pill = event.target.closest?.(PILL);
				return pill && this.#pills.includes(pill) ? pill : undefined;
			}

			#click(event) {
				const pill = this.#pill(event);
				if (!pill) return;
				event.preventDefault();
				const { tag } = pill.dataset;
				if (this.#active.has(tag)) this.#active.delete(tag);
				else this.#active.add(tag);
				this.#apply(true);
			}

			/** A link answers Enter; a button also answers Space. */
			#key(event) {
				if (event.key !== " " || !this.#pill(event)) return;
				event.preventDefault();
				event.target.click();
			}

			#clear() {
				this.#active.clear();
				this.#apply(true);
				this.#pills[0]?.focus();
			}

			#apply(announce) {
				for (const pill of this.#pills) pill.setAttribute("aria-pressed", String(this.#active.has(pill.dataset.tag)));
				let shown = 0;
				for (const item of this.querySelectorAll("[data-tags]")) {
					const match = !this.#active.size || item.dataset.tags.split(/\s+/).some((tag) => this.#active.has(tag));
					if (match) {
						if (this.#hidden.delete(item)) item.hidden = false;
						if (!item.hidden) shown++;
					} else if (!item.hidden) {
						item.hidden = true;
						this.#hidden.add(item);
					}
				}
				const button = this.#button();
				if (button) button.hidden = !this.#active.size;
				const status = this.querySelector(":scope > span[data-status]");
				if (status && announce) status.textContent = this.#count(shown);
			}

			/** The status for a count, in the plural form and number format of the nearest `lang`. */
			#count(total) {
				const lang = this.closest("[lang]")?.lang || undefined;
				let category = total === 1 ? "one" : "other";
				let number = String(total);
				try {
					category = new Intl.PluralRules(lang).select(total);
					number = new Intl.NumberFormat(lang).format(total);
				} catch {
					// An invalid lang keeps the defaults.
				}
				return (this.#string(`shown-${category}`) || this.#string("shown-other")).replaceAll("{count}", number);
			}
		}

		if (!customElements.get("norn-tag-filter")) customElements.define("norn-tag-filter", TagFilter);
	}