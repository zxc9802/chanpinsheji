import type { ImageType, MarketingImage, MarketingImageParams } from "@/types/marketing-image";
import { packagingSwatch } from "./packaging-generator";
import { aiErrorMessage, callAi, getAiProvider } from "@/lib/ai-client";
import { emitAiNotice } from "@/lib/ai-usage";
import { buildMarketingPrompt } from "./prompts/image-prompts";

export interface MarketingImageGenerator { generate(params:MarketingImageParams):Promise<MarketingImage[]>; }
export const imageTypeMeta:Record<ImageType,{label:string;description:string}> = {
  main_image:{label:"电商主图",description:"白底产品与包装组合，适合首屏展示"},
  scene_image:{label:"场景图",description:"结合使用场景建立生活方式氛围"},
  detail_selling_point:{label:"卖点详情图",description:"产品图与功效文案组合排版"},
  multi_angle:{label:"多角度图",description:"展示产品与包装的不同观察角度"},
  packaging_shot:{label:"包装实拍感图",description:"呈现盒型各面组合与立体陈列"},
};
const esc=(value:string)=>value.replace(/[<>&'\"]/g,(c)=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]||c));
const data=(svg:string)=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const field=(params:MarketingImageParams,key:string)=>params.finalCopy.fields.find((item)=>item.key===key)?.content||"";
const titleFor:Record<ImageType,string[]>={main_image:["主图-白底正面","主图-产品包装组合","主图-轻投影陈列","主图-留白构图"],scene_image:["场景图-梳妆台晨光","场景图-浴室水润感","场景图-窗边夜间护理","场景图-旅行随身"],detail_selling_point:["详情图-核心功效","详情图-关键成分","详情图-使用体验","详情图-痛点回应"],multi_angle:["多角度-正侧组合","多角度-俯视陈列","多角度-旋转展示","多角度-开盒视角"],packaging_shot:["包装实拍-正背面","包装实拍-立体陈列","包装实拍-盒器组合","包装实拍-细节特写"]};

function makeSvg(params:MarketingImageParams,type:ImageType,index:number){
  const palette=params.finalProductDesign.cmf.colorScheme; const primary=packagingSwatch(palette[0]||""); const accent=packagingSwatch(palette[1]||"");
  const slogan=field(params,"main_slogan"),efficacy=field(params,"efficacy_desc"),ingredient=field(params,"ingredient_desc");
  const bg=type==="main_image"?"#ffffff":type==="scene_image"?`linear-gradient(145deg,${accent},#fff)`:type==="detail_selling_point"?primary:"#eef2ef";
  const scene=type==="scene_image"?`<circle cx="125" cy="115" r="90" fill="#fff" opacity=".55"/><path d="M0 470 Q230 360 520 455T900 410V600H0Z" fill="${primary}" opacity=".2"/><ellipse cx="450" cy="465" rx="270" ry="35" fill="#34483d" opacity=".12"/>`:"";
  const detail=type==="detail_selling_point"?`<rect width="900" height="600" fill="${primary}"/><rect x="480" y="70" width="350" height="460" rx="18" fill="#fff" opacity=".93"/><text x="525" y="145" font-size="16" fill="#678">PRODUCT BENEFIT 0${index+1}</text><foreignObject x="525" y="175" width="250" height="200"><div xmlns="http://www.w3.org/1999/xhtml" style="font:700 26px Arial;line-height:1.55;color:#25362d">${esc((index%2?ingredient:efficacy).slice(0,78))}</div></foreignObject>`:"";
  const angles=type==="multi_angle"?`<g opacity=".55" transform="translate(-180 40) scale(.82)"><image href="${params.finalProductDesign.imageUrl}" x="250" y="105" width="330" height="400"/></g><g opacity=".45" transform="translate(330 70) scale(.68)"><image href="${params.finalPackaging.previewImageUrl}" x="140" y="120" width="420" height="310"/></g>`:"";
  const packaging=type==="packaging_shot"?`<g transform="translate(35 0)"><image href="${params.finalPackaging.previewImageUrl}" x="55" y="75" width="790" height="450"/><path d="M180 485h530" stroke="#21372c" stroke-width="16" opacity=".1"/></g>`:"";
  const productX=type==="detail_selling_point"?80:235+(index%2)*50;
  const hero=["main_image","scene_image","detail_selling_point"].includes(type)?`<image href="${params.finalProductDesign.imageUrl}" x="${productX}" y="100" width="300" height="400" preserveAspectRatio="xMidYMid meet"/>`:"";
  const pack=type==="main_image"?`<image href="${params.finalPackaging.previewImageUrl}" x="460" y="170" width="330" height="260" preserveAspectRatio="xMidYMid meet"/>`:"";
  const copy=type==="main_image"?`<text x="450" y="545" text-anchor="middle" font-size="19" fill="#32463b">${esc(slogan.slice(0,32))}</text>`:type==="scene_image"?`<text x="650" y="180" text-anchor="middle" font-size="28" font-weight="700" fill="#2b4035">${esc(slogan.slice(0,20))}</text><text x="650" y="220" text-anchor="middle" font-size="13" fill="#5b6d63">DAILY SKIN RITUAL</text>`:"";
  return data(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 900 600"><defs><linearGradient id="scene" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="900" height="600" fill="${bg.startsWith("linear")?"url(#scene)":bg}"/>${scene}${detail}${angles}${packaging}${hero}${pack}${copy}<image href="${params.finalLogo.imageUrl}" x="35" y="28" width="96" height="60" preserveAspectRatio="xMidYMid meet"/></svg>`);
}

class StructuredMarketingCompositionGenerator implements MarketingImageGenerator{
  async generate(params:MarketingImageParams){const seed=Date.now();return params.imageTypes.flatMap((type)=>Array.from({length:Math.max(1,Math.min(4,params.quantities?.[type]||3))},(_,index)=>{const used=type==="detail_selling_point"?[field(params,index%2?"ingredient_desc":"efficacy_desc")]:type==="main_image"||type==="scene_image"?[field(params,"main_slogan")]:[];return{id:`marketing-${seed}-${type}-${index}`,type,imageUrl:makeSvg(params,type,index),title:titleFor[type][index],copyUsed:used.filter(Boolean),palette:[...params.finalProductDesign.cmf.colorScheme]};}));}
}
function composeMarketing(background:string,overlay:string){return data(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><image href="${esc(background)}" width="1200" height="800" preserveAspectRatio="xMidYMid slice"/><rect width="1200" height="800" fill="#fff" opacity=".18"/><image href="${esc(overlay)}" width="1200" height="800" style="mix-blend-mode:multiply" opacity=".92"/></svg>`)}
class AiMarketingImageGenerator implements MarketingImageGenerator{
 private compositions=new StructuredMarketingCompositionGenerator();
 async generate(params:MarketingImageParams){const base=await this.compositions.generate(params);const prompts=base.slice(0,20).map((image,index)=>buildMarketingPrompt(params,image.type,index));const urls=await callAi<(string|undefined)[]>("marketing","image",{prompts});const generated=base.flatMap((image,index)=>urls[index]?[{...image,imageUrl:composeMarketing(urls[index]!,image.imageUrl)}]:[]);if(generated.length/base.length<=.5)throw new Error(`仅成功生成 ${generated.length}/${base.length} 张图片`);return generated;}
}
class ProviderMarketingImageGenerator implements MarketingImageGenerator{
 private ai=new AiMarketingImageGenerator();
 async generate(params:MarketingImageParams){const provider=await getAiProvider("image");try{return await this.ai.generate(params);}catch(error){emitAiNotice(`物料图生成失败（${provider}）：${aiErrorMessage(error)}`);throw error;}}
}
export const marketingImageGenerator:MarketingImageGenerator=new ProviderMarketingImageGenerator();
