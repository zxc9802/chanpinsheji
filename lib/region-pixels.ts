/** White in the selection means editable. Bytes outside it are copied verbatim. */
export function compositePixels(original: Uint8ClampedArray, edited: Uint8ClampedArray, selection: Uint8ClampedArray) {
  if (original.length !== edited.length || original.length !== selection.length || original.length % 4) throw new Error('图片和蒙版尺寸不一致');
  const result = new Uint8ClampedArray(original);
  for (let i = 0; i < result.length; i += 4) {
    const weight = selection[i] / 255 * selection[i + 3] / 255;
    if (!weight) continue;
    for (let c = 0; c < 4; c++) result[i + c] = Math.round(original[i + c] * (1 - weight) + edited[i + c] * weight);
  }
  return result;
}
export function transparentEditMask(selection: Uint8ClampedArray) {
  const result = new Uint8ClampedArray(selection.length);
  for (let i = 0; i < result.length; i += 4) result[i + 3] = 255 - Math.round(selection[i] * selection[i + 3] / 255);
  return result;
}
