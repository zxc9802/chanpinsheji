import { aiServerConfig, type ImageProviderName } from "@/lib/ai-config";
import { ImageJobManager, type ImageJobResult } from "@/lib/image-job-manager";
import { currentBillingUserId } from "@/lib/main-app-billing";
import { fetchAiForm, fetchAiJson } from "@/lib/server-ai-client";

type ImagePayload = { data?: { url?: string; b64_json?: string }[]; usage?: { generated_images?: number; total_tokens?: number } };
type ImageRequest = { prompts?: string[]; provider?: ImageProviderName; referenceImages?: (string | undefined)[]; referenceImageGroups?: string[][]; size?:string; quality?:"low"|"medium"|"high" };
type NormalizedImageRequest = {
  prompts: string[];
  provider: "doubao" | "yunwu";
  referenceImages: (string | undefined)[];
  referenceImageGroups: string[][];
  size?: string;
  quality?: "low" | "medium" | "high";
};
type QueuedImageRequest = NormalizedImageRequest & { billingUserId: string };

class ImageRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const imageJobRuntime = globalThis as typeof globalThis & {
  __packPilotImageJobManager?: ImageJobManager<QueuedImageRequest>;
};
const imageJobManager = imageJobRuntime.__packPilotImageJobManager ??= new ImageJobManager<QueuedImageRequest>();

function imageUrl(payload: ImagePayload) {
  const item = payload.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/jpeg;base64,${item.b64_json}`;
  return undefined;
}

async function generateOne(prompt: string, provider: "doubao" | "yunwu", referenceImages:string[]=[],size?:string,quality?:"low"|"medium"|"high",billingUserId?:string) {
  const referenceImage=referenceImages[0];
  if (provider === "yunwu") {
    if(referenceImage){const form=new FormData();form.append("model",aiServerConfig.yunwu.imageModel);form.append("prompt",prompt);for(const [index,url] of referenceImages.slice(0,10).entries()){const source=await fetch(url);if(!source.ok)throw new Error(`参考图 ${index+1} 读取失败：HTTP ${source.status}`);const blob=await source.blob();form.append(referenceImages.length>1?"image[]":"image",new File([blob],`reference-${index+1}.png`,{type:blob.type||"image/png"}));}form.append("n","1");form.append("size",size||aiServerConfig.yunwu.imageSize);form.append("quality",quality||aiServerConfig.yunwu.imageQuality);form.append("output_format","jpeg");return fetchAiForm<ImagePayload>({url:`${aiServerConfig.yunwu.baseUrl.replace(/\/$/,"")}/v1/images/edits`,apiKey:aiServerConfig.yunwu.apiKey,provider:"yunwu",generator:"image-edit",timeoutMs:120000,form,billingUserId});}
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
      billingUserId,
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
    billingUserId,
  });
}

async function generateInBatches(prompts: string[], provider: "doubao" | "yunwu", referenceImages:(string|undefined)[],referenceImageGroups:string[][],size?:string,quality?:"low"|"medium"|"high",billingUserId?:string,onImage?: (index:number,result:Awaited<ReturnType<typeof generateOne>>) => void) {
  const results: PromiseSettledResult<Awaited<ReturnType<typeof generateOne>>>[] = [];
  for (let index = 0; index < prompts.length; index += 3) {
    results.push(...await Promise.allSettled(prompts.slice(index, index + 3).map(async (prompt,offset) => {
      const result=await generateOne(prompt, provider, referenceImageGroups[index+offset]?.length?referenceImageGroups[index+offset]:referenceImages[index+offset]?[referenceImages[index+offset]!]:[],size,quality,billingUserId);
      onImage?.(index+offset,result);
      return result;
    })));
  }
  return results;
}

function normalizeImageRequest(body: ImageRequest): NormalizedImageRequest {
  const provider = body.provider === "doubao" ? "doubao" : "yunwu";
  if (provider === "yunwu" && (!aiServerConfig.yunwu.apiKey || !aiServerConfig.yunwu.imageModel)) throw new ImageRequestError("云雾图像密钥或模型未配置", 503);
  if (provider === "doubao" && (!aiServerConfig.doubao.apiKey || !aiServerConfig.doubao.imageModel)) throw new ImageRequestError("豆包 Ark 密钥或图像模型 ID 未配置", 503);
  const prompts = (body.prompts || []).slice(0, 20).map(String).filter(Boolean);
  if (!prompts.length) throw new ImageRequestError("缺少图像提示词", 400);
  const referenceImages=(body.referenceImages||[]).slice(0,prompts.length).map(value=>typeof value==="string"&&(value.startsWith("data:image/")||/^https:\/\//i.test(value))?value:undefined);
  const referenceImageGroups=(body.referenceImageGroups||[]).slice(0,prompts.length).map(group=>(Array.isArray(group)?group:[]).filter(value=>typeof value==="string"&&(value.startsWith("data:image/")||/^https:\/\//i.test(value))).slice(0,10));
  const size=typeof body.size==="string"&&/^(1024x1024|1024x1536|1536x1024|2K)$/.test(body.size)?body.size:undefined;
  const quality=["low","medium","high"].includes(body.quality||"")?body.quality:undefined;
  return { prompts, provider, referenceImages, referenceImageGroups, size, quality };
}

async function runImageJob(body: QueuedImageRequest,publishProgress?: (result:ImageJobResult) => void): Promise<ImageJobResult> {
  const images:(string|undefined)[]=Array.from({length:body.prompts.length});
  let durationMs=0;
  const results = await generateInBatches(body.prompts, body.provider, body.referenceImages, body.referenceImageGroups, body.size, body.quality,body.billingUserId,(index,result)=>{
    images[index]=imageUrl(result.data);
    durationMs=Math.max(durationMs,result.usage.durationMs);
    publishProgress?.({data:[...images],usage:{provider:body.provider,durationMs,images:images.filter(Boolean).length}});
  });
  const completedImages = results.map((result) => result.status === "fulfilled" ? imageUrl(result.value.data) : undefined);
  const succeeded = completedImages.filter(Boolean).length;
  if (succeeded / body.prompts.length <= .5) {
    const reason=results.find((result):result is PromiseRejectedResult=>result.status==="rejected")?.reason;
    const detail=reason instanceof Error?reason.message:typeof reason==="string"?reason:"服务未返回图片";
    throw new Error(`图像生成成功率 ${Math.round(succeeded / body.prompts.length * 100)}%。原因：${detail}`);
  }
  const completedDurationMs = Math.max(...results.flatMap((result) => result.status === "fulfilled" ? [result.value.usage.durationMs] : [0]));
  return { data: completedImages, usage: { provider: body.provider, durationMs: completedDurationMs, images: succeeded } };
}

export async function POST(request: Request) {
  try {
    const body: QueuedImageRequest = {
      ...normalizeImageRequest(await request.json() as ImageRequest),
      billingUserId: await currentBillingUserId(),
    };
    const job = imageJobManager.enqueue(body, (publishProgress) => runImageJob(body,publishProgress));
    return Response.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "图像任务创建失败" }, { status: error instanceof ImageRequestError ? error.status : 400 });
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return Response.json({ error: "缺少图像任务 ID" }, { status: 400 });
  const job = imageJobManager.get(jobId);
  if (!job) return Response.json({ error: "图像任务不存在或已过期，请重新生成" }, { status: 404 });
  return Response.json(job);
}
