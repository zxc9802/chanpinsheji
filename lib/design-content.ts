/** Preserve useful text in model output, including descriptions returned as objects or lists. */
export function describeContent(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value).flatMap(([key, child]) => {
    const content = describeContent(child);
    return content ? [`${Array.isArray(value) ? '' : `${key}：`}${content}`] : [];
  }).join('；');
}

export function hasBriefContent(brief: unknown): boolean {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return false;
  return Object.entries(brief).some(([key, value]) => key !== 'projectId' && !!describeContent(value));
}
