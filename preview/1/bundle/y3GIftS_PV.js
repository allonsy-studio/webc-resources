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
{
		const PAIR = /^light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i;
		let context;

		/** The hex a color token resolves to in a scheme, whatever its default or override is written as. */
		const resolve = (token, scheme) => {
			const probe = document.createElement("span");
			probe.style.cssText = `position: absolute; visibility: hidden; color-scheme: ${scheme}; color: var(${token})`;
			document.body.append(probe);
			const color = getComputedStyle(probe).color;
			probe.remove();
			context ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = "#000000";
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			return `#${[...context.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
		};

		class PreviewTokens extends HTMLElement {
			#wired = false;
			#sync = () => this.#render();

			connectedCallback() {
				window.addEventListener("previewtokenschange", this.#sync);
				this.#render();
				if (this.#wired) return;
				this.#wired = true;
				this.addEventListener("input", (event) => {
					const field = event.target.closest("[data-token]");
					if (!field) return;
					if (field.type === "color") {
						const [light, dark] = ["light", "dark"].map((scheme) => field.closest("[data-pair]").querySelector(`[data-scheme="${scheme}"]`).value);
						window.previewTokens?.set(field.dataset.token, `light-dark(${light}, ${dark})`);
					} else {
						window.previewTokens?.set(field.dataset.token, field.value);
					}
				});
				this.addEventListener("click", (event) => {
					const clear = event.target.closest('[data-action="clear"]');
					if (clear) window.previewTokens?.set(clear.dataset.token, "");
					if (event.target.closest('[data-action="reset"]')) window.previewTokens?.reset();
				});
			}

			disconnectedCallback() {
				window.removeEventListener("previewtokenschange", this.#sync);
			}

			/** Show what is saved: in every field except the one being used, and in the status line. */
			#render() {
				const tokens = window.previewTokens?.get() ?? {};
				for (const pair of this.querySelectorAll("[data-pair]")) {
					const token = pair.querySelector("[data-token]").dataset.token;
					const saved = PAIR.exec(tokens[token] ?? "");
					for (const field of pair.querySelectorAll('input[type="color"]')) {
						if (field === document.activeElement) continue;
						field.value = saved ? saved[field.dataset.scheme === "light" ? 1 : 2] : resolve(token, field.dataset.scheme);
					}
					pair.querySelector('[data-action="clear"]').disabled = !(token in tokens);
				}
				for (const field of this.querySelectorAll('input[type="text"][data-token]')) {
					if (field !== document.activeElement) field.value = tokens[field.dataset.token] ?? "";
				}
				const count = Object.keys(tokens).length;
				this.querySelector("[data-status]").textContent = count ? `${count} ${count === 1 ? "override" : "overrides"} saved in this browser.` : "No overrides saved.";
			}
		}

		if (!customElements.get("preview-tokens")) customElements.define("preview-tokens", PreviewTokens);
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