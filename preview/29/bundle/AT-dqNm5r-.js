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