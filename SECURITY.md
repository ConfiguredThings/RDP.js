# Security

## Reporting a vulnerability

Configured Things follows [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116) (`security.txt`) for vulnerability disclosure.
Please refer to our security policy before reporting:

**[https://configuredthings.com/.well-known/security.txt](https://configuredthings.com/.well-known/security.txt)**

Do not open a public GitHub issue for security vulnerabilities.

## Scope

> [!IMPORTANT]
> We are only concerned with vulnerabilities affecting the **library itself and its runtime dependencies** as defined in [`package.json`](./package.json) (i.e. `dependencies`).
>
> Please **do not** report vulnerabilities found in the documentation site's build toolchain (Gatsby, webpack, Babel, and their transitive dependencies — see [`docs-site/package.json`](./docs-site/package.json)). These are build-time tools that are not shipped as part of the library, and the associated advisories represent known, non-runtime issues. We are already aware of these and will not be acting on such reports.
