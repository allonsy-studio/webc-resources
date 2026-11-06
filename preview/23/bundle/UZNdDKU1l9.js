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
		const supported = typeof CSS !== "undefined" && "highlights" in CSS;

		/**
		 * Read `data-tokens`: `[groups, numbers]`, the group names, then a group index, the gap from the previous range's end, and a length per range.
		 *
		 * @param {string} tokens
		 * @returns {[string, number, number][]}
		 */
		const decode = (tokens) => {
			const [groups, numbers] = JSON.parse(tokens);
			const ranges = [];
			let end = 0;
			for (let at = 0; at < numbers.length; at += 3) {
				const group = groups[numbers[at]];
				const start = end + numbers[at + 1];
				end = start + numbers[at + 2];
				if (typeof group !== "string" || !Number.isInteger(start) || !(end > start)) throw new TypeError("Unusable data-tokens");
				ranges.push([group, start, end]);
			}
			return ranges;
		};

		/** Add a sample's ranges to the page's highlights, one group at a time, so each connect costs only its own ranges. */
		const paint = (sample, found) => {
			rangesBySample.set(sample, found);
			if (!supported) return;
			for (const [group, range] of found) {
				const name = `tok-${group}`;
				if (!CSS.highlights.has(name)) CSS.highlights.set(name, new Highlight());
				CSS.highlights.get(name).add(range);
			}
		};

		/** Take a sample's ranges back out, and drop a group left empty. */
		const unpaint = (sample) => {
			const found = rangesBySample.get(sample);
			rangesBySample.delete(sample);
			if (!found || !supported) return;
			for (const [group, range] of found) {
				const name = `tok-${group}`;
				const highlight = CSS.highlights.get(name);
				highlight?.delete(range);
				if (highlight?.size === 0) CSS.highlights.delete(name);
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
				unpaint(this);
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
				unpaint(this);
				try {
					const text = code?.firstChild;
					if (text) {
						paint(
							this,
							decode(code.dataset.tokens).map(([group, start, end]) => {
								const range = new Range();
								range.setStart(text, start);
								range.setEnd(text, end);
								return [group, range];
							}),
						);
					}
				} catch {
					unpaint(this);
				}
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