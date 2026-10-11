# Security

## Reporting a vulnerability
Please do **not** open a public issue for a security problem. Use GitHub's private vulnerability reporting (the repository's **Security** tab > **Report a vulnerability**) if it is enabled, or contact the maintainer directly. Describe the impact and steps to reproduce. **Never include real tokens, client secrets or account details** in a report; redact them.

## Credentials
- Orchid is a public browser client using Authorization Code with PKCE. It needs **no client secret**, and one must never be added to this repository or to any `VITE_` variable (those are published in the browser bundle).
- Only `.env.example` is committed. Real values go in `.env.local`, which is git-ignored.
- If you believe a credential was committed, rotate it in the Spotify Developer Dashboard first, then remove it. Deleting a file in a later commit does not remove it from Git history.
- Token handling and its known trade-offs (the refresh token lives in `localStorage`) are in `docs/AUTH.md`.
