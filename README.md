# RDP.js

![projectmascot](recursquirrel.svg)

A minimal, typed base class for writing recursive descent parsers in TypeScript — plus an optional grammar interpreter and a code generator (`rdp-gen`) that produces typed parser classes from EBNF or ABNF grammars.

## What is `@configuredthings/rdp.js`?

A minimal, typed base class that handles buffer management and position tracking so subclasses can focus purely on grammar rules. TypeScript, dual ESM/CJS, zero runtime dependencies.

Key components:
- **`RDParser`** — base class; subclass and implement each production rule as a method
- **`rdp-gen`** — CLI; reads an ISO 14977 EBNF or RFC 5234 ABNF grammar file and emits a fully typed TypeScript parser class
- **`GrammarInterpreter`** — runtime interpreter; execute grammars without a code-generation step
- **`ObservableRDParser`** — opt-in parse tracing via an attached `ParseObserver`

## LL(1) grammars and backtracking

> [!IMPORTANT]
> **`rdp-gen` generates parsers that assume LL(1) grammars.** Feeding it a non-LL(1) grammar will produce a parser that silently returns incorrect results, not a helpful error — with one exception: left recursion is detected at generation time and rejected.

**What LL(1) means:** the parser scans left-to-right (first L), produces the leftmost derivation (second L), and needs only one byte of lookahead (the 1) to decide which production to apply at each step. Grammars where two alternatives share a common prefix, or where a rule is ambiguous, are not LL(1).

**The base class is more general.** `RDParser` exposes `restorePosition`, which allows hand-written subclasses to implement backtracking and parse grammars beyond LL(1). `rdp-gen` does not emit backtracking code — that is a hand-crafting concern.

Left recursion can always be eliminated by rewriting the grammar to use iteration (`{...}` / `A, {A}`), which is what LL(1) grammars require.

## Quick start — scaffold a new project

```bash
npm install -g @configuredthings/rdp.js
mkdir my-parser && cd my-parser
rdp-gen init --name my-parser
npm install
```

## Manual setup

Install: `npm install @configuredthings/rdp.js`

Required `tsconfig.json` options:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "moduleResolution": "node16"
  }
}
```

- `target: ES2022` — required for native `#` private fields
- `strict: true` — generated code is written to strict standards
- `noUncheckedIndexedAccess: true` — all array accesses are null-aware
- `moduleResolution: node16` or `bundler` — required for the package exports map

## Documentation

Full documentation is at [configuredthings.github.io/RDP.js](https://configuredthings.github.io/RDP.js), including:

- [Tutorial: arithmetic parser with rdp-gen](https://configuredthings.github.io/RDP.js/docs/tutorial/)
- [Extending RDParser (hand-crafted parsers)](https://configuredthings.github.io/RDP.js/docs/extending/)
- [Debugging with ObservableRDParser](https://configuredthings.github.io/RDP.js/docs/debugging/)
- [CLI reference](https://configuredthings.github.io/RDP.js/docs/cli/)
- [Bootstrapping](https://configuredthings.github.io/RDP.js/docs/bootstrapping/)
- [API reference (TypeDoc)](https://configuredthings.github.io/RDP.js/api/)

## Live playground

[configuredthings.github.io/RDP.js](https://configuredthings.github.io/RDP.js)
