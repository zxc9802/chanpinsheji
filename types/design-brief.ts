/**
 * 包装设计智能体与上游模块之间的数据合同。
 * 修改此文件时，请同步确认模块 A 的输出格式。
 */
export interface DesignBrief {
  projectId: string;
  brand: {
    name: string;
    positioning: string;
    personality: string[];
    slogan: string;
    coreValues: string;
  };
  product: {
    name: string;
    category: string;
    industry: string;
    targetMarket: string;
    salesChannel: string;
    priceBand: string;
    coreSellingPoints: { point: string; sourceInsightId?: string }[];
    keyIngredients: string[];
    efficacy: string[];
    usageScenarios: string;
    texture: string;
  };
  consumer: {
    ageRange: string;
    keywords: string[];
  };
  insights: {
    id: string;
    type: "pain_point" | "opportunity" | "need";
    content: string;
    frequency: number;
  }[];
  styleKeywords: string[];
  hardConstraints: {
    maxPackageCost?: string;
    dimensions?: string;
  };
}

export const emptyDesignBrief = (): DesignBrief => ({
  projectId: "",
  brand: { name: "", positioning: "", personality: [], slogan: "", coreValues: "" },
  product: {
    name: "",
    category: "",
    industry: "",
    targetMarket: "",
    salesChannel: "",
    priceBand: "",
    coreSellingPoints: [],
    keyIngredients: [],
    efficacy: [],
    usageScenarios: "",
    texture: "",
  },
  consumer: { ageRange: "", keywords: [] },
  insights: [],
  styleKeywords: [],
  hardConstraints: {},
});
