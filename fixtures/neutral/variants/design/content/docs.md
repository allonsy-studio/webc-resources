---
layout: norn-docs.webc
title: Design pass
name: Design pass
url: https://example.com/docs/
themeToggle: true
nav:
  - url: /docs/
    title: Docs
  - url: https://example.com/source
    title: Source
docs:
  - url: /docs/
    title: Design pass
  - url: /docs/next/
    title: The next page
prev:
  url: /docs/before/
  title: The page before
next:
  url: /docs/next/
  title: The next page
footer:
  text: Patterns only.
  groups:
    - heading: Project
      links:
        - url: https://example.com/source
          title: Source
        - url: https://example.com/changelog
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
