{
		const CONFIRMATION_MS = 2000;

		/** Copies its value, or its target's text, and says how that went, in the texts the page holds. */
		class CopyButton extends HTMLElement {
			#wired = false;
			#timer;
			#name = "";

			connectedCallback() {
				const button = this.querySelector("button");
				if (!button || typeof navigator.clipboard?.writeText !== "function") return;
				const name = this.#string(button, "label");
				this.#name = name?.id && name.textContent.trim() ? name.id : "";
				if (this.#name) button.setAttribute("aria-labelledby", this.#name);
				button.querySelector("span").textContent = this.#text(button, "copy");
				button.hidden = false;
				if (this.#wired) return;
				this.#wired = true;
				button.addEventListener("click", () => this.#copy(button));
			}

			disconnectedCallback() {
				clearTimeout(this.#timer);
			}

			/** The element holding one of the texts: in this component, or in the one `data-strings` names. */
			#string(button, key) {
				const holder = button.dataset.strings ? document.getElementById(button.dataset.strings) : this.querySelector(":scope > span[hidden]");
				return holder?.querySelector(`[data-string="${key}"]`);
			}

			#text(button, key) {
				return this.#string(button, key)?.textContent.trim() ?? "";
			}

			async #copy(button) {
				const label = button.querySelector("span");
				const status = this.querySelector('[role="status"]');
				const { value, source } = button.dataset;
				let ok = true;
				try {
					await navigator.clipboard.writeText(value ?? document.getElementById(source)?.textContent ?? "");
				} catch {
					ok = false;
				}
				const said = this.#text(button, ok ? "copied" : "failed");
				label.textContent = said;
				status.textContent = said;
				// The visible text is the name while it shows the result, so the name always holds the words on the button.
				button.removeAttribute("aria-labelledby");
				clearTimeout(this.#timer);
				this.#timer = setTimeout(() => {
					label.textContent = this.#text(button, "copy");
					status.textContent = "";
					if (this.#name) button.setAttribute("aria-labelledby", this.#name);
				}, CONFIRMATION_MS);
			}
		}

		if (!customElements.get("norn-copy-button")) customElements.define("norn-copy-button", CopyButton);
	}