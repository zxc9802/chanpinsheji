'use client';
import { useState } from 'react';
import type { AssetKind } from '@/types/studio';

/** Show the front column of the very same three-view image opened in the editor. */
export function StudioConceptPreview({ imageUrl, kind, name }: { imageUrl: string; kind: AssetKind; name: string }) {
  const [ratio, setRatio] = useState(0.5);
  const logo = kind === 'logo';
  return <div className={`studio-front-preview${logo ? ' is-logo' : ''}`} style={{ aspectRatio: logo ? 1 : ratio }}>
    <img src={imageUrl} alt={`${name}${logo ? ' Logo' : '正面图'}`} onLoad={e => setRatio(e.currentTarget.naturalWidth / 3 / e.currentTarget.naturalHeight)} />
  </div>;
}
