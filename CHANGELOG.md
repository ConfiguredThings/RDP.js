# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `rdp-gen init` now emits a starter `src/<ClassName>.ts` alongside `package.json` and `tsconfig.json`, scaffolding the private-constructor / static-`parse` boilerplate so a new project compiles immediately ([#13](https://github.com/ConfiguredThings/RDP.js/issues/13))
- `rdp-gen init --observable` variant extends `ObservableRDParser` instead of `RDParser`; the starter includes `notifyEnter`/`notifyExit` call sites and accepts an optional `ParseObserver` parameter in `static parse()`

### Changed
- `rdp-gen init` simplified `package.json` scripts: the scaffolded project now has a single `build: tsc` script rather than a grammar-generation step, reflecting that `init` targets hand-written parsers

## [0.2.0] - 2026-04-16

### Added
- Added integration tests that type-check generated parser output using the TypeScript compiler API (`ts.createProgram`) under `strict: true` and `noUncheckedIndexedAccess`, covering terminals, sequences, alternations, optional/repetition constructs, non-terminal references, observable mode, and ABNF grammars.
- Dependabot configuration to track npm dependencies (root package only) and GitHub Actions versions

### Changed
- `SECURITY.md` — added Scope section clarifying that only library runtime dependencies are in scope; docs-site build-toolchain vulnerabilities are explicitly out of scope

### Fixed
- `rdp-gen` now emits `(A | B | C)[]` instead of `A | B | C[]` when a repetition (`*`, `+`, or `m*n`) repeats a mixed-type alternation. The previous output was parsed by TypeScript as `A | B | (C[])`, causing type errors under `strict: true`. ([#3](https://github.com/ConfiguredThings/RDP.js/issues/3))

## [0.1.0] - 2026-04-15

### Added
- `RDParser` — base class for writing recursive descent parsers in TypeScript, with buffer management and position tracking
- `ObservableRDParser` — extends `RDParser` with opt-in parse tracing via an attached `ParseObserver`
- `TraceObserver` and `DebugObserver` — built-in observer implementations for collecting and printing parse traces
- `rdp-gen` CLI — reads an ISO 14977 EBNF or RFC 5234 ABNF grammar file and emits a fully typed TypeScript parser class
- `GrammarInterpreter` — runtime interpreter that executes a grammar directly from its AST without a code-generation step
- `EBNFParser` and `ABNFParser` — parse EBNF and ABNF grammar source into a `GrammarAST`
- `generateParser` — programmatic API for generating parser source from a grammar string
- Dual ESM/CJS package with full TypeScript declarations
- Bootstrapping meta-grammars: EBNF and ABNF formats each described in both EBNF and ABNF (`src/grammars/`)
- Left-recursion detection at grammar compilation time

[unreleased]: https://github.com/ConfiguredThings/RDP.js/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ConfiguredThings/RDP.js/releases/tag/v0.1.0
