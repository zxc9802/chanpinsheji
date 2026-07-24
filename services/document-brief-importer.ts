import JSZip from "jszip";
import type { DesignBrief } from "@/types/design-brief";
import { callAi, getAiProvider } from "@/lib/ai-client";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_TEXT_LENGTH = 60000;

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

export async function importBriefFromDocument(file: File, projectId: string): Promise<{ brief: DesignBrief; truncated: boolean; sourceLength: number }> {
  const { text, truncated, sourceLength } = await extractDocumentText(file);
  const provider = await getAiProvider("copy");
  const brief = await callAi<DesignBrief>("brief", "copy", { action: "brief-import", provider, params: { documentText: text, projectId, fileName: file.name } });
  return { brief, truncated, sourceLength };
}
