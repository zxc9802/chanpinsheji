import { NextResponse } from "next/server";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function decodeDataUrl(url: string) {
  const matched = url.match(/^data:(image\/(?:svg\+xml|png|jpeg|webp));base64,(.+)$/i);
  if (!matched) return null;
  return {
    contentType: matched[1].toLowerCase(),
    buffer: Buffer.from(matched[2], "base64"),
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { url?: string };
    const url = payload.url?.trim();
    if (!url) return NextResponse.json({ error: "缺少图片地址" }, { status: 400 });

    const decoded = decodeDataUrl(url);
    if (decoded) {
      if (decoded.buffer.byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "图片超过 25MB 导出上限" }, { status: 413 });
      }
      return new Response(decoded.buffer, {
        headers: { "Content-Type": decoded.contentType, "Cache-Control": "private, max-age=300" },
      });
    }

    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return NextResponse.json({ error: "只支持 HTTPS 图片地址" }, { status: 400 });
    }

    const response = await fetch(parsed, {
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: "image/svg+xml,image/png,image/jpeg,image/webp" },
    });
    if (!response.ok) {
      return NextResponse.json({ error: `图片服务返回 HTTP ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
    if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `不支持的图片格式：${contentType || "未知"}` },
        { status: 415 },
      );
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "图片超过 25MB 导出上限" }, { status: 413 });
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "图片超过 25MB 导出上限" }, { status: 413 });
    }

    return new Response(bytes, {
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片读取失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
