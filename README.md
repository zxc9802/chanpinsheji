# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## OpenLux usage reporting

Deploy the updated main application `/api/sso/usage` and legacy billing `usageReportedSeparately` support **before** this tool. Existing reserve/settle/release business charges are preserved.

Server-only configuration:
- `USAGE_MONITOR_INTERNAL_SECRET`: this tool's own main-site usage secret (tool key `chanpinsheji`). Never use a model API key or another tool's secret.
- `MAIN_APP_URL`: existing main application origin (default `https://www.qycm.top`).
- `USAGE_MONITOR_URL`: optional full canonical usage endpoint override.
- Cloudflare Workers: `.openai/hosting.json` now declares `d1: "DB"`. Provision the real persistent D1 binding through the existing hosting system; the small `usage_monitor_outbox` table initializes automatically.
- Node only: `USAGE_MONITOR_OUTBOX_DIR` selects an explicit persistent writable server directory. Mount persistent storage; ephemeral filesystems are not durable. Without this override the tool uses D1. If storage cannot initialize, canonical reporting stays off and legacy usage remains enabled.

Only the actual request hostname `api.openlux.ai` is reported. Each upstream attempt gets a UUID; delivery retries retain it. The encrypted SSO session or server-captured background billing user supplies employee attribution. Reports contain metadata and upstream token usage only, never prompts, images, files, keys or local token estimates. Missing counts remain unknown. Legacy billing estimates remain unchanged for business compatibility.

Pending metadata is persisted before each request; terminal usage is persisted before delivery. Failures retain files, and subsequent model calls drain at most ten events within a three-second budget. Workers: POST `/api/internal/usage/retry` with the server-only `x-usage-secret` header to drain D1. Node: run `node --experimental-strip-types scripts/retry-usage.mjs` with the same environment and explicit persistent directory. Repeat for larger backlogs; success means a drain was attempted, not that all queued reports were accepted. No automatic background retry is claimed. An accepted upstream HTTP 202 remains pending; the current client has no upstream-task polling integration. App-local image jobs report when their actual model HTTP calls finish, not when the browser receives its local job ID.

Verify without paid API calls: `node --test tests/openlux-usage.test.mjs tests/openlux-client.test.mjs`.
