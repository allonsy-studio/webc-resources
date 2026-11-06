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