# In-memory image generation jobs

## Goal

Replace the synchronous image-generation response with a job ID and polling flow. A request to generate many images must return before Cloudflare's proxy timeout, while callers still receive the same final image array.

## Scope

- Apply to every caller of `POST /api/ai/image`: Logo, product, packaging, and marketing images.
- Keep all model keys and image-generation requests server-side.
- Keep the existing maximum of three parallel provider image requests within one job.
- Use process memory only. A Zeabur restart discards every queued, running, completed, and failed job.
- Do not add cancellation, a database, a Redis queue, or UI redesign in this change.

## API contract

### Start a job

`POST /api/ai/image` accepts the existing image request body. It validates provider configuration and request fields before creating a job.

On success, it returns HTTP 202:

```json
{ "jobId": "image-job-...", "status": "queued" }
```

### Poll a job

`GET /api/ai/image?jobId=<id>` returns HTTP 200 for a known job:

```json
{
  "jobId": "image-job-...",
  "status": "queued | running | completed | failed",
  "data": ["image-url-or-null"],
  "usage": { "provider": "yunwu", "durationMs": 0, "images": 0 },
  "error": "only present when failed"
}
```

It returns HTTP 400 without `jobId` and HTTP 404 for an unknown or expired ID.

## Server design

Create an in-memory image-job manager shared by the API route. Each job stores its ID, original validated request, status, result, error, timestamps, and expiration time.

`POST` enqueues a job and immediately starts the scheduler. The scheduler processes one job at a time; each job retains the existing three-image batch concurrency. This avoids multiplying expensive image requests when a user clicks Generate repeatedly.

The worker executes the existing image-generation and success-threshold logic. It records either the final response data and usage as `completed`, or a human-readable error as `failed`. Terminal jobs expire after 15 minutes. Cleanup runs whenever a job is created or polled.

## Client design

`callAi(..., "image", ...)` becomes the compatibility layer for image callers:

1. Send the existing request body to start the job.
2. Poll the returned job ID every 1.5 seconds.
3. Return the completed `data` array in the current call signature.
4. Throw the server-provided error for a failed, missing, or expired job.
5. Stop after a 10-minute client deadline with a clear timeout error.

No Logo, product, packaging, or marketing generator call site needs to change.

## Error handling

- Provider HTML, 4xx, 5xx, and timeout responses continue to be normalized by the server AI client.
- Job failures return ordinary JSON through the polling endpoint rather than a long-lived response that Cloudflare can replace with an HTML 524 page.
- A restart is surfaced as "generation task not found or expired; please retry".

## Verification

- Regression tests prove a job starts in `queued`, transitions to `running`, then exposes either completed data or a failure.
- Regression tests prove the image client polls a job rather than awaiting a synchronous image response.
- Existing test suite remains green.
- A local build is attempted; any pre-existing native dependency blocker is reported separately.
