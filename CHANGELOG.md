# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `eslint` from 10.10.0 to 10.14.0

## [0.8.0] - 2026-11-08

### Added

- `generateParserFromAST(ast, options)`, exported from `@configuredthings/rdp.js/generator`: the second half of `generateParser`, for callers that already have a `GrammarAST` — for example one built from the parse tree of a parser rdp-gen itself generated.
- Bootstrap loop test (`bootstrap-loop.test.ts`): for each of the four meta-grammars, rdp-gen generates a parser, the parser reads every grammar in the repo (itself included) as raw text, the parse tree is converted to a `GrammarAST` that must equal the hand-written parser's, and generating a parser from that AST must reproduce the original generated source byte for byte. Previously only small accept/reject samples were checked. The tree-to-AST conversion lives in `src/__testUtils__/meta-tree-to-ast.ts`.
- The meta-grammars now parse real grammar files, not just comment-free, newline-free samples, so the claim in their headers that they can parse their own source text is true:
  - **Comments:** `(* ... *)` in `ebnf-meta.ebnf` / `ebnf-meta.abnf` and `;` comments in `abnf-meta.ebnf` / `abnf-meta.abnf`. EBNF comments do not nest, unlike in the hand-written `EBNFParser`.
  - **Trailing whitespace:** `ebnf-meta.ebnf` previously rejected any file ending in a newline.
  - **ABNF continuation lines (RFC 5234):** a line break followed by whitespace continues the rule, so an alternation can be written across several lines, optionally with comment lines in between. A rule starts in column 0, so an indented rule after another rule is read as a continuation of it (the hand-written `ABNFParser` accepts it as a new rule).
- `abnf-meta.abnf` now covers character-value rules (`%xNN`, `%xNN-MM`, `%xNN.MM`, `%dNN`, `%bNN` and their range/concatenation forms, with an upper- or lower-case prefix), matching `abnf-meta.ebnf`. The generated `ABNFInABNF` parser now parses `abnf-meta.abnf` itself.
- CI: `pr-checks.yml` and `release.yml` now also run [`ConfiguredThings/validate-changelog-action`](https://github.com/ConfiguredThings/validate-changelog-action), a shared Keep a Changelog linter (valid/non-duplicated `###` subsection names, a reference link for every `##` section, and a correctly-targeted `[Unreleased]` link) alongside the existing hand-rolled checks here, which only cover PR/tag-specific content.
- New `dependabot-changelog.yml` workflow: Dependabot's own PRs never touch `CHANGELOG.md`, so `pr-checks.yml`'s "Check Unreleased changelog has content" step used to skip them entirely (`if: github.actor != 'dependabot[bot]'`) rather than enforce it. This workflow closes that gap instead of working around it — on `pull_request_target` (needed since Dependabot-triggered `pull_request` events get a read-only `GITHUB_TOKEN`, which can't push), it reads the dependency bump via `dependabot/fetch-metadata`, appends a `- Bump ... from X to Y` line under `[Unreleased]`'s `### Changed`, and pushes the commit straight onto the Dependabot PR branch. The dependabot skip on the existing check is removed accordingly, so Dependabot PRs now have to carry real changelog content like any other PR.

### Fixed

- The CommonJS build could not be loaded: the package is `"type": "module"` and `dist/cjs` had no `package.json` marking it CommonJS, so Node treated those files as ES modules and every `require('@configuredthings/rdp.js')` (and each subpath) failed with `Cannot find module './...js'`. This affected every previous release. The build now writes `dist/cjs/package.json` (`{ "type": "commonjs" }`), and `npm run smoke:exports` loads every entry point in the `exports` map with both `import` and `require`; it runs in PR checks and before publishing.
- The published package included test helpers (`dist/esm/__testUtils__/`): `tsconfig.esm.json` did not exclude `src/__testUtils__/**` as `tsconfig.cjs.json` already did. One of them imports `typescript`, which is only a dev dependency. They are now excluded from the ESM build.
- Documentation: 21 `rdp-gen ... --output <file>` examples in the README and the tutorial, using-parsers, debugging, tokenising, bootstrapping and arith-example guides failed with `ERR_PARSE_ARGS_UNKNOWN_OPTION`, because `--output` was removed from the CLI (it writes to stdout unless `--outdir` is given). They now redirect stdout (`> file`). All 37 `rdp-gen` commands in the docs were run against the CLI to check. `arith-example.mdx` also described standalone `arith-evaluator.ts` / `arith-walker.ts` scaffolds that the generator no longer emits (`--traversal` alone adds stubs to the parser itself); those sections now describe what the flags really produce. `bootstrapping.mdx` documents the meta-grammars' comment and continuation-line support and the closed loop in `bootstrap-loop.test.ts`.
- Documentation site: the `ArithExample` API pages were never generated (TypeDoc listed `examples/arith/index.ts` as an entry point, but `tsconfig.json` does not include `examples/`), so every `/api/.../ArithExample.*` link was dead. TypeDoc now uses `tsconfig.typedoc.json`, which includes the examples. Two links to `Generator.GrammarAST` / `ProductionRule` used `/api/interfaces/` where these are type aliases, one pointed at a nonexistent `Grammar_AST` module, and one `#transformer-parsetree-t-and-transform` anchor in `cli.mdx` had extra hyphens; they now resolve. A crawl of the built site finds no broken internal links or fragments.
- `ebnf-meta.ebnf`, `abnf-meta.ebnf` and `ebnf-meta.abnf` accepted a grammar with no rules (`Grammar = {Rule}` / `*Rule`), which `EBNFParser` and `ABNFParser` reject; they now require at least one. The header comments in `ebnf-meta.ebnf` and `abnf-meta.*` no longer contain non-ASCII characters or a literal `(* ... *)`, neither of which the meta-grammars could parse inside a comment.
- ABNF quoted strings are case-insensitive (RFC 5234 §2.3), but generated parsers matched them case-sensitively: `ABNFParser` lowercased the string in the AST and the generated code compared exact bytes, so `method = "GET"` accepted only `get`. `ABNFParser` now keeps the grammar's case and marks strings containing letters with `caseInsensitive: true` on the `terminal` AST node; generated parsers and `GrammarInterpreter` match ASCII letters in either case, and the parse tree captures the text actually read. `%s"..."` and `caseSensitiveStrings: true` remain case-sensitive, and EBNF strings are unchanged. The `--ast-only` JSON for an ABNF grammar now contains the original-case value plus the new flag instead of a lowercased value.
- Generated `childNodes` walkers were wrong, and did not type-check, for two grammar shapes (found by finally compiling the `generate:meta` parsers): (1) an alternation containing a repetition of a sequence, e.g. `('-', Cpnt | {'.', Cpnt})`, typed `T | T[]`, was read as if it were always `T`; it now branches on `Array.isArray` and loops over the array case. (2) Alternations of several anonymous sequences were told apart by the first non-terminal field name, which is emitted once per branch even when branches share field names (children were pushed several times) and can match the wrong branch (`item1` exists in both `'(' Wsp Body Wsp ')'` and `Int Wsp '*' Wsp Primary`, so `_f0.body` was read from the wrong one and would push `undefined`). Branches with identical field names are now emitted once and the rest are selected by a field unique to each. Covered by new type-checking tests in `type-gen.test.ts`.
- `generate:meta` and `generate:examples` npm scripts failed with `ERR_PARSE_ARGS_UNKNOWN_OPTION` because they passed `--output <file>`, which `rdp-gen` no longer accepts (it writes to stdout unless `--outdir` is given). They now redirect stdout to the target file instead.
- `examples/arith` was regenerated from the current generator and the stale `arith-evaluator.ts` / `arith-walker.ts` files removed: a bare `--traversal` now mixes the traversal into the parser class rather than emitting a standalone file, so `generate:examples` no longer produces them. The facade and pipeline commands now pass `--tree-name ArithTree` so they import the same tree type `ArithParser.ts` exports, and `examples/arith/index.ts` no longer re-exports the removed `evaluate` and `walk`.
- Reverted `typescript` to `^6.0.3` again: Dependabot PR #82 re-bumped it to `^7.0.2` after the earlier downgrade, re-breaking `npm ci` on `main` (`ts-jest` peer range `>=4.3 <7`) and failing every open PR. `dependabot.yml` now ignores major `typescript` bumps until `ts-jest` supports TS7.
- `CHANGELOG.md` had a duplicate `### Changed` subsection under `## [0.3.0]` (two separate blocks instead of one) and a `[unreleased]:` reference link not matching the `## [Unreleased]` heading's case — both found by running the shared linter above against this file for the first time.
- `npm ci` failed with an ERESOLVE conflict: the root `typescript` dev dependency was bumped to `^7.0.2`, but `ts-jest@29.4.11`'s peer range (`>=4.3 <7`) doesn't support TypeScript 7 yet (checked all published `ts-jest` versions up to `29.4.12`, including the `next` tag — none support TS7), and this broke `npm ci` in CI for every PR before any test could run. Pinned `typescript` back to `^6.0.3`, the latest 6.x release, until `ts-jest` adds TS7 support.
- `npm run lint` crashed outright under `typescript@7` (a `TypeError` inside `typescript-eslint`'s `typescript-estree`), which had been masking two real `prettier/prettier` formatting errors in `docs-site/src/components/GrammarDropZone.tsx` and `src/cli/rdp-gen.ts`. Now that the `typescript` downgrade lets lint actually run, ran `eslint --fix` to clear both.
- `CHANGELOG.md` ended up with two separate `### Fixed` subsections under `## [Unreleased]` after two PRs landed back to back, each adding its own — exactly the duplicate-subsection mistake the new linter (above) is meant to catch. Merged them into one.

### Changed

- Bump `typescript` from 6.0.3 to 7.0.2
- Bump `eslint` from 10.9.1 to 10.10.0
- Bump `ConfiguredThings/validate-changelog-action` from 2 to 4
- Bump `dependabot/fetch-metadata` from 2 to 3

## [0.7.0] - 2026-04-20

### Added

- `generateScaffoldFiles(source, flags, options): Record<string, string>` — new programmatic API that returns a map of filename → content; used by the CLI when `--outdir` is given ([#25](https://github.com/ConfiguredThings/RDP.js/issues/25))
- `InterpreterMixin<TTree, TResult>` and `WalkerMixin<TTree>` exported from the main package — TypeScript mixin interfaces for interpreter and tree-walker traversal patterns

### Fixed 
- `--transformer json --facade --pipeline` now produces three separate scaffold files (`{base}-transformer.ts`, `{base}-pipeline.ts`, `{base}-facade.ts`) so the facade is a genuine module boundary; consumers import only from the facade ([#25](https://github.com/ConfiguredThings/RDP.js/issues/25))

### Changed

- `--output <file>` renamed to `--outdir <dir>` — the flag now accepts a directory; artifact filenames are derived from the parser base name (e.g. `date-facade.ts`, `date-transformer.ts`) ([#25](https://github.com/ConfiguredThings/RDP.js/issues/25))
- `--traversal` alone now adds mixin stubs directly to the generated parser file (can be re-generated freely) rather than producing a separate scaffold file. Using `--traversal` together with `--facade`, `--pipeline`, or `--transformer` still produces a scaffold file

## [0.6.0] - 2026-04-20

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
- `rdp-gen init` simplified `package.json` scripts: the scaffolded project now has a single `build: tsc` script rather than a grammar-generation step, reflecting that `init` targets hand-written parsers
- Generated parse-tree node types now use **named fields** for non-terminal references instead of positional `item0`, `item1`, … names. A field referencing rule `Year` is now typed as `year: YearNode`; terminals (string literals, char values) keep `item`_n_ names. When the same non-terminal appears more than once in a rule body all occurrences are suffixed (`year0`, `year1`, …). This is a **breaking change** for any code that accesses generated node fields by positional name ([#15](https://github.com/ConfiguredThings/RDP.js/issues/15))
- Generated parser methods now use **per-method, per-hint variable counters** instead of a single global counter. Internal variable and label names (`_pos0`, `found_alt0`, …) reset to index 0 at the start of each method, producing cleaner and more readable generated output ([#15](https://github.com/ConfiguredThings/RDP.js/issues/15))

### Removed
- `commander` dependency removed from the CLI — replaced with Node's built-in `util.parseArgs`. Turns out "zero dependencies" is easier to maintain when there actually are zero dependencies.

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

[Unreleased]: https://github.com/ConfiguredThings/RDP.js/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ConfiguredThings/RDP.js/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ConfiguredThings/RDP.js/releases/tag/v0.1.0
