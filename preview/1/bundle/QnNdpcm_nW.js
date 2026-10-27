{
		const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
		let canvases = 0;

		/** A story's frame with its controls. Safe to connect again: the listeners go on once. */
		class PreviewCanvas extends HTMLElement {
			#wired = false;
			#observer;
			#onProps = () => this.#apply(this.querySelector("iframe"));

			connectedCallback() {
				document.addEventListener("previewpropschange", this.#onProps);
				if (this.#wired) return;
				this.#wired = true;
				const frame = this.querySelector("iframe");

				// Radios share a group by name, so each canvas names its own: two canvases on a page must not share a selection.
				const id = ++canvases;
				for (const group of this.querySelectorAll("[data-group]")) {
					for (const input of group.querySelectorAll("input")) input.name = `${group.dataset.group}-${id}`;
				}

				frame.addEventListener("load", () => this.#attach(frame));
				if (frame.contentDocument?.readyState === "complete") this.#attach(frame);

				this.addEventListener("change", (event) => {
					const group = event.target.closest("[data-group]")?.dataset.group;
					if (group === "scheme") this.#apply(frame);
					if (group === "width") {
						this.querySelector("[data-stage]").style.setProperty("--canvas-width", event.target.value || "100%");
						this.#fit(frame);
					}
				});
				this.querySelector('[data-action="axe"]').addEventListener("click", () => this.#check(frame));
			}

			disconnectedCallback() {
				document.removeEventListener("previewpropschange", this.#onProps);
				// The listeners stay on the elements they were added to. A move reloads the frame, and its `load` listener puts the observer back.
				this.#observer?.disconnect();
			}

			/** Follow the frame's height, and carry the controls into a fresh document. */
			#attach(frame) {
				const doc = frame.contentDocument;
				if (!doc?.body) return;
				this.#observer?.disconnect();
				this.#observer = new ResizeObserver(() => this.#fit(frame));
				this.#observer.observe(doc.body);
				this.#apply(frame);
				this.#fit(frame);
			}

			#fit(frame) {
				const doc = frame.contentDocument;
				if (doc) frame.style.blockSize = `${doc.documentElement.scrollHeight}px`;
			}

			/** Write the scheme and the page's property overrides into the frame's root element. */
			#apply(frame) {
				const root = frame?.contentDocument?.documentElement;
				if (!root) return;
				root.style.colorScheme = this.querySelector('[data-group="scheme"] input:checked')?.value ?? "";
				const overrides = document.querySelector("preview-props")?.values ?? new Map();
				for (const name of [...root.style].filter((name) => name.startsWith("--"))) {
					if (!overrides.has(name)) root.style.removeProperty(name);
				}
				for (const [name, value] of overrides) root.style.setProperty(name, value);
				this.#fit(frame);
			}

			/** Run axe in the frame and list what it finds. The button's icon shows the state. */
			async #check(frame) {
				const button = this.querySelector('[data-action="axe"]');
				const results = this.querySelector("[data-results]");
				button.dataset.state = "running";
				button.setAttribute("aria-busy", "true");
				results.textContent = "Checking…";
				try {
					const doc = frame.contentDocument;
					if (!frame.contentWindow.axe) {
						await new Promise((resolve, reject) => {
							const script = doc.createElement("script");
							script.src = new URL(button.dataset.axe, location.href).href;
							script.addEventListener("load", resolve);
							script.addEventListener("error", reject);
							doc.head.append(script);
						});
					}
					const { violations } = await frame.contentWindow.axe.run(doc, { runOnly: { type: "tag", values: TAGS } });
					button.dataset.state = violations.length ? "fail" : "pass";
					if (!violations.length) {
						results.textContent = "No accessibility violations found.";
						return;
					}
					const heading = document.createElement("strong");
					heading.textContent = `${violations.length} accessibility ${violations.length === 1 ? "violation" : "violations"}`;
					const list = document.createElement("ul");
					for (const violation of violations) {
						const item = document.createElement("li");
						item.textContent = `${violation.help} (${violation.id}, ${violation.impact}): ${violation.nodes.length} ${violation.nodes.length === 1 ? "element" : "elements"}`;
						list.append(item);
					}
					results.replaceChildren(heading, list);
				} catch {
					button.dataset.state = "fail";
					results.textContent = "The check could not run.";
				} finally {
					button.removeAttribute("aria-busy");
				}
			}
		}

		if (!customElements.get("preview-canvas")) customElements.define("preview-canvas", PreviewCanvas);
	}
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
				this.#build(button);
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

			/** The three texts in one cell, so the button is as wide for any of them. Safe to run again. */
			#build(button) {
				button.querySelector("[data-label]").replaceChildren(
					...["copy", "copied", "failed"].map((key) => {
						const text = document.createElement("span");
						text.dataset.text = key;
						text.textContent = this.#text(button, key);
						return text;
					}),
				);
				this.#show(button, "copy");
			}

			/** Show one text, and mark the button with the result so the icon and color follow. */
			#show(button, key) {
				for (const text of button.querySelectorAll("[data-label] > span")) text.toggleAttribute("data-active", text.dataset.text === key);
				if (key === "copy") delete button.dataset.state;
				else button.dataset.state = key;
			}

			async #copy(button) {
				const status = this.querySelector('[role="status"]');
				const { value, source } = button.dataset;
				let ok = true;
				try {
					await navigator.clipboard.writeText(value ?? document.getElementById(source)?.textContent ?? "");
				} catch {
					ok = false;
				}
				const result = ok ? "copied" : "failed";
				this.#show(button, result);
				status.textContent = this.#text(button, result);
				// The visible text is the name while it shows the result, so the name always holds the words on the button.
				button.removeAttribute("aria-labelledby");
				clearTimeout(this.#timer);
				this.#timer = setTimeout(() => {
					this.#show(button, "copy");
					status.textContent = "";
					if (this.#name) button.setAttribute("aria-labelledby", this.#name);
				}, CONFIRMATION_MS);
			}
		}

		if (!customElements.get("norn-copy-button")) customElements.define("norn-copy-button", CopyButton);
	}
{
		/** The ranges of every connected sample, by sample. The Custom Highlight API registry is shared by the page. */
		const rangesBySample = new Map();
		const painted = new Set();

		/** Color every connected sample from the ranges the build wrote. */
		const paint = () => {
			if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
			const groups = new Map();
			for (const found of rangesBySample.values()) {
				for (const [group, range] of found) groups.set(group, [...(groups.get(group) ?? []), range]);
			}
			for (const group of painted) {
				if (!groups.has(group)) CSS.highlights.delete(`tok-${group}`);
			}
			painted.clear();
			for (const [group, ranges] of groups) {
				CSS.highlights.set(`tok-${group}`, new Highlight(...ranges));
				painted.add(group);
			}
		};

		/**
		 * Code sample enhancements. The server-rendered figure, caption, and code are the whole component without a script:
		 * this adds the highlight colors, the copy button's name, and a tab stop only while the code scrolls.
		 */
		class CodeBlock extends HTMLElement {
			#observer;

			connectedCallback() {
				if (document.readyState === "loading") {
					document.addEventListener("DOMContentLoaded", () => this.isConnected && this.#enhance(), { once: true });
					return;
				}
				this.#enhance();
			}

			disconnectedCallback() {
				rangesBySample.delete(this);
				paint();
				this.#observer?.disconnect();
				this.#observer = undefined;
			}

			/** Safe to run again: a move reconnects the element. */
			#enhance() {
				const pre = this.querySelector("pre");
				if (!pre) return;
				const name = this.#name();
				this.#nameCopyButton(name);
				this.#highlight(pre.querySelector("code[data-tokens]"));
				this.#watchOverflow(pre, name);
			}

			/** What names the code: its caption, else the `label` text. Either gets an id from the texts' holder, for `aria-labelledby`. */
			#name() {
				const holder = this.querySelector(":scope > figure > span[hidden][id]");
				const named = this.querySelector(":scope > figure > figcaption") ?? this.querySelector(":scope > figure > [data-name]");
				if (named && holder) named.id ||= `${holder.id}-name`;
				return named;
			}

			/** Put the code's name in the copy button's, where it has `{name}`. Once filled, it has none left. */
			#nameCopyButton(name) {
				const label = this.querySelector(':scope > figure > [hidden] > [data-string="label"]');
				if (!label || !name) return;
				const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
				const words = name.textContent.trim();
				while (walker.nextNode()) walker.currentNode.data = walker.currentNode.data.replaceAll("{name}", words);
			}

			/** A sample whose token data is unusable stays plain. */
			#highlight(code) {
				rangesBySample.delete(this);
				try {
					const text = code?.firstChild;
					if (text) {
						rangesBySample.set(
							this,
							JSON.parse(code.dataset.tokens).map(([group, start, end]) => {
								const range = new Range();
								range.setStart(text, start);
								range.setEnd(text, end);
								return [group, range];
							}),
						);
					}
				} catch {
					rangesBySample.delete(this);
				}
				paint();
			}


			/** Keep the code a named, focusable region only while it scrolls: a tab stop is for something to scroll. */
			#watchOverflow(pre, name) {
				const fit = () => {
					if (pre.scrollWidth > pre.clientWidth) {
						pre.setAttribute("tabindex", "0");
						if (name?.id) {
							pre.setAttribute("role", "region");
							pre.setAttribute("aria-labelledby", name.id);
						}
					} else {
						pre.removeAttribute("tabindex");
						pre.removeAttribute("role");
						pre.removeAttribute("aria-labelledby");
					}
				};
				document.fonts?.ready.then(fit);
				this.#observer?.disconnect();
				if (typeof ResizeObserver === "undefined") return;
				this.#observer = new ResizeObserver(fit);
				this.#observer.observe(pre);
			}
		}

		if (!customElements.get("norn-code-block")) customElements.define("norn-code-block", CodeBlock);
	}
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