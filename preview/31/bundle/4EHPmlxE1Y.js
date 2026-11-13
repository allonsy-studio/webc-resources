{
		let count = 0;

		/** Points the control's `aria-describedby` at the hint and the error that hold content, and takes the links back on removal. */
		class NornField extends HTMLElement {
			#added = [];

			connectedCallback() {
				if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => this.#link(), { once: true });
				else this.#link();
			}

			disconnectedCallback() {
				this.#unlink();
			}

			#control() {
				return this.querySelector(":scope > :is(input, textarea, select)");
			}

			#link() {
				const control = this.#control();
				if (!control || !this.isConnected) return;
				this.#unlink();
				const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
				for (const holder of this.querySelectorAll(":scope > :is([data-hint], [data-error])")) {
					const filled = holder.matches("[data-hint]") ? holder.children.length > 0 : holder.querySelector(":scope > :not([data-prefix])");
					if (!filled) continue;
					holder.id ||= `norn-field-${(count += 1)}`;
					if (ids.includes(holder.id)) continue;
					ids.push(holder.id);
					this.#added.push(holder.id);
				}
				if (ids.length) control.setAttribute("aria-describedby", ids.join(" "));
			}

			#unlink() {
				const control = this.#control();
				if (control && this.#added.length) {
					const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((id) => id && !this.#added.includes(id));
					if (ids.length) control.setAttribute("aria-describedby", ids.join(" "));
					else control.removeAttribute("aria-describedby");
				}
				this.#added = [];
			}
		}

		if (!customElements.get("norn-field")) customElements.define("norn-field", NornField);
	}