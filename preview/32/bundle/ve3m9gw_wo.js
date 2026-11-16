{
		/** Marks the link to the last section heading scrolled past, or the first one. */
		class Toc extends HTMLElement {
			#observer;
			#onScroll;

			connectedCallback() {
				const links = [...this.querySelectorAll('a[href^="#"]')];
				// A link's hash is percent-encoded and an id is not, but an id may hold a literal `%`: try the decoded hash, then the hash as written.
				const heading = (link) => {
					const hash = link.hash.slice(1);
					try {
						return document.getElementById(decodeURIComponent(hash)) ?? document.getElementById(hash);
					} catch {
						return document.getElementById(hash);
					}
				};
				const sections = links.map((link) => [link, heading(link)]).filter(([, target]) => target);
				if (!sections.length) return;
				const mark = () => {
					const line = innerHeight * 0.25;
					const [current] = sections.findLast(([, target]) => target.getBoundingClientRect().top <= line) ?? sections[0];
					for (const link of links) {
						if (link === current) link.setAttribute("aria-current", "location");
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