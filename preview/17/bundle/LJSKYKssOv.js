{
		const KEY = "color-scheme";
		const SCHEMES = ["light", "dark"];
		let toggles = 0;

		/** The saved choice, or "" for the system. Storage can be blocked: then there is no saved choice. */
		const saved = () => {
			try {
				const value = localStorage.getItem(KEY);
				return SCHEMES.includes(value) ? value : "";
			} catch {
				return "";
			}
		};

		const save = (value) => {
			try {
				if (value) localStorage.setItem(KEY, value);
				else localStorage.removeItem(KEY);
			} catch {
				// Not saved: the choice holds for this page only.
			}
		};

		const apply = (value) => {
			if (value) document.documentElement.style.colorScheme = value;
			else document.documentElement.style.removeProperty("color-scheme");
		};

		/** The option each input stands for, by value. */
		const OPTIONS = { light: "light", "": "system", dark: "dark" };

		/** Keeps the page's color scheme and every toggle in step with the visitor's choice. */
		class ThemeToggle extends HTMLElement {
			#wired = false;
			#sync = () => this.#show(saved());
			#onStorage = (event) => {
				if (event.key !== KEY && event.key !== null) return;
				apply(saved());
				this.#show(saved());
			};

			connectedCallback() {
				document.addEventListener("themetogglechange", this.#sync);
				window.addEventListener("storage", this.#onStorage);
				if (!this.#wired) {
					this.#wired = true;
					// A radio group is shared by name across the page, so each toggle names its own.
					const name = `${KEY}-${++toggles}`;
					for (const input of this.querySelectorAll("input")) input.name = name;
					this.#name();
					this.addEventListener("change", (event) => {
						const value = SCHEMES.includes(event.target.value) ? event.target.value : "";
						save(value);
						apply(value);
						document.dispatchEvent(new CustomEvent("themetogglechange"));
					});
				}
				apply(saved());
				this.#show(saved());
			}

			disconnectedCallback() {
				document.removeEventListener("themetogglechange", this.#sync);
				window.removeEventListener("storage", this.#onStorage);
			}

			/** Show the names the page holds: the group's in the legend, each option's as its text and title. */
			#name() {
				const text = (key) => this.querySelector(`:scope > [hidden] > [data-string="${key}"]`)?.textContent.trim() ?? "";
				const legend = this.querySelector("legend");
				if (legend) legend.textContent = text("label");
				for (const input of this.querySelectorAll("input")) {
					const label = input.closest("label");
					const words = text(OPTIONS[input.value]);
					if (!label || !words) continue;
					label.title = words;
					const span = label.querySelector(":scope > span");
					if (span) span.textContent = words;
				}
			}

			#show(value) {
				for (const input of this.querySelectorAll("input")) input.checked = input.value === value;
			}
		}

		if (!customElements.get("norn-theme-toggle")) customElements.define("norn-theme-toggle", ThemeToggle);
	}