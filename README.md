## Primary image generation

Image generation defaults to fal.ai GPT Image 2.5 Sunburst with `quality: high`.
Set the server-only `FAL_KEY` (or existing `FAL_GPT_IMAGE2_API_KEY`) and set
`AI_PROVIDER_IMAGE=fal` on deployments that previously selected Yunwu.
The AI services page offers fal first; existing manual Yunwu/Doubao selections remain available.

The existing API continues returning HTTP 202 + `jobId`. The browser polls
`GET /api/ai/image?jobId=...`; the worker submits one fal queue request per image,
polls its returned status URL, and retrieves the result only after completion.
Text prompts use `openai/gpt-image-2.5/sunburst/text-to-image`; reference images
use `openai/gpt-image-2.5/sunburst/edit`. Each image has a six-minute deadline.
Credits are reserved before submission, settled after a valid image result, and
released on failure. Polling never submits another generation or settles again.

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

## One-click design studio

The default `/studio` route starts from a product brief (DOCX, text PDF, TXT,
or image), with no bottle reference required. It designs an original bottle
shape, closure and visual treatment along with copy, Logo and outer packaging,
in sequence using fal `high`. An optional image can inform visual style or
explicitly preserve an existing bottle structure. New uploads default to style
reference; legacy references retain structure preservation. The original six-step workflow stays available
through the mode switch and shares the same project assets.

- In one-click mode, all new assets use a pure white background. Inner packaging
  and outer packaging use equally scaled front, side and back views on one
  landscape image; Logo stays a single flat design. Existing images are retained.
- "返回第一步" reopens the current document facts and generation settings without
  parsing the document again. "新建项目" saves the current project in history and
  starts with an empty document; "返回设计结果" restores the existing results.
- The edit panel accepts one optional PNG/JPEG/WebP reference (up to 15MB),
  either selected or dropped onto the input area. A reference alone can guide
  an edit. The original remains image 1, the reference image 2, and regional masks
  apply only to the original. Whole edits retain white backgrounds and the
  product/packaging three-view layout.
- Browser IndexedDB saves partial progress, task IDs, detected polygons and
  adopted versions. Continuing a saved image task polls its existing `jobId`.
  Jobs use the existing in-memory queue: a server restart or 15 minutes after
  completion can expire them. The UI requires an explicit retry after expiry;
  it does not silently submit another paid request.
- New results automatically recognize editable regions once; users can rerun
  recognition when needed. OCR/object regions use OpenLux `gemini-3.7-flash`,
  configured with `REGION_VISION_API_KEY` (falls back to `OPENLUX_API_KEY`),
  `REGION_VISION_BASE_URL=https://api.openlux.ai` (host only, without `/v1beta`),
  and `REGION_VISION_MODEL=gemini-3.7-flash`. This configuration is independent
  of document parsing (`OPENLUX_*`) and other vision tasks (`YUNWU_*`).
  The selected object can be refined with `fal-ai/sam-3/image`, using `FAL_KEY`.
  These are billed calls. Missing vision configuration leaves manual selection
  available. Text polygons and object boundaries can be corrected manually.
- Regional editing sends an alpha mask to fal Sunburst edit. The browser then
  composites only the selected pixels into the original; unselected pixels are
  preserved. Results are previewed before adoption. Whole-image editing and
  version recovery are also available.
- Uploads and generated assets remain in this browser's project storage.
  Documents' missing factual claims are not filled into one-click prompts.
  OCR and generated wording still need visual review before export.
- Adopting an edit invalidates the delivery report. Logo/product changes can
  be propagated using the explicit "同步整套设计" action; this generates new
  product and packaging images and retains previous versions.

Validation: `npm run build` and `node --test tests/*.test.mjs`.

### 一键设计的策划与审稿

一键模式先根据产品资料与可选参考图生成整套视觉方案，再依次生成 Logo、内包装、外包装。视觉方案明确核心创意、参考取舍、配色用途、字体层级、瓶型材质与外盒版式，并随项目保存。返回第一步不重新解析文档；资料、设计想法或参考图改变时重新策划。

每个新生成的资产先保存原图，再由视觉模型检查。只有明确的重大问题会触发一次自动修正；之后比较原图与修正版，选择明确改善的一版。两版保留在版本记录中。审稿或自动修正失败时保留原图，界面明确提示未完成，继续后续资产；不会把失败当成通过。AI 审稿是辅助判断，不能证明印刷或工程可生产性。

策划、审稿和比较共用现有 `REGION_VISION_API_KEY` / `REGION_VISION_BASE_URL` / `REGION_VISION_MODEL`（默认 OpenLux Gemini），无需新增环境变量。`POST /api/ai/studio` 返回 jobId，`GET /api/ai/studio?jobId=...` 查询结果，按登录用户隔离并使用现有主站计费。图片继续使用 fal、high、白底、内外包装正侧背三视图。

刷新后可继续查询已保存的策划、审稿及修正任务；单个资产最多自动修正一次。任务仍沿用现有进程内队列，服务重启后失效，终态结果保留 15 分钟。额外成本为一份策划、每个新资产一次审稿，以及有重大问题时的一次修正和比较；没有重大问题不会额外生图。

视觉策划使用 Gemini JSON Schema 约束必填字段。模型返回对象或列表形式的说明时，无损展开为文字；缺字段、超长或截断时，在原 jobId 内自动整理一次，最多两轮策划输出，实际文本调用均按现有计费记录。仍失败时返回具体字段原因与任务编号，不生成默认方案。服务日志搜索 `[studio:plan]` 或该 jobId，可见字段类型、长度、模型终止原因和重试次数；日志不包含原始文档、模型正文、图片或密钥。历史失败任务未保留的原始响应无法通过新日志追溯。
