# Contributing to Allons-y Studio

First off, thank you! 🎉 _Allons-y_ means "let's go," & we're glad you're
going there with us. This guide explains how to contribute across all of our
repositories. Individual projects may add their own `CONTRIBUTING.md` with
project-specific details; when they do, that file takes precedence.

## Code of Conduct

This project & everyone participating in it is governed by our
[Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to
uphold it. Please report unacceptable behavior to **report@allons-y.studio**.

## Ways to contribute

You don't have to write code to make a difference:

- 🐛 **Report bugs.** Open an issue with clear reproduction steps.
- ✨ **Suggest features.** Tell us about the problem you're trying to solve.
- 📚 **Improve docs.** Typos, clarifications, & examples are always welcome.
- 🧪 **Triage issues.** Reproduce reports, confirm bugs, suggest labels.
- 💬 **Help others.** Answer questions in Discussions.

## Reporting bugs & requesting features

Please use our [issue templates](https://github.com/allonsy-studio/webc-resources/issues/new/choose).
Before opening a new issue, search existing ones to avoid duplicates.

## Development workflow

1. **Fork** the repository and clone your fork.
2. **Create a branch** from `main` using a descriptive name:
   - `fix/short-description` for bug fixes
   - `feat/short-description` for features
   - `docs/short-description` for documentation
3. **Make your changes** in small, focused commits.
4. **Test** your changes locally and add tests where appropriate.
5. **Lint & format** before committing (see the project's README for commands).
6. **Open a pull request** against `main` and fill out the PR template.

### Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```md
type(scope): short summary

[optional body]
[optional footer]
```

Common types:

| Type       | When to use                                 |
| ---------- | ------------------------------------------- |
| `feat`     | A new feature (triggers a minor release)    |
| `fix`      | A bug fix (triggers a patch release)        |
| `docs`     | Documentation changes only                  |
| `test`     | Adding or updating tests                    |
| `refactor` | Code restructuring without behavior change |
| `chore`    | Tooling, config, dependency updates         |

A `BREAKING CHANGE:` footer or a `!` after the type (e.g. `feat!:`) triggers a major release.

### Pull request guidelines

- Keep PRs focused: one logical change per PR is easiest to review.
- Reference the issue your PR addresses (`Closes #123`).
- Make sure CI passes and there are no new warnings or accessibility regressions.
- Be responsive to review feedback; we aim to be too.

## Accessibility

Accessibility is a requirement, not a nice-to-have. Changes that affect the UI
should preserve or improve keyboard support, focus management, color contrast,
& screen-reader behavior.

## License

Unless a repository states otherwise, contributions are accepted under that
repository's license. By submitting a contribution, you agree that it may be
distributed under those terms.

## Questions?

Open a [discussion](https://github.com/orgs/allonsy-studio/discussions) or see
[SUPPORT.md](SUPPORT.md). Thanks again for contributing! 💜
