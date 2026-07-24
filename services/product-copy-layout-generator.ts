import { aiErrorMessage, callAi, getAiProvider } from "@/lib/ai-client";
import { emitAiNotice } from "@/lib/ai-usage";
import type { DesignBrief } from "@/types/design-brief";
import type { CopyField } from "@/types/copy";
import type { ContainerType } from "@/types/container";
import type { ProductCopyFidelity, ProductCopyLayoutItem, ProductCopyLayoutPlan, ProductCopySourceKey } from "@/types/product-design";

type AiItem=Pick<ProductCopyLayoutItem,"sourceKey"|"displayText"|"face"|"role"|"priority"|"enabled">;

export function copyFidelityForSource(sourceKey:ProductCopySourceKey):ProductCopyFidelity{
  if(sourceKey==="logo"||sourceKey==="brand_name"||sourceKey==="product_name")return "exact";
  if(sourceKey==="main_slogan"||sourceKey==="sub_slogan")return "preserve_meaning";
  return "adaptable";
}

export const productCopyLayoutGenerator={
  async generate(params:{brief:DesignBrief;fields:CopyField[];container?:ContainerType;viewMode:"two_view"|"three_view"}):Promise<ProductCopyLayoutPlan>{
    const provider=await getAiProvider("copy");
    try{
      const result=await callAi<{items:AiItem[];notes:string[]}>("product","copy",{action:"product-copy-layout",provider,params});
      const fixed:ProductCopyLayoutItem[]=[
        {id:`layout-logo-${Date.now()}`,sourceKey:"logo",sourceLabel:"Logo",sourceText:"定稿 Logo",displayText:"",face:"front",role:"logo",priority:1,enabled:true,fidelity:"exact"},
        {id:`layout-brand-${Date.now()}`,sourceKey:"brand_name",sourceLabel:"品牌名",sourceText:params.brief.brand.name,displayText:params.brief.brand.name,face:"front",role:"brand",priority:1,enabled:true,fidelity:"exact"},
        {id:`layout-product-${Date.now()}`,sourceKey:"product_name",sourceLabel:"产品名",sourceText:params.brief.product.name,displayText:params.brief.product.name,face:"front",role:"product_name",priority:1,enabled:true,fidelity:"exact"},
      ];
      const byKey=new Map(params.fields.map(field=>[field.key,field]));
      const items=result.items.flatMap((item,index)=>{const source=byKey.get(item.sourceKey as CopyField["key"]);if(!source)return[];return[{...item,id:`layout-${Date.now()}-${index}`,sourceLabel:source.label,sourceText:source.content,face:params.viewMode==="two_view"&&item.face==="side"?"back":item.face,fidelity:copyFidelityForSource(item.sourceKey)}] as ProductCopyLayoutItem[]});
      return{id:`copy-layout-${Date.now()}`,items:[...fixed,...items],viewMode:params.viewMode,notes:result.notes||[],confirmed:false,generatedAt:new Date().toISOString()};
    }catch(error){emitAiNotice(`包装上版规划失败（${provider}）：${aiErrorMessage(error)}`);throw error;}
  }
};
