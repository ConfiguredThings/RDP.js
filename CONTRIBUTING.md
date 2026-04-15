# Community & Maintainer Guide

## Branching strategy

- `main` — always releasable; direct commits are not permitted
- Feature branches — branch from `main`, open a PR, require at least one review and green CI before merge
- Release branches are not used; releases are cut directly from `main`

## PR review expectations

- All PRs must pass the required status checks defined in `.github/workflows/pr-checks.yml`
- Reviewers should check for correctness, test coverage, documentation completeness, and adherence to the TypeScript conventions described in the README
- Keep PRs focused — one concern per PR

## Updating the changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.

- All changes go into the `[Unreleased]` section as they are merged
- Use the standard subsections — add only those that have entries:
  - `Added` — new features
  - `Changed` — changes to existing behaviour
  - `Deprecated` — features that will be removed in a future release
  - `Removed` — features removed in this release
  - `Fixed` — bug fixes
  - `Security` — vulnerability fixes
- Write entries from the user's perspective, not the implementer's — describe what changed in behaviour, not which files were touched
- Each entry should be a single line; link to the relevant PR where helpful (e.g. `- Added X ([#42](https://github.com/ConfiguredThings/RDP.js/pull/42))`)
- Do not add entries for internal refactors, test changes, or CI updates that have no effect on consumers of the package

At release time the `[Unreleased]` section is moved to a versioned section — see **Cutting a release** below.

## Cutting a release

1. Ensure `main` is green and all intended changes are merged
2. Update `CHANGELOG.md`: rename `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`, add a fresh empty `[Unreleased]` section above it, and update the comparison links at the bottom
3. Bump the version in `package.json` following Semantic Versioning
4. Commit: `chore: release vX.Y.Z`
5. Tag: `git tag vX.Y.Z && git push --tags`
6. Run `npm publish` from a clean working directory (the `prepublishOnly` script enforces this)

## Contact

Engineering: engineering@configuredthings.com
