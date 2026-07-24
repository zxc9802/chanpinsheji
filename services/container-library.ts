import type { DesignBrief } from "@/types/design-brief";
import type { ContainerType, ProductShapeFamily } from "@/types/container";

const xml=(value:string)=>value.replace(/[<>&'\"]/g,char=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[char]||char));
const dataSvg=(svg:string)=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function containerShapeMarkup(id:string,primary="#eef3ef",accent="#507965"){
  const shapes:Record<string,string>={
    dropper:`<rect x="145" y="112" width="110" height="205" rx="27" fill="url(#body)"/><rect x="163" y="78" width="74" height="48" rx="9" fill="${accent}"/><path d="M177 78V49c0-22 46-22 46 0v29" fill="${accent}"/><path d="M200 89v88" stroke="#fff" stroke-opacity=".65" stroke-width="5"/>`,
    pump:`<rect x="140" y="105" width="120" height="212" rx="25" fill="url(#body)"/><rect x="165" y="75" width="70" height="42" rx="7" fill="${accent}"/><path d="M181 75V52h72" stroke="${accent}" stroke-width="13" stroke-linecap="round"/><path d="M253 52h24" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>`,
    airless:`<rect x="146" y="90" width="108" height="227" rx="17" fill="url(#body)"/><rect x="153" y="60" width="94" height="42" rx="8" fill="${accent}"/><rect x="167" y="42" width="66" height="28" rx="6" fill="${accent}"/><path d="M200 42V28h50" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>`,
    tube:`<path d="M152 68h96l22 249H130z" fill="url(#body)"/><path d="M152 68h96" stroke="${accent}" stroke-width="13"/><rect x="157" y="306" width="86" height="33" rx="7" fill="${accent}"/>`,
    jar:`<rect x="110" y="170" width="180" height="135" rx="37" fill="url(#body)"/><rect x="103" y="135" width="194" height="55" rx="20" fill="${accent}"/><path d="M122 151h156" stroke="#fff" stroke-opacity=".35" stroke-width="5"/>`,
    ampoule:`<path d="M177 65h46v45c0 13 29 31 29 74v119c0 21-17 38-38 38h-28c-21 0-38-17-38-38V184c0-43 29-61 29-74z" fill="url(#body)"/><rect x="173" y="40" width="54" height="33" rx="8" fill="${accent}"/><path d="M185 40V22h30v18" fill="${accent}"/>`,
    spray:`<rect x="143" y="112" width="114" height="205" rx="24" fill="url(#body)"/><rect x="163" y="74" width="74" height="51" rx="8" fill="${accent}"/><path d="M181 74V48h53l29 19-29 17" fill="${accent}"/><circle cx="249" cy="67" r="6" fill="#fff"/>`,
    rollon:`<rect x="157" y="116" width="86" height="201" rx="31" fill="url(#body)"/><rect x="151" y="77" width="98" height="58" rx="21" fill="${accent}"/><circle cx="200" cy="76" r="35" fill="#eef2ef" stroke="${accent}" stroke-width="6"/>`,
    "mask-sachet":`<rect x="105" y="58" width="190" height="270" rx="16" fill="url(#body)"/><path d="M118 76h164M118 310h164" stroke="${accent}" stroke-width="5" stroke-dasharray="8 5"/><path d="M278 58l17 17" stroke="${accent}" stroke-width="5"/>`,
    "mask-pouch":`<path d="M115 84h170l-10 236H125z" fill="url(#body)"/><path d="M118 110h164" stroke="${accent}" stroke-width="8"/><rect x="165" y="64" width="70" height="24" rx="8" fill="${accent}"/>`,
    "rectangular_device":`<rect x="102" y="82" width="196" height="236" rx="34" fill="url(#body)"/><rect x="127" y="105" width="146" height="18" rx="9" fill="${accent}" opacity=".65"/><circle cx="270" cy="286" r="8" fill="${accent}"/><rect x="178" y="305" width="44" height="5" rx="2" fill="${accent}"/>`,
    "cylindrical":`<ellipse cx="200" cy="80" rx="74" ry="23" fill="${accent}" opacity=".75"/><path d="M126 80v220c0 31 148 31 148 0V80" fill="url(#body)"/><ellipse cx="200" cy="300" rx="74" ry="23" fill="${accent}" opacity=".35"/>`,
    "rigid_body":`<path d="M100 135l58-58h147l-5 208-55 44H98z" fill="url(#body)"/><path d="M100 135h145l60-58M245 135v194" fill="none" stroke="${accent}" stroke-width="5"/><circle cx="140" cy="180" r="12" fill="${accent}"/>`,
    "wearable":`<rect x="164" y="28" width="72" height="324" rx="34" fill="${accent}" opacity=".35"/><rect x="112" y="113" width="176" height="154" rx="42" fill="url(#body)"/><rect x="132" y="133" width="136" height="114" rx="27" fill="${accent}" opacity=".7"/>`,
    "custom":`<path d="M108 126l48-48h142v206l-52 48H106z" fill="url(#body)"/><path d="M108 126h138l52-48M246 126v206" fill="none" stroke="${accent}" stroke-width="5"/><path d="M170 190h60M200 160v60" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>`,
  };
  return shapes[id]||shapes.dropper;
}

export function createStructureSketch(family:ProductShapeFamily,name:string,index=0){
  return sketch(family,name,index);
}

function sketch(id:string,name:string,index:number){
  const accents=["#56806b","#507491","#7a6b91","#8b6b55","#5f7f7b","#6d7596","#66849b","#8a6e7d"];
  const accent=accents[index%accents.length];
  return dataSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="420" viewBox="0 0 400 380"><defs><linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="${accent}" stop-opacity=".28"/></linearGradient></defs><rect width="400" height="380" rx="24" fill="#f6f8f5"/><g stroke="${accent}" stroke-width="3">${containerShapeMarkup(id,"#eef3ef",accent)}</g><text x="200" y="360" text-anchor="middle" font-family="Arial,'Microsoft YaHei',sans-serif" font-size="16" fill="#27372f">${xml(name)}</text></svg>`);
}

const raw:Omit<ContainerType,"sketchUrl">[]=[
  {id:"mask-sachet",name:"单片面膜袋",suitableCategories:["贴片式面膜","贴片面膜","片状面膜","面膜贴"],dispensingType:"撕口取用",volumeOptions:["1片装","25ml/片","30ml/片"],costLevel:1,materialOptions:["铝塑复合膜","PET/AL/PE复合膜"],viewMode:"two_view"},
  {id:"mask-pouch",name:"多片面膜袋",suitableCategories:["贴片式面膜","贴片面膜","片状面膜","面膜贴"],dispensingType:"密封拉链取用",volumeOptions:["5片装","10片装","30片装"],costLevel:2,materialOptions:["高阻隔复合膜","PET/PE复合膜"],viewMode:"two_view"},
  {id:"dropper",name:"滴管瓶",suitableCategories:["精华液","精华油","面油","原液"],dispensingType:"滴管",volumeOptions:["15ml","30ml","50ml"],costLevel:2,materialOptions:["玻璃","PET","亚克力"],viewMode:"three_view"},
  {id:"pump",name:"按压泵瓶",suitableCategories:["乳液","精华液","洁面","洗护","身体乳"],dispensingType:"按压泵",volumeOptions:["30ml","50ml","100ml","150ml"],costLevel:2,materialOptions:["PET","PP","玻璃"],viewMode:"three_view"},
  {id:"airless",name:"真空瓶",suitableCategories:["精华液","乳液","面霜","眼霜"],dispensingType:"真空泵",volumeOptions:["15ml","30ml","50ml"],costLevel:3,materialOptions:["PP","PET","亚克力"],viewMode:"three_view"},
  {id:"tube",name:"软管",suitableCategories:["洁面","涂抹式面膜","睡眠面膜","防晒","护手霜","乳液"],dispensingType:"挤压",volumeOptions:["30ml","50ml","100ml","150ml"],costLevel:1,materialOptions:["PE","PP","铝塑复合"],viewMode:"three_view"},
  {id:"jar",name:"广口罐",suitableCategories:["面霜","涂抹式面膜","睡眠面膜","泥膜","膏霜","磨砂膏"],dispensingType:"广口",volumeOptions:["30g","50g","100g"],costLevel:2,materialOptions:["玻璃","PP","PET","亚克力"],viewMode:"three_view"},
  {id:"ampoule",name:"安瓶",suitableCategories:["精华液","安瓶","原液","冻干粉"],dispensingType:"折断 / 滴用",volumeOptions:["2ml","5ml","10ml"],costLevel:3,materialOptions:["玻璃","高硼硅玻璃"],viewMode:"three_view"},
  {id:"spray",name:"喷雾瓶",suitableCategories:["喷雾","爽肤水","香氛","防晒"],dispensingType:"喷雾",volumeOptions:["30ml","50ml","100ml","150ml"],costLevel:2,materialOptions:["PET","PP","玻璃"],viewMode:"three_view"},
  {id:"rollon",name:"滚珠瓶",suitableCategories:["眼部精华","精油","香氛","止汗"],dispensingType:"滚珠",volumeOptions:["5ml","10ml","15ml"],costLevel:2,materialOptions:["玻璃","PET","PP"],viewMode:"three_view"},
];

const familyFor=(id:string):ProductShapeFamily=>id.startsWith("mask-")?"pouch":id==="jar"?"jar":id==="tube"?"tube":"bottle";
export const containerTypes:ContainerType[]=raw.map((item,index)=>({...item,sketchUrl:sketch(item.id,item.name,index),kind:item.id.startsWith("mask-")?"flexible_pack":"liquid_container",source:"builtin",shapeFamily:familyFor(item.id),description:`适用于${item.suitableCategories.slice(0,3).join("、")}的标准产品结构`,engineeringVerificationRequired:true}));

export const containerCostLabel=(level:ContainerType["costLevel"])=>({1:"低",2:"中",3:"高"}[level]);

export function rankContainerTypes(brief:DesignBrief){
  const category=`${brief.product.industry} ${brief.product.category} ${brief.product.name}`;
  const score=(item:ContainerType)=>item.suitableCategories.reduce((total,value)=>total+(category.includes(value)||value.includes(brief.product.category)?8:0),0)+(brief.product.category.includes("精华")&&["dropper","airless"].includes(item.id)?10:0)-item.costLevel*.05;
  return [...containerTypes].sort((a,b)=>score(b)-score(a));
}

export function compatibleContainerTypes(brief:DesignBrief, custom:ContainerType[]=[]){
  const source=`${brief.product.category} ${brief.product.name} ${brief.product.texture}`.toLowerCase();
  let matched:ContainerType[];
  if(/(贴片|片状|片式|面膜贴)/.test(source)&&/面膜/.test(source)) matched=containerTypes.filter(item=>["mask-sachet","mask-pouch"].includes(item.id));
  else if(/(涂抹|睡眠|泥膜|膏状).*(面膜)|面膜.*(涂抹|睡眠|泥膜|膏状)/.test(source)) matched=containerTypes.filter(item=>["tube","jar","airless"].includes(item.id));
  else matched=containerTypes.filter(item=>item.suitableCategories.some(category=>source.includes(category.toLowerCase())||category.toLowerCase().includes(brief.product.category.toLowerCase())));
  if(!matched.length){
    const tokens=brief.product.category.split(/[·/、\s-]+/).filter(token=>token.length>=2);
    matched=containerTypes.filter(item=>item.suitableCategories.some(category=>tokens.some(token=>category.includes(token)||token.includes(category))));
  }
  return [...custom,...matched].filter((item,index,array)=>array.findIndex(other=>other.id===item.id)===index);
}

export function containerPainResponses(container:ContainerType,brief:DesignBrief){
  return brief.insights.filter(item=>item.type==="pain_point").flatMap(item=>{
    const text=item.content;
    if(/泵头|按压.*难|压不出|泵不出/.test(text)&&["dropper","tube","ampoule","rollon"].includes(container.id))return [text];
    if(/滴管|吸不上|吸取.*难/.test(text)&&["airless","pump","tube"].includes(container.id))return [text];
    if(/膏体|难取|挖取|沾手/.test(text)&&["tube","airless","pump"].includes(container.id))return [text];
    if(/漏液|渗漏|不密封/.test(text)&&["airless","tube","ampoule"].includes(container.id))return [text];
    if(/喷头|喷雾不均|喷不出/.test(text)&&["rollon","pump"].includes(container.id))return [text];
    return [];
  }).slice(0,2);
}

export function renderContainerDesignSvg(container:ContainerType,brand:string,product:string,colors:string[],material:string,volume:string){
  const primary=colors[0]||"#eff3ef",accent=colors[1]||"#587b68";
  return dataSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="680" height="680" viewBox="0 0 400 400"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}" stop-opacity=".12"/><stop offset="1" stop-color="${accent}" stop-opacity=".25"/></linearGradient><linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset=".55" stop-color="${primary}" stop-opacity=".82"/><stop offset="1" stop-color="${accent}"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="14" stdDeviation="11" flood-opacity=".18"/></filter></defs><rect width="400" height="400" rx="25" fill="url(#bg)"/><ellipse cx="200" cy="345" rx="100" ry="17" fill="#23342b" opacity=".12"/><g filter="url(#shadow)" transform="translate(0 5)">${containerShapeMarkup(container.shapeFamily||container.id,primary,accent)}</g><rect x="153" y="190" width="94" height="68" rx="7" fill="#fff" opacity=".88"/><text x="200" y="212" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#28362f">${xml((brand||"BRAND").slice(0,14))}</text><text x="200" y="231" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" fill="#56645c">${xml((product||"PRODUCT").slice(0,18))}</text><text x="200" y="250" text-anchor="middle" font-family="Arial,sans-serif" font-size="6" fill="#77837d">${xml(`${volume} · ${material}`)}</text></svg>`);
}
