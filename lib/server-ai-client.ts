export type ServerAiUsage = { provider: string; durationMs: number; tokens?: number; images?: number };
export async function fetchAiJson<T>(args: { url: string; apiKey: string; body: unknown; timeoutMs: number; provider: string; generator: string; authHeaders?: Record<string,string> }): Promise<{ data: T; usage: ServerAiUsage }> {
  const started = Date.now(); let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
      const response = await fetch(args.url, { method: "POST", headers: { "Content-Type": "application/json", ...(args.authHeaders || { Authorization: `Bearer ${args.apiKey}` }) }, body: JSON.stringify(args.body), signal: controller.signal });
      const payload = await response.json() as T & { error?: { message?: string }; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; generated_images?: number; output_tokens?: number } };
      if (!response.ok) throw new Error(payload.error?.message || `HTTP ${response.status}`);
      const tokens = payload.usage?.total_tokens ?? ((payload.usage?.prompt_tokens || 0) + (payload.usage?.completion_tokens || payload.usage?.output_tokens || 0));
      return { data: payload, usage: { provider: args.provider, durationMs: Date.now() - started, ...(tokens ? { tokens } : {}), ...(payload.usage?.generated_images ? { images: payload.usage.generated_images } : {}) } };
    } catch (error) {
      lastError = error;
      console.error(`[ai:${args.generator}] ${args.provider} attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : "unknown");
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    } finally { clearTimeout(timeout); }
  }
  throw lastError instanceof Error ? lastError : new Error("AI 请求失败");
}

export async function fetchAiForm<T>(args:{url:string;apiKey:string;form:FormData;timeoutMs:number;provider:string;generator:string}):Promise<{data:T;usage:ServerAiUsage}>{
  const started=Date.now();let lastError:unknown;
  for(let attempt=0;attempt<3;attempt+=1){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),args.timeoutMs);try{const response=await fetch(args.url,{method:"POST",headers:{Authorization:`Bearer ${args.apiKey}`},body:args.form,signal:controller.signal});const payload=await response.json() as T&{error?:{message?:string};usage?:{total_tokens?:number;generated_images?:number}};if(!response.ok)throw new Error(payload.error?.message||`HTTP ${response.status}`);return{data:payload,usage:{provider:args.provider,durationMs:Date.now()-started,...(payload.usage?.total_tokens?{tokens:payload.usage.total_tokens}:{}),images:payload.usage?.generated_images||1}}}catch(error){lastError=error;console.error(`[ai:${args.generator}] ${args.provider} multipart attempt ${attempt+1} failed:`,error instanceof Error?error.message:"unknown");if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*2**attempt));}finally{clearTimeout(timeout)}}throw lastError instanceof Error?lastError:new Error("AI 图片编辑请求失败");
}
