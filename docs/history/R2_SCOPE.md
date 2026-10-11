# R2 Scope Lock (Historical)

This document preserves the scope lock used during the R2 static-checker stage.

Allowed: tokenizer/parser, AST, symbol/contract resolution, static checker, diagnostics, contract fixtures.

Forbidden in R2: runtime execution, actual capability possession checks, approval token consumption/replay, postcondition readback, external mutations, VM/LLVM/WASM, package manager work, stdlib expansion, production LSP, general-purpose language expansion.

This is historical project context, not the current full project roadmap.
