import type { ProductCopyAdaptation, ProductCopyFace, ProductCopyLayoutItem, ProductCopyLayoutPlan } from "@/types/product-design";

const faceLabels:Record<ProductCopyFace,string>={front:"正面",side:"侧面",back:"背面"};

export function layoutItemsForFace(plan:ProductCopyLayoutPlan|undefined,face:ProductCopyFace){
  return (plan?.items||[]).filter(item=>item.enabled&&item.face===face).sort((a,b)=>a.priority-b.priority);
}

export function buildApprovedCopyPlacementInstruction(plan:ProductCopyLayoutPlan|undefined){
  if(!plan?.confirmed)return "包装上版规划尚未确认，不得生成设计提示词或产品图。";
  const lines=(["front","side","back"] as ProductCopyFace[]).map(face=>{
    const items=layoutItemsForFace(plan,face);
    const text=items.filter(item=>item.role!=="logo"&&item.displayText.trim()).map(item=>`「${item.displayText.trim()}」`);
    const logo=items.some(item=>item.role==="logo")?"使用定稿品牌标志；":"";
    return `${faceLabels[face]}排版：${logo}${text.length?`可见文字仅限 ${text.join("、")}`:"无可见文字"}`;
  });
  return `【已确认包装信息架构】\n${lines.join("\n")}\n书名号外的文字均为系统排版指令，不是包装可见文字。生成的设计提示词不得把来源字段名、栏目名或视图名写成需要印刷的标题。只能使用以上已确认显示文案，不得回填原始长文案，不得增加其他功效、成分、数据或承诺。`;
}

export function buildCopyAdaptationInstruction(adaptations:ProductCopyAdaptation[]|undefined,plan:ProductCopyLayoutPlan|undefined){
  if(!plan?.confirmed)return "包装上版规划尚未确认，不得生成设计提示词或产品图。";
  const active=(adaptations||[]).filter(item=>item.displayText.trim());
  if(!active.length)return buildApprovedCopyPlacementInstruction(plan);
  const byFace=(["front","side","back"] as ProductCopyFace[]).map(face=>{
    const items=active.filter(item=>item.face===face).sort((a,b)=>a.priority-b.priority);
    return `${faceLabels[face]}：${items.length?items.map(item=>`“${item.displayText.trim()}”`).join("、"):"无文字"}`;
  });
  return `【本方向最终采用的包装短文案】
${byFace.join("\n")}
以上引号内才是包装可见文字。不得再附加原始长文，不得印出“背面信息、功效说明、成分说明、使用说明”等来源字段名或系统说明。exact 文案必须逐字准确；其他文案只能按当前短文使用，不得新增功效、成分、数字、认证或承诺。`;
}

export function buildViewCopyInstruction(plan:ProductCopyLayoutPlan|undefined,view:ProductCopyFace){
  const items=layoutItemsForFace(plan,view);
  const other=(["front","side","back"] as ProductCopyFace[]).filter(face=>face!==view).flatMap(face=>layoutItemsForFace(plan,face)).map(item=>item.displayText).filter(Boolean);
  if(!items.length)return `本${faceLabels[view]}没有规划文字：只表现结构、材质和图案，必须保持无文字；不要生成品牌字样、随机字符或其他面的内容。`;
  return `本${faceLabels[view]}允许出现的可见内容仅限：${items.map(item=>item.role==="logo"?"定稿品牌标志":`「${item.displayText}」`).join("、")}。书名号外均为系统指令，不得印在产品上。不得出现其他面的文案${other.length?`（尤其禁止：${other.join("、")}）`:""}。`;
}

export function summarizeCopyFaces(items:ProductCopyLayoutItem[]){return (["front","side","back"] as ProductCopyFace[]).map(face=>({face,label:faceLabels[face],items:items.filter(item=>item.enabled&&item.face===face)}));}
