export type CopyProviderName = "deepseek" | "gemini";
export type ImageProviderName = "fal" | "doubao" | "yunwu";
export type DocumentProviderName = "openlux";

export const aiServerConfig = {
  fal: {
    apiKey: process.env.FAL_KEY || process.env.FAL_GPT_IMAGE2_API_KEY || "",
    imageModel: "gpt-image-2.5-sunburst",
  },
  openlux: {
    apiKey: process.env.OPENLUX_API_KEY || "",
    baseUrl: process.env.OPENLUX_BASE_URL || "https://api.openlux.ai/v1",
    model: process.env.OPENLUX_MODEL || "gpt-5.6-luna",
  },
  regionVision: {
    apiKey: process.env.REGION_VISION_API_KEY || process.env.OPENLUX_API_KEY || "",
    baseUrl: process.env.REGION_VISION_BASE_URL || "https://api.openlux.ai",
    model: process.env.REGION_VISION_MODEL || "gemini-3.7-flash",
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  },
  yunwu: {
    apiKey: process.env.YUNWU_API_KEY || "",
    baseUrl: process.env.YUNWU_BASE_URL || "https://yunwu.ai",
    model: process.env.YUNWU_MODEL || "gemini-3.1-flash-lite",
    imageModel: process.env.YUNWU_IMAGE_MODEL || "gpt-image-2",
    imageSize: process.env.YUNWU_IMAGE_SIZE || "1024x1024",
    imageQuality: process.env.YUNWU_IMAGE_QUALITY || "low",
  },
  doubao: {
    apiKey: process.env.DOUBAO_API_KEY || "",
    baseUrl: process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
    imageModel: process.env.DOUBAO_IMAGE_MODEL || "",
  },
  defaults: {
    copy: (["deepseek","gemini"].includes(process.env.AI_PROVIDER_COPY || "") ? process.env.AI_PROVIDER_COPY : "deepseek") as CopyProviderName,
    image: (["fal","doubao","yunwu"].includes(process.env.AI_PROVIDER_IMAGE || "") ? process.env.AI_PROVIDER_IMAGE : "fal") as ImageProviderName,
  },
};
