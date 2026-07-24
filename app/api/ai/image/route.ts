import { aiServerConfig, type ImageProviderName } from "@/lib/ai-config";
import { fetchAiForm, fetchAiJson } from "@/lib/server-ai-client";

type ImagePayload = { data?: { url?: string; b64_json?: string }[]; usage?: { generated_images?: number; total_tokens?: number } };
type ImageRequest = { prompts?: string[]; provider?: ImageProviderName; referenceImages?: (string | undefined)[]; referenceImageGroups?: string[][]; size?:string; quality?:"low"|"medium"|"high" };

function imageUrl(payload: ImagePayload) {
  const item = payload.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/jpeg;base64,${item.b64_json}`;
  return undefined;
}

async function generateOne(prompt: string, provider: "doubao" | "yunwu", referenceImages:string[]=[],size?:string,quality?:"low"|"medium"|"high") {
  const referenceImage=referenceImages[0];
  if (provider === "yunwu") {
    if(referenceImage){const form=new FormData();form.append("model",aiServerConfig.yunwu.imageModel);form.append("prompt",prompt);for(const [index,url] of referenceImages.slice(0,10).entries()){const source=await fetch(url);if(!source.ok)throw new Error(`参考图 ${index+1} 读取失败：HTTP ${source.status}`);const blob=await source.blob();form.append(referenceImages.length>1?"image[]":"image",new File([blob],`reference-${index+1}.png`,{type:blob.type||"image/png"}));}form.append("n","1");form.append("size",size||aiServerConfig.yunwu.imageSize);form.append("quality",quality||aiServerConfig.yunwu.imageQuality);form.append("output_format","jpeg");return fetchAiForm<ImagePayload>({url:`${aiServerConfig.yunwu.baseUrl.replace(/\/$/,"")}/v1/images/edits`,apiKey:aiServerConfig.yunwu.apiKey,provider:"yunwu",generator:"image-edit",timeoutMs:120000,form});}
    return fetchAiJson<ImagePayload>({
      url: `${aiServerConfig.yunwu.baseUrl.replace(/\/$/, "")}/v1/images/generations`,
      apiKey: aiServerConfig.yunwu.apiKey,
      provider: "yunwu",
      generator: "image",
      timeoutMs: 120000,
      body: {
        model: aiServerConfig.yunwu.imageModel,
        prompt,
        n: 1,
        size: size||aiServerConfig.yunwu.imageSize,
        quality: quality||aiServerConfig.yunwu.imageQuality,
        format: "jpeg",
      },
    });
  }
  return fetchAiJson<ImagePayload>({
    url: `${aiServerConfig.doubao.baseUrl.replace(/\/$/, "")}/images/generations`,
    apiKey: aiServerConfig.doubao.apiKey,
    provider: "doubao",
    generator: "image",
    timeoutMs: 120000,
    body: {
      model: aiServerConfig.doubao.imageModel,
      prompt,
      size: size==="1024x1024"||size==="1024x1536"||size==="1536x1024"?"2K":size||"2K",
      response_format: "url",
      sequential_image_generation: "disabled",
      watermark: false,
      ...(referenceImages.length?{image:referenceImages.length===1?referenceImage:referenceImages}:{}),
    },
  });
}

async function generateInBatches(prompts: string[], provider: "doubao" | "yunwu", referenceImages:(string|undefined)[],referenceImageGroups:string[][],size?:string,quality?:"low"|"medium"|"high") {
  const results: PromiseSettledResult<Awaited<ReturnType<typeof generateOne>>>[] = [];
  for (let index = 0; index < prompts.length; index += 3) {
    results.push(...await Promise.allSettled(prompts.slice(index, index + 3).map((prompt,offset) => generateOne(prompt, provider, referenceImageGroups[index+offset]?.length?referenceImageGroups[index+offset]:referenceImages[index+offset]?[referenceImages[index+offset]!]:[],size,quality))));
  }
  return results;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ImageRequest;
    const provider = body.provider === "doubao" ? "doubao" : "yunwu";
    if (provider === "yunwu" && (!aiServerConfig.yunwu.apiKey || !aiServerConfig.yunwu.imageModel)) return Response.json({ error: "云雾图像密钥或模型未配置" }, { status: 503 });
    if (provider === "doubao" && (!aiServerConfig.doubao.apiKey || !aiServerConfig.doubao.imageModel)) return Response.json({ error: "豆包 Ark 密钥或图像模型 ID 未配置" }, { status: 503 });
    const prompts = (body.prompts || []).slice(0, 20).map(String).filter(Boolean);
    if (!prompts.length) return Response.json({ error: "缺少图像提示词" }, { status: 400 });
    const referenceImages=(body.referenceImages||[]).slice(0,prompts.length).map(value=>typeof value==="string"&&(value.startsWith("data:image/")||/^https:\/\//i.test(value))?value:undefined);
    const referenceImageGroups=(body.referenceImageGroups||[]).slice(0,prompts.length).map(group=>(Array.isArray(group)?group:[]).filter(value=>typeof value==="string"&&(value.startsWith("data:image/")||/^https:\/\//i.test(value))).slice(0,10));
    const size=typeof body.size==="string"&&/^(1024x1024|1024x1536|1536x1024|2K)$/.test(body.size)?body.size:undefined;
    const quality=["low","medium","high"].includes(body.quality||"")?body.quality:undefined;
    const results = await generateInBatches(prompts, provider, referenceImages,referenceImageGroups,size,quality);
    const images = results.map((result) => result.status === "fulfilled" ? imageUrl(result.value.data) : undefined);
    const succeeded = images.filter(Boolean).length;
    if (succeeded / prompts.length <= .5) {
      const reason=results.find((result):result is PromiseRejectedResult=>result.status==="rejected")?.reason;
      const detail=reason instanceof Error?reason.message:typeof reason==="string"?reason:"服务未返回图片";
      throw new Error(`图像生成成功率 ${Math.round(succeeded / prompts.length * 100)}%。原因：${detail}`);
    }
    const durationMs = Math.max(...results.flatMap((result) => result.status === "fulfilled" ? [result.value.usage.durationMs] : [0]));
    return Response.json({ data: images, usage: { provider, durationMs, images: succeeded } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "图像生成失败" }, { status: 502 });
  }
}
