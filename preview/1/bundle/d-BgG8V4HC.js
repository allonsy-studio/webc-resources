{
		/** Marks the link to the last section heading scrolled past, or the first one. */
		class Toc extends HTMLElement {
			#observer;
			#onScroll;

			connectedCallback() {
				const links = [...this.querySelectorAll('a[href^="#"]')];
				const targets = links.map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1)))).filter(Boolean);
				if (!targets.length) return;
				const mark = () => {
					const line = innerHeight * 0.25;
					const current = targets.findLast((target) => target.getBoundingClientRect().top <= line) ?? targets[0];
					for (const link of links) {
						if (link.hash.slice(1) === current.id) link.setAttribute("aria-current", "location");
						else link.removeAttribute("aria-current");
					}
				};
				this.#teardown();
				this.#onScroll = () => requestAnimationFrame(mark);
				addEventListener("scroll", this.#onScroll, { passive: true });
				this.#observer = new ResizeObserver(this.#onScroll);
				this.#observer.observe(document.documentElement);
				mark();
			}

			disconnectedCallback() {
				this.#teardown();
			}

			#teardown() {
				if (this.#onScroll) removeEventListener("scroll", this.#onScroll);
				this.#observer?.disconnect();
			}
		}

		if (!customElements.get("norn-toc")) customElements.define("norn-toc", Toc);
	}