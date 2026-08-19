import JSZip from "jszip";
import type { DesignBrief } from "@/types/design-brief";
import { callAi } from "@/lib/ai-client";
import { sourcesFromExtractedBrief, type BriefFieldSources } from "@/lib/brief-field-sources";

export type BriefImportResult = {
  brief: DesignBrief;
  fieldSources: BriefFieldSources;
  extractedCount: number;
  aiFilledCount: number;
  truncated?: boolean;
  sourceLength: number;
};

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_TEXT_LENGTH = 60000;
const MAX_IMAGE_EDGE = 1600;
export const MAX_BRIEF_IMAGES = 6;
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;

export function isBriefImageFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return file.type.startsWith("image/") || IMAGE_EXTENSIONS.includes(extension as (typeof IMAGE_EXTENSIONS)[number]);
}

function cleanText(value: string) {
  return value.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

async function extractDocx(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const paths = Object.keys(zip.files).filter((path) => /^word\/(document|header\d+|footer\d+)\.xml$/i.test(path));
  if (!paths.includes("word/document.xml")) throw new Error("Word 文件结构无效，未找到 document.xml");
  const sections: string[] = [];
  for (const path of paths.sort((a) => a === "word/document.xml" ? -1 : 1)) {
    const xml = await zip.file(path)?.async("string");
    if (!xml) continue;
    const document = new DOMParser().parseFromString(xml, "application/xml");
    if (document.querySelector("parsererror")) throw new Error("Word 文档内容解析失败");
    const paragraphs = Array.from(document.getElementsByTagNameNS("*", "p")).map((paragraph) =>
      Array.from(paragraph.getElementsByTagNameNS("*", "t")).map((node) => node.textContent || "").join("").trim(),
    ).filter(Boolean);
    sections.push(paragraphs.join("\n"));
  }
  return cleanText(sections.join("\n\n"));
}

async function extractPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return cleanText(pages.join("\n\n"));
}

export async function extractDocumentText(file: File) {
  if (file.size > MAX_FILE_SIZE) throw new Error("文件超过 15MB，请压缩后重新上传");
  const extension = file.name.split(".").pop()?.toLowerCase();
  const text = extension === "docx" ? await extractDocx(file) : extension === "pdf" ? await extractPdf(file) : "";
  if (!text) throw new Error(extension === "pdf" ? "PDF 中没有可提取文字，可能是扫描件，请先进行 OCR" : "文档中没有读取到有效文字");
  return { text: text.slice(0, MAX_TEXT_LENGTH), truncated: text.length > MAX_TEXT_LENGTH, sourceLength: text.length };
}

async function requestBriefImport(params: Record<string, unknown>, extra: Pick<BriefImportResult, "sourceLength" | "truncated">): Promise<BriefImportResult> {
  const result = await callAi<BriefImportResult>("brief", "copy", { action: "brief-import", provider: "openlux", params });
  return {
    brief: result.brief,
    fieldSources: result.fieldSources || sourcesFromExtractedBrief(result.brief),
    extractedCount: result.extractedCount || 0,
    aiFilledCount: result.aiFilledCount || 0,
    ...extra,
  };
}

export async function importBriefFromDocument(file: File, projectId: string): Promise<BriefImportResult> {
  const { text, truncated, sourceLength } = await extractDocumentText(file);
  return requestBriefImport({ documentText: text, projectId, fileName: file.name }, { truncated, sourceLength });
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} 不是可识别的图片`)); };
    image.src = url;
  });
}

async function compressImageForBrief(file: File) {
  if (typeof document === "undefined") {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`${file.name} 读取失败`));
      reader.readAsDataURL(file);
    });
  }
  const image = await loadImageElement(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`${file.name} 无法压缩，请换一张图`);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function importBriefFromImages(files: File[], projectId: string): Promise<BriefImportResult> {
  if (!files.length) throw new Error("请至少上传一张图片");
  if (files.length > MAX_BRIEF_IMAGES) throw new Error(`一次最多上传 ${MAX_BRIEF_IMAGES} 张图片`);
  const images = [];
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} 超过 15MB，请压缩后重新上传`);
    if (!isBriefImageFile(file)) throw new Error(`${file.name} 不是支持的图片格式`);
    images.push({ name: file.name, dataUrl: await compressImageForBrief(file) });
  }
  return requestBriefImport(
    { projectId, fileName: files.map((file) => file.name).join("、"), images },
    { sourceLength: files.length },
  );
}
