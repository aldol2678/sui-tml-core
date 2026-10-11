# 싀 (TML)

**TML** is an experimental typed workflow language for expressing effects, capabilities, approvals, and postconditions explicitly.

싀(TML)는 작업의 외부 효과, 실행 권한, 승인 및 사후 검증 조건을 명시하는 실험적 워크플로 언어입니다.

> Status: Developer Preview v0.1.0. Research prototype, not a production authorization system or general-purpose runtime.

## What works

- Tokenizer, parser and AST for candidate `.sui` source
- Symbol and contract resolution, static diagnostics and structural error reporting
- 15 frozen acceptance fixtures and regression tests
- Hangul identifiers (the language keywords are currently English)

The core **checks declared contracts**. It does not execute provider requests, grant capabilities, consume approvals, or read back external state.

## Quick start

Requires Node.js 22.16.0 and npm 10.9.2.

```bash
npm ci
npm test
```

To compile only:

```bash
npm run build
```

## Valid .sui example

```sui
operation web.search(query: Text) -> Report
effects [network.read]
requires [cap network.read(query)]

task 조사(query: Text) -> Report {
  effects [network.read]
  requires [cap network.read(query)]
  call web.search(query)
}
```

The `조사` identifier is supported. The grammar and language design are experimental, and this example **does not perform a network request**.

For additional cases see `fixtures/positive/`, `fixtures/negative-source/` and `fixtures/parser/`.

## Safety model

- **Type:** value structure
- **Effect:** possible externally observable effect
- **Capability:** scoped authority to perform an effect
- **Approval:** authorization for a particular intent
- **Postcondition:** an externally observed condition after execution

These are separate concepts: an API success response is not equivalent to verified completion. Static contract checking by itself does not provide a runtime security boundary.

## Source layout

- `src/`: tokenizer, parser, AST, diagnostics and checker
- `fixtures/`: acceptance fixtures
- `scripts/`: test and clean export tooling
- `docs/history/`: historical scope notes

## Clean-source export

```bash
npm run export:clean
```

This copies a strict allowlist into `release/tml-oss-core/` and produces `SHA256SUMS.txt`. It does **not** copy `.git` or create a remote repository. Initialize Git afresh in the exported directory before publishing; do not publish a private development repository merely by changing its visibility.

## Contributions and security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). The project is released under [Apache License 2.0](LICENSE).
