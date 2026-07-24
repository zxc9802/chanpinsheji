import type { DesignBrief } from "@/types/design-brief";

export const exampleDesignBrief: DesignBrief = {
  projectId: "demo-hydraglow-serum-001",
  brand: {
    name: "澄露 CHANLUMI",
    positioning: "专研天然植萃科技的高效护肤品牌",
    personality: ["专业", "温和", "高效"],
    slogan: "让每一滴水光，都有迹可循",
    coreValues: "以透明配方和可验证功效，为敏感肌提供安心有效的日常护理。",
  },
  product: {
    name: "水润焕亮精华液",
    category: "精华液",
    industry: "美妆护肤",
    targetMarket: "中国大陆一二线城市",
    salesChannel: "天猫 / 抖音 / 品牌官网",
    priceBand: "¥199–299",
    coreSellingPoints: [
      { point: "72 小时长效保湿", sourceInsightId: "insight-001" },
      { point: "敏感肌适用的温和焕亮配方", sourceInsightId: "insight-002" },
      { point: "轻盈不黏腻，妆前使用不搓泥" },
    ],
    keyIngredients: ["三重玻尿酸", "烟酰胺", "白睡莲提取物"],
    efficacy: ["深层保湿", "提亮肤色", "舒缓修护"],
    usageScenarios: "早晚护肤精华步骤；换季干燥、熬夜暗沉时重点使用",
    texture: "清透水感凝露，快速吸收不黏腻",
  },
  consumer: {
    ageRange: "25–35 岁",
    keywords: ["保湿", "焕亮", "敏感肌可用", "成分透明"],
  },
  insights: [
    { id: "insight-001", type: "pain_point", content: "普通保湿精华持效短，需要反复补涂", frequency: 126 },
    { id: "insight-002", type: "need", content: "敏感肌希望兼顾温和与提亮功效", frequency: 98 },
    { id: "insight-003", type: "opportunity", content: "用户偏好能够清晰表达成分与功效依据的包装", frequency: 74 },
  ],
  styleKeywords: ["现代极简·清新科技", "水感通透"],
  hardConstraints: { maxPackageCost: "≤ ¥18/套", dimensions: "45 × 45 × 125 mm" },
};
