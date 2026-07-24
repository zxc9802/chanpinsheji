"use client";

import Link from "next/link";
import { BoxIcon } from "./icons";
import { useDesignBrief } from "./design-brief-provider";

export function BrandAssetsPage() {
  const { brandAssets, hydrated } = useDesignBrief();
  const groups = brandAssets.reduce<Record<string, typeof brandAssets>>((result, asset) => {
    (result[asset.brandName] ||= []).push(asset);
    return result;
  }, {});
  return (
    <div className="app-shell assets-shell">
      <aside className="sidebar">
        <div className="logo"><BoxIcon /><span>PackPilot</span></div>
        <div className="workspace-label">工作空间</div>
        <nav className="side-nav" aria-label="主导航">
          <Link className="side-link" href="/workflow/3"><span>▦</span>项目</Link>
          <Link className="side-link active" href="/brand-assets"><span>◇</span>品牌资产库<em>{brandAssets.length}</em></Link>
          <Link className="side-link" href="/templates"><span>▤</span>模板</Link>
          <Link className="side-link" href="/exports"><span>⇧</span>导出</Link>
        </nav>
        <div className="sidebar-foot"><span className="avatar">P</span><div><strong>包装设计智能体</strong><small>模块 B · 工作台</small></div></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div><span className="crumb">资产</span><span className="slash">/</span><strong>品牌资产库</strong></div><Link className="back-project" href="/workflow/3">← 返回项目</Link></header>
        <div className="assets-page">
          <div className="page-heading"><div><span className="eyebrow">BRAND ASSETS</span><h1>品牌资产库</h1><p>集中管理已经定稿的品牌视觉资产，同一品牌下的多个项目可以共享使用。</p></div><span className="asset-count">{brandAssets.length} 项资产</span></div>
          {!hydrated ? <div className="form-loading"><span /><p>正在载入品牌资产…</p></div> : brandAssets.length === 0 ? <div className="asset-empty"><span>◇</span><h2>暂时没有品牌资产</h2><p>在 Logo 设计中完成定稿后，方案会自动出现在这里。</p><Link href="/workflow/2">前往 Logo 设计</Link></div> : Object.entries(groups).map(([brand, assets]) => (
            <section className="brand-asset-group" key={brand}><div className="brand-group-head"><div className="brand-initial">{brand.slice(0, 1).toUpperCase()}</div><div><h2>{brand}</h2><p>{assets.length} 项已定稿品牌资产</p></div></div><div className="asset-grid">{assets.map((asset) => asset.type === "logo" ? <article className="asset-card" key={asset.id}><div className="asset-image"><img src={asset.candidate.imageUrl} alt={`${asset.brandName} Logo`} /><span>LOGO</span></div><div className="asset-meta"><div><strong>品牌主 Logo</strong><small>{asset.candidate.styleTags.join(" · ")}</small></div><time>{new Date(asset.finalizedAt).toLocaleDateString("zh-CN")}</time></div><div className="asset-project">来源项目 <b>{asset.projectId}</b></div></article> : <article className="asset-card copy-asset-card" key={asset.id}><div className="copy-asset-preview"><span>COPY</span><small>主标语</small><blockquote>{asset.copyPackage.fields.find((field) => field.key === "main_slogan")?.content}</blockquote><p>{asset.copyPackage.fields.length} 项包装文案 · {asset.copyPackage.sourceInsightIds.length} 条洞察溯源</p></div><div className="asset-meta"><div><strong>品牌包装文案</strong><small>{asset.copyPackage.toneTags.join(" · ")}</small></div><time>{new Date(asset.finalizedAt).toLocaleDateString("zh-CN")}</time></div><div className="asset-project">来源项目 <b>{asset.projectId}</b></div></article>)}</div></section>
          ))}
        </div>
      </main>
    </div>
  );
}
