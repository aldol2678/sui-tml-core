# Security Policy

TML v0.1.0 is a research prototype. Its static checker is **not** a production authorization boundary or a substitute for runtime validation.

Report suspected security vulnerabilities using GitHub's **private vulnerability reporting** feature if enabled for the published repository. If it is unavailable, contact the maintainer through a verified private channel before sharing reproductions. Do not post secrets, live resource identifiers, or exploitable details in public issues.

Security-sensitive findings include capability/approval bypasses, invalid programs accepted as valid, effect declaration forgery, and failure to distinguish unknown postconditions from verified completion.

Examples and fixtures must use synthetic identifiers. No real credentials or live external resources belong in the public source tree.
