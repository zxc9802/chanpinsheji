import type { DesignBrief } from "@/types/design-brief";
import type { ContainerType, ProductStructureKind } from "@/types/container";
import type { ProductCopyLayoutPlan } from "@/types/product-design";

const flexiblePattern=/面膜|贴片|眼膜|鼻贴|足膜|单片袋|片装|袋装|软袋|小袋|补充袋|吸嘴袋|自立袋|pouch|sachet|mask sheet/i;
const liquidPattern=/精华液|乳液|面霜|乳霜|凝胶|喷雾|爽肤水|化妆水|香水|饮料|液体|膏体|油/i;

export function inferProductStructureKind(brief:DesignBrief,container?:ContainerType):ProductStructureKind{
  if(container?.kind&&container.kind!=="custom")return container.kind;
  const text=[brief.product.name,brief.product.category,brief.product.texture,container?.name,container?.description].filter(Boolean).join(" ");
  if(flexiblePattern.test(text))return"flexible_pack";
  if(liquidPattern.test(text))return"liquid_container";
  return container?.kind||"solid_product";
}

export function resolveProductViewMode(brief:DesignBrief,container?:ContainerType,plan?:ProductCopyLayoutPlan):"two_view"|"three_view"{
  const kind=inferProductStructureKind(brief,container);
  if(kind==="flexible_pack")return"two_view";
  if(plan?.confirmed)return plan.viewMode;
  if(container?.viewMode==="two_view")return"two_view";
  return"three_view";
}

export function normalizeCopyLayoutForViewMode(plan:ProductCopyLayoutPlan|undefined,mode:"two_view"|"three_view"):ProductCopyLayoutPlan|undefined{
  if(!plan)return undefined;
  return{...plan,viewMode:mode,items:plan.items.map(item=>mode==="two_view"&&item.face==="side"?{...item,face:"back" as const}:item)};
}
