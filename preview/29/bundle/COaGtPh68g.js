{
		/** A table box that is a named tab stop only while it scrolls. */
		class SimpleTable extends HTMLElement {
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

		if (!customElements.get("norn-simple-table")) customElements.define("norn-simple-table", SimpleTable);
	}
{
		class PreviewOverrides extends HTMLElement {
			#wired = false;
			#sync = () => this.#render();

			connectedCallback() {
				window.addEventListener("previewtokenschange", this.#sync);
				this.#render();
				if (this.#wired) return;
				this.#wired = true;
				this.addEventListener("click", (event) => {
					if (event.target.closest('[data-action="reset"]')) window.previewTokens?.reset();
				});
			}

			disconnectedCallback() {
				window.removeEventListener("previewtokenschange", this.#sync);
			}

			#render() {
				const count = Object.keys(window.previewTokens?.get() ?? {}).length;
				this.querySelector("p").hidden = count === 0;
				this.querySelector("[data-count]").textContent = count ? `${count} token ${count === 1 ? "override applies" : "overrides apply"} to every preview.` : "";
			}
		}

		if (!customElements.get("preview-overrides")) customElements.define("preview-overrides", PreviewOverrides);
	}
{
		/** The component list. Wide, its disclosure stays open, so the links are open in the page for every tool that reads it. Narrow, it closes. */
		class PreviewNav extends HTMLElement {
			#wide = window.matchMedia("(width > 48rem)");
			#sync = () => {
				const disclosure = this.querySelector(":scope > nav > details");
				if (disclosure) disclosure.open = this.#wide.matches;
			};

			connectedCallback() {
				this.#wide.addEventListener("change", this.#sync);
				this.#sync();
			}

			disconnectedCallback() {
				this.#wide.removeEventListener("change", this.#sync);
			}
		}

		if (!customElements.get("preview-nav")) customElements.define("preview-nav", PreviewNav);
	}