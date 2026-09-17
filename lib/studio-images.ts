import type { DesignRegion } from '@/types/studio';
import { compositePixels, transparentEditMask } from './region-pixels';
export const readFileDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('文件读取失败')); reader.readAsDataURL(file);
});
export async function localImage(url: string) {
  if (url.startsWith('data:')) return url;
  const response = await fetch('/api/ai/image-download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  if (!response.ok) throw new Error('图片读取失败，请稍后重试');
  return readFileDataUrl(await response.blob());
}
export const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('无法解码图片')); img.src = src;
});
function canvas(width: number, height: number) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error('浏览器不支持图片编辑'); return { c, ctx };
}
export async function prepareUpload(file: File) {
  if (file.size > 15 * 1024 * 1024) throw new Error('图片不能超过 15MB');
  const img = await loadImage(await readFileDataUrl(file));
  const scale = Math.min(1, 2048 / Math.max(img.width, img.height));
  const { c, ctx } = canvas(Math.round(img.width * scale), Math.round(img.height * scale)); ctx.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .92);
}
export async function selectionMask(source: string, region: DesignRegion, segmentedMask?: string) {
  const img = await loadImage(source);
  const { c, ctx } = canvas(img.width, img.height);
  ctx.fillStyle = '#fff'; ctx.beginPath(); region.polygon.forEach((p, i) => i ? ctx.lineTo(p[0] * c.width / 1000, p[1] * c.height / 1000) : ctx.moveTo(p[0] * c.width / 1000, p[1] * c.height / 1000)); ctx.closePath(); ctx.fill();
  if (segmentedMask) {
    // SAM returns a full-size black/white mask. Restrict it to the chosen polygon.
    const mask = await loadImage(await localImage(segmentedMask));
    if (mask.width !== img.width || mask.height !== img.height) throw new Error('分割蒙版尺寸与原图不符，请改用手动选区');
    const other = canvas(c.width, c.height); other.ctx.drawImage(mask, 0, 0);
    const m = other.ctx.getImageData(0, 0, c.width, c.height), clip = ctx.getImageData(0, 0, c.width, c.height);
    let selected = 0;
    for (let i = 0; i < m.data.length; i += 4) {
      const on = m.data[i] > 127 && m.data[i + 3] > 127 && clip.data[i + 3] > 0;
      m.data[i] = m.data[i + 1] = m.data[i + 2] = on ? 255 : 0; m.data[i + 3] = 255; if (on) selected++;
    }
    if (selected < 16) throw new Error('没有识别到有效轮廓，请调整选区');
    ctx.putImageData(m, 0, 0);
  }
  const selection = ctx.getImageData(0, 0, c.width, c.height);
  const overlay = canvas(c.width, c.height), tint = new ImageData(c.width, c.height);
  for (let i = 0; i < selection.data.length; i += 4) { tint.data[i] = 26; tint.data[i + 1] = 178; tint.data[i + 2] = 125; tint.data[i + 3] = selection.data[i] * selection.data[i + 3] / 255 * .35; }
  overlay.ctx.putImageData(tint, 0, 0);
  ctx.putImageData(new ImageData(transparentEditMask(selection.data), c.width, c.height), 0, 0);
  return { apiMask: c.toDataURL('image/png'), overlay: overlay.c.toDataURL('image/png'), selection };
}
export async function mergeRegion(original: string, editedUrl: string, selection: ImageData) {
  const [originalImage, edited] = await Promise.all([loadImage(original), localImage(editedUrl).then(loadImage)]);
  if (originalImage.width !== selection.width || originalImage.height !== selection.height) throw new Error('原图尺寸已改变，请重新选区');
  const { c, ctx } = canvas(selection.width, selection.height); ctx.drawImage(originalImage, 0, 0);
  const originalPixels = ctx.getImageData(0, 0, c.width, c.height);
  ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(edited, 0, 0, c.width, c.height);
  const generated = ctx.getImageData(0, 0, c.width, c.height);
  ctx.putImageData(new ImageData(compositePixels(originalPixels.data, generated.data, selection.data), c.width, c.height), 0, 0);
  return c.toDataURL('image/png');
}
export async function regionTask<T>(body: unknown): Promise<T> {
  const response = await fetch('/api/ai/regions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const start = await response.json(); if (!response.ok || !start.jobId) throw new Error(start.error || '区域任务创建失败');
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const r = await fetch(`/api/ai/regions?jobId=${encodeURIComponent(start.jobId)}`); const job = await r.json();
    if (!r.ok || job.status === 'failed') throw new Error(job.error || '区域识别失败');
    if (job.status === 'completed') return job.result;
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  throw new Error('区域识别超时，请稍后重试或手动框选');
}
