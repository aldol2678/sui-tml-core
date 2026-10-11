# Contributing to TML

Thanks for considering a contribution.

TML is currently an experimental research prototype. Small, well-scoped changes with clear tests are preferred over broad language expansion.

## Development setup

```bash
npm install
npm test
```

## Pull requests

Please:

1. keep changes focused;
2. add or update fixtures when behavior changes;
3. preserve the distinction between structural errors and semantic diagnostics;
4. avoid weakening effect, capability, approval, or postcondition checks;
5. run `npm test` before opening a pull request.

## Scope

The v0.1.0 OSS baseline covers the tokenizer, parser, AST, contract resolution, static checker, diagnostics, and acceptance fixtures.

Project-specific runtime adapters, private provider bindings, and internal workflow authority documents are intentionally outside the public baseline.

## Design changes

Syntax or semantic changes should include:

- the problem being solved;
- examples before and after;
- compatibility impact;
- new positive and negative fixtures;
- any diagnostic changes.

There is no compatibility guarantee before a future stable release.
