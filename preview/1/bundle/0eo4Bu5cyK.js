{
		/** The overrides table. Holds the values the canvases read, and tells them when one changes. */
		class PreviewProps extends HTMLElement {
			#wired = false;

			/** Every filled field, by property name. A color field counts once it has been used. */
			get values() {
				const values = new Map();
				for (const field of this.querySelectorAll("input[data-prop]")) {
					const value = field.value.trim();
					if (field.type === "color" ? field.dataset.touched === "true" : value !== "") values.set(field.dataset.prop, value);
				}
				return values;
			}

			connectedCallback() {
				if (this.#wired) return;
				this.#wired = true;
				this.addEventListener("input", (event) => {
					const field = event.target.closest("input[data-prop]");
					if (!field) return;
					if (field.type === "color") field.dataset.touched = "true";
					this.#changed();
				});
				this.addEventListener("click", (event) => {
					const reset = event.target.closest('[data-action="reset"]');
					if (!reset) return;
					const field = this.querySelector(`input[data-prop="${reset.dataset.prop}"]`);
					field.value = field.type === "color" ? field.defaultValue : "";
					delete field.dataset.touched;
					this.#changed();
					field.focus();
				});
			}

			#changed() {
				const values = this.values;
				for (const reset of this.querySelectorAll('[data-action="reset"]')) reset.disabled = !values.has(reset.dataset.prop);
				document.dispatchEvent(new CustomEvent("previewpropschange"));
			}
		}

		if (!customElements.get("preview-props")) customElements.define("preview-props", PreviewProps);
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