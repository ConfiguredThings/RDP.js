# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ScannerlessRDParser` — concrete character-by-character parser, extracted from `RDParser`. Replaces direct `RDParser` extension for scannerless grammars.
- `TokenRDParser` and `TokenStream` — new parser variant that operates over a pre-tokenised token stream rather than raw bytes.
- `withObservable(Base)` — mixin function that adds `ParseObserver` support to any `RDParser` subclass (e.g. `withObservable(TokenRDParser)`).
- `--scaffold` now accepts a `--lexer span` flag, emitting a span-tokeniser and classifier pipeline scaffold.

### Changed

- `RDParser` is now an **abstract base class**. It no longer contains character-reading methods (`peek`, `advance`, `matchChar`, etc.) — those live on `ScannerlessRDParser`. Existing parsers that extended `RDParser` directly must switch to `ScannerlessRDParser`.
- `ObservableRDParser` now extends `ScannerlessRDParser` instead of `RDParser`.
- `ScaffoldFlags` type replaced the previous scaffold option shape with orthogonal flags (`traversal`, `transformer`, `facade`, `pipeline`, `lexer`). Invalid combinations (e.g. `--traversal interpreter --pipeline` without `--facade`) now throw at codegen time.
- Generated parser scaffolds reference `ScannerlessRDParser` instead of `RDParser` (except `--lexer span` scaffolds, which use `TokenRDParser`).

## [0.5.0] - 2026-04-19

### Added

- `Transformer<Union, T>` type and `transform()` function exported from the main package — like `Visitor` but with **required** keys, giving a compile-time exhaustiveness guarantee that every `kind` in the union has a handler.
- `JSONAST` discriminated union type (`string | number | boolean | null | array | object`), plus `toJSONAST` and `fromJSONAST` helpers, exported from the main package — a typed representation of JSON values for use as a `Transformer` target when translating a DSL to JSON.
- `--scaffold transformer` — emits an exhaustive `Transformer<ParseTree, T>` object with one stub per grammar rule, plus a convenience `transform<Base>(input)` wrapper.
- `--scaffold json-transformer` — emits two transformer stubs (`<base>ToJSON: Transformer<ParseTree, JSONAST>` and `jsonTo<Base>: Transformer<JSONAST, string>`) and round-trip helpers (`<base>ToJSONString` / `jsonStringTo<Base>`) for two-way translation between the grammar's format and JSON.

## [0.4.0] - 2026-04-17

### Added

- `--scaffold` now accepts a composable `--inner <strategy>` option that specifies the traversal strategy embedded inside `facade` and `pipeline` wrappers. Eight combinations are now available: two standalone (`interpreter`, `tree-walker`) and six composable (`facade --inner interpreter`, `facade --inner tree-walker`, `facade --inner pipeline:interpreter`, `facade --inner pipeline:tree-walker`, `pipeline --inner interpreter`, `pipeline --inner tree-walker`). `facade` and `pipeline` require `--inner`; `interpreter` and `tree-walker` forbid it.
- `ScaffoldInner` type (`'interpreter' | 'tree-walker' | 'pipeline:interpreter' | 'pipeline:tree-walker'`) exported from `@configuredthings/rdp.js/generator` for use with the programmatic `generateScaffold` API.

### Changed

- `childNodes` helper is now **always emitted** alongside the generated parser; the `--walker` flag has been removed. There is no longer any reason to pass a separate flag to get tree-walking support.
- `--scaffold evaluator` renamed to `--scaffold interpreter` to align with standard language-implementation terminology.
- `--scaffold walker` renamed to `--scaffold tree-walker`; `--inner walker` renamed to `--inner tree-walker`; `--inner pipeline:walker` renamed to `--inner pipeline:tree-walker`.

### Removed

- `--walker` flag removed from `rdp-gen <grammar>` documentation and generated output. `childNodes` is unconditionally emitted; `--walker` is silently accepted and ignored for backwards compatibility.

## [0.3.0] - 2026-04-16

### Added

- `src/grammars/arith.ebnf` — canonical arithmetic expression grammar (with whitespace handling, operator precedence, and parenthesised sub-expressions) used throughout worked examples; exported as `arithEBNF` from `@configuredthings/rdp.js/grammars`
- `src/examples/arith/` — complete worked example: generated `ArithParser` (with `childNodes` walker), all four scaffold files (`arith-evaluator`, `arith-facade`, `arith-pipeline`, `arith-walker`), grammar AST export, and TypeDoc entry point. Documented as the `ArithExample` API module
- `npm run generate:examples` — regenerates all files in `src/examples/arith/` from `arith.ebnf` via the built CLI; follows the same pattern as `generate:meta`
- `src/__testUtils__/generator-runtime.ts` — shared test helpers (`transpile`, `compileAndImport`, `importScaffold`, `nav`) extracted from duplicate definitions across generator test files
- Evaluator scaffold now emits `// node.field: Type` inline comments in each stub function body, showing the exact node shape without requiring users to cross-reference the generated types file
- New guide page "Worked Example: Arithmetic Parser" covering the full lifecycle from grammar to generated parser to all four scaffold patterns; linked from README, CLI reference, and Using the Parse Tree
- `rdp-gen init` now emits a starter `src/<ClassName>.ts` alongside `package.json` and `tsconfig.json`, scaffolding the private-constructor / static-`parse` boilerplate so a new project compiles immediately ([#13](https://github.com/ConfiguredThings/RDP.js/issues/13))
- `rdp-gen init --observable` variant extends `ObservableRDParser` instead of `RDParser`; the starter includes `notifyEnter`/`notifyExit` call sites and accepts an optional `ParseObserver` parameter in `static parse()`
- `rdp-gen generate --scaffold <pattern>` emits a one-time starter file for a chosen usage pattern (not regenerated; edit freely). Four patterns are available: `evaluator` (a typed function per grammar rule), `facade` (domain error class, public entry point, transform stub), `pipeline` (parse / validate / transform stage stubs), `walker` (a `walk()` utility built on `childNodes`) ([#17](https://github.com/ConfiguredThings/RDP.js/issues/17))
- `rdp-gen generate --walker` appends a `childNodes(node: ParseTree): ParseTree[]` helper to the generated parser file, returning the direct `ParseTree` children of any node — useful for tree walkers, linters, and formatters ([#17](https://github.com/ConfiguredThings/RDP.js/issues/17))
- `Visitor<Union, T>` type and `visit()` function exported from the main package — dispatch a parse-tree node to the matching handler in a visitor map without writing explicit `switch` statements; use `Required<Visitor<ParseTree, T>>` to enforce exhaustive handling ([#17](https://github.com/ConfiguredThings/RDP.js/issues/17))

### Changed
- `npm run diagrams` replaced by `docs-site/scripts/render-diagrams.sh` — auto-discovers all `.puml` files rather than requiring each to be listed explicitly
- Architecture diagram restructured so `grammar.ebnf → Toolchain (build-time) → Your parsers` reads left-to-right; `skinparam linetype ortho` eliminates curved arc arrows throughout
- `cli.mdx` EBNF grammar examples and `RailroadDiagram` component now import `arithEBNF` from `@configuredthings/rdp.js/grammars` rather than inlining the grammar text
- Internal cross-links added throughout the guide (LL(1) → Concepts, `--observable` → Debugging, TypeDoc API links for key types and functions)
- CI: `pr-checks.yml` and `docs.yml` now verify that committed files in `src/examples/` match `npm run generate:examples` output, failing with a diff if they drift

### Removed
- `commander` dependency removed from the CLI — replaced with Node's built-in `util.parseArgs`. Turns out "zero dependencies" is easier to maintain when there actually are zero dependencies.

### Changed
- `rdp-gen init` simplified `package.json` scripts: the scaffolded project now has a single `build: tsc` script rather than a grammar-generation step, reflecting that `init` targets hand-written parsers
- Generated parse-tree node types now use **named fields** for non-terminal references instead of positional `item0`, `item1`, … names. A field referencing rule `Year` is now typed as `year: YearNode`; terminals (string literals, char values) keep `item`_n_ names. When the same non-terminal appears more than once in a rule body all occurrences are suffixed (`year0`, `year1`, …). This is a **breaking change** for any code that accesses generated node fields by positional name ([#15](https://github.com/ConfiguredThings/RDP.js/issues/15))
- Generated parser methods now use **per-method, per-hint variable counters** instead of a single global counter. Internal variable and label names (`_pos0`, `found_alt0`, …) reset to index 0 at the start of each method, producing cleaner and more readable generated output ([#15](https://github.com/ConfiguredThings/RDP.js/issues/15))

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

[unreleased]: https://github.com/ConfiguredThings/RDP.js/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ConfiguredThings/RDP.js/releases/tag/v0.1.0
