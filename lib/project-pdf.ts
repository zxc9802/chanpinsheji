const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const CONTENT_LEFT = 100;
const CONTENT_RIGHT = PAGE_WIDTH - 100;
const CONTENT_TOP = 240;
const CONTENT_BOTTOM = PAGE_HEIGHT - 130;
const CJK_FONT = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

type LineStyle = "heading" | "body" | "bullet" | "quote" | "spacer";

type PdfLine = {
  style: LineStyle;
  text?: string;
  height: number;
  before?: number;
  after?: number;
};

function wrapText(context: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = "";

  for (const character of Array.from(text)) {
    const next = `${line}${character}`;
    if (line && context.measureText(next).width > width) {
      lines.push(line.trimEnd());
      line = character.trimStart();
    } else {
      line = next;
    }
  }

  if (line) lines.push(line.trimEnd());
  return lines.length ? lines : [""];
}

function fontFor(style: LineStyle) {
  if (style === "heading") return `600 34px ${CJK_FONT}`;
  if (style === "quote") return `400 25px ${CJK_FONT}`;
  return `400 27px ${CJK_FONT}`;
}

function lineHeightFor(style: LineStyle) {
  if (style === "heading") return 50;
  if (style === "quote") return 42;
  return 44;
}

function markdownToLines(markdown: string) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 PDF 文档生成");

  const lines: PdfLine[] = [];
  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      lines.push({ style: "spacer", height: 18 });
      continue;
    }

    if (trimmed.startsWith("# ")) continue;

    let style: LineStyle = "body";
    let text = trimmed;
    let before = 0;
    let after = 0;
    let indent = 0;

    if (trimmed.startsWith("## ")) {
      style = "heading";
      text = trimmed.slice(3);
      before = 24;
      after = 8;
    } else if (trimmed.startsWith("- ")) {
      style = "bullet";
      text = trimmed.slice(2);
      indent = 34;
      after = 4;
    } else if (trimmed.startsWith("> ")) {
      style = "quote";
      text = trimmed.slice(2);
      before = 14;
      after = 6;
      indent = 28;
    }

    context.font = fontFor(style);
    const wrapped = wrapText(context, text, CONTENT_RIGHT - CONTENT_LEFT - indent);
    wrapped.forEach((value, index) => {
      lines.push({
        style,
        text: value,
        height: lineHeightFor(style),
        before: index === 0 ? before : 0,
        after: index === wrapped.length - 1 ? after : 0,
      });
    });
  }

  return lines;
}

function drawPage(title: string, lines: PdfLine[], startIndex: number, pageNumber: number) {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 PDF 文档生成");

  context.fillStyle = "#fbfcf9";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.fillStyle = "#16794f";
  context.fillRect(CONTENT_LEFT, 92, 14, 86);
  context.fillStyle = "#244033";
  context.font = `600 48px ${CJK_FONT}`;
  context.fillText(title, CONTENT_LEFT + 34, 146);
  context.fillStyle = "#708078";
  context.font = `400 22px ${CJK_FONT}`;
  context.fillText("PackPilot · 项目交付资料", CONTENT_LEFT + 34, 178);
  context.fillStyle = "#dce7df";
  context.fillRect(CONTENT_LEFT, 206, CONTENT_RIGHT - CONTENT_LEFT, 2);

  let index = startIndex;
  let y = CONTENT_TOP;
  while (index < lines.length) {
    const line = lines[index];
    const required = (line.before || 0) + line.height + (line.after || 0);
    if (y + required > CONTENT_BOTTOM && index > startIndex) break;

    y += line.before || 0;
    if (line.style === "spacer") {
      y += line.height;
      index += 1;
      continue;
    }

    context.font = fontFor(line.style);
    context.fillStyle = line.style === "heading" ? "#176d4a" : line.style === "quote" ? "#5f7067" : "#26362e";
    const indent = line.style === "bullet" ? 34 : line.style === "quote" ? 28 : 0;

    if (line.style === "bullet") {
      context.fillStyle = "#16794f";
      context.beginPath();
      context.arc(CONTENT_LEFT + 10, y - 10, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#26362e";
    }
    if (line.style === "quote") {
      context.fillStyle = "#b8c8bd";
      context.fillRect(CONTENT_LEFT, y - 30, 6, line.height + 10);
      context.fillStyle = "#5f7067";
    }

    context.fillText(line.text || "", CONTENT_LEFT + indent, y);
    y += line.height + (line.after || 0);
    index += 1;
  }

  context.fillStyle = "#dce7df";
  context.fillRect(CONTENT_LEFT, PAGE_HEIGHT - 92, CONTENT_RIGHT - CONTENT_LEFT, 2);
  context.fillStyle = "#708078";
  context.font = `400 20px ${CJK_FONT}`;
  context.fillText(`第 ${pageNumber} 页`, CONTENT_LEFT, PAGE_HEIGHT - 56);
  context.textAlign = "right";
  context.fillText("概念设计交付文件", CONTENT_RIGHT, PAGE_HEIGHT - 56);
  context.textAlign = "left";

  return { canvas, nextIndex: index };
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("PDF 页面生成失败");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function joinBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function buildPdf(pageImages: Uint8Array[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const writeText = (value: string) => {
    const bytes = encoder.encode(value);
    chunks.push(bytes);
    length += bytes.length;
  };
  const writeBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const writeObject = (number: number, body: string | Uint8Array) => {
    offsets[number] = length;
    writeText(`${number} 0 obj\n`);
    if (typeof body === "string") writeText(body);
    else writeBytes(body);
    writeText("\nendobj\n");
  };

  writeText("%PDF-1.4\n");
  writeObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectNumbers = pageImages.map((_, index) => 3 + index * 3);
  writeObject(2, `<< /Type /Pages /Count ${pageImages.length} /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] >>`);

  pageImages.forEach((image, index) => {
    const pageObject = pageObjectNumbers[index];
    const contentObject = pageObject + 1;
    const imageObject = pageObject + 2;
    writeObject(
      pageObject,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] /Resources << /XObject << /Image1 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
    const stream = "q\n595.28 0 0 841.89 0 0 cm\n/Image1 Do\nQ";
    writeObject(contentObject, `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    writeObject(
      imageObject,
      joinBytes([
        encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${PAGE_WIDTH} /Height ${PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),
        image,
        encoder.encode("\nendstream"),
      ]),
    );
  });

  const xrefOffset = length;
  const objectCount = pageImages.length * 3 + 2;
  writeText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let number = 1; number <= objectCount; number += 1) {
    writeText(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
  }
  writeText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return joinBytes(chunks);
}

export async function createProjectPdf(markdown: string) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1] || "项目资料";
  const lines = markdownToLines(markdown);
  const pageImages: Uint8Array[] = [];
  let index = 0;
  let pageNumber = 1;

  do {
    const { canvas, nextIndex } = drawPage(title, lines, index, pageNumber);
    pageImages.push(dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.9)));
    index = nextIndex;
    pageNumber += 1;
  } while (index < lines.length);

  return new Blob([buildPdf(pageImages)], { type: "application/pdf" });
}
