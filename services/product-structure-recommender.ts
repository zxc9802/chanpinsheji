import type { DesignBrief } from "@/types/design-brief";
import type { ContainerType, ProductShapeFamily, ProductStructureKind } from "@/types/container";
import { aiErrorMessage, callAi, getAiProvider } from "@/lib/ai-client";
import { emitAiNotice } from "@/lib/ai-usage";
import { createStructureSketch } from "./container-library";

type RecommendationPayload={name:string;kind:ProductStructureKind;shapeFamily:ProductShapeFamily;description:string;interactionMethod:string;specificationOptions:string[];materialOptions:string[];costLevel:1|2|3;viewMode:"two_view"|"three_view";recommendationReason:string};

export const productStructureFingerprint=(brief:DesignBrief)=>JSON.stringify({name:brief.product.name,category:brief.product.category,industry:brief.product.industry,texture:brief.product.texture,usage:brief.product.usageScenarios,dimensions:brief.hardConstraints.dimensions});

export interface ProductStructureRecommender{recommend(brief:DesignBrief,count?:number):Promise<ContainerType[]>;identify(brief:DesignBrief,imageUrl:string,fileName:string):Promise<ContainerType>}

class AiProductStructureRecommender implements ProductStructureRecommender{
  async recommend(brief:DesignBrief,count=4):Promise<ContainerType[]>{
    const provider=await getAiProvider("copy");
    try{
      const items=await callAi<RecommendationPayload[]>("structure","copy",{action:"structure-recommend",provider,params:{brief,count}});
      return items.map((item,index)=>({
        id:`ai-structure-${Date.now()}-${index}`,
        name:item.name,
        sketchUrl:createStructureSketch(item.shapeFamily,item.name,index+2),
        suitableCategories:[brief.product.category],
        dispensingType:item.interactionMethod,
        volumeOptions:item.specificationOptions,
        costLevel:item.costLevel,
        materialOptions:item.materialOptions,
        viewMode:item.viewMode,
        kind:item.kind,
        source:"ai",
        shapeFamily:item.shapeFamily,
        description:item.description,
        recommendationReason:item.recommendationReason,
        dimensions:brief.hardConstraints.dimensions,
        engineeringVerificationRequired:true,
        isCustom:true,
      }));
    }catch(error){
      emitAiNotice(`产品形态推荐失败（${provider}）：${aiErrorMessage(error)}`);
      throw error;
    }
  }
  async identify(brief:DesignBrief,imageUrl:string,fileName:string):Promise<ContainerType>{
    try{
      const [item]=await callAi<RecommendationPayload[]>("structure","copy",{action:"structure-identify",provider:"gemini",params:{brief,imageUrl}});
      return{id:`uploaded-structure-${Date.now()}`,name:item.name||fileName,sketchUrl:imageUrl,referenceImageUrl:imageUrl,suitableCategories:[brief.product.category],dispensingType:item.interactionMethod,volumeOptions:item.specificationOptions,costLevel:item.costLevel,materialOptions:item.materialOptions,viewMode:item.viewMode,kind:item.kind,source:"upload",shapeFamily:item.shapeFamily,description:item.description,recommendationReason:item.recommendationReason,dimensions:brief.hardConstraints.dimensions,engineeringVerificationRequired:true,isCustom:true};
    }catch(error){emitAiNotice(`上传结构识别失败：${aiErrorMessage(error)}`);throw error;}
  }
}

export const productStructureRecommender:ProductStructureRecommender=new AiProductStructureRecommender();
