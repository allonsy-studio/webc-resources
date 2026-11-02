---
layout: norn-docs.webc
title: Design pass
name: Design pass
url: https://example.com/docs/
themeToggle: true
nav:
  - href: /docs/
    title: Docs
  - href: https://example.com/source
    title: Source
docs:
  - href: /docs/
    title: Design pass
  - href: /docs/next/
    title: The next page
prev:
  href: /docs/before/
  title: The page before
next:
  href: /docs/next/
  title: The next page
footer:
  text: Patterns only.
  groups:
    - heading: Project
      links:
        - href: https://example.com/source
          title: Source
        - href: https://example.com/changelog
          title: Changelog
---

Body copy with `inline code`, a [link](/docs/next/), and **emphasis**.

## A second-level heading

- One [item with a link](/docs/next/)
- Another item

```sh
npm install @example/project
```

## Another section

> A quotation in the page body.

### A third-level heading

Text after the third-level heading.
