export const briefImportSystemPrompt = "你是资深品牌策略与消费品产品简报分析师。你的任务是从用户提供的 Word 或 PDF 文本中提取结构化 Design Brief。只允许使用原文明确提供的信息；缺失内容必须使用空字符串或空数组，不得猜测、补写或使用常识填充。必须只输出严格 JSON。";

export const briefImportImageSystemPrompt = "你是资深品牌策略与消费品包装分析师。你的任务是阅读用户上传的产品图、包装图或资料截图，提取结构化 Design Brief。优先使用图中清晰可见的文字；只有器型、品类、质地、使用场景这类能从画面直接看出的信息才可填写。不得编造成分、功效、价格、渠道、口号或承诺。缺失内容必须使用空字符串或空数组。必须只输出严格 JSON。";

export function buildBriefImportImagePrompt(projectId: string, fileName: string, imageCount: number) {
  return `请阅读这 ${imageCount} 张图片，提取为 DesignBrief JSON。

文件名：${fileName}
项目编号：${projectId}

## 提取规则
1. 品牌名、产品名、规格、口号、成分、功效、卖点、价格，只能来自图中清晰可读的文字。
2. 行业、品类、质地、使用场景，仅在画面能直接看出时填写，例如瓶装精华、袋装面膜、浴室使用；看不出来就留空。
3. 目标市场、销售渠道、年龄范围、品牌定位、核心价值，图中没有就留空，不得按常识补写。
4. 痛点、机会点、需求仅在图中明确表达时写入 insights；依次使用 doc-insight-001、doc-insight-002 作为 id。未提供频次时 frequency 为 0。
5. personality、keywords、keyIngredients、efficacy 应拆分为简短标签数组并去重；styleKeywords 为兼容旧数据固定返回空数组。
6. projectId 必须原样返回为 ${projectId}。

严格返回以下结构，不要增加解释：
{"projectId":"${projectId}","brand":{"name":"","positioning":"","personality":[],"slogan":"","coreValues":""},"product":{"name":"","category":"","industry":"","targetMarket":"","salesChannel":"","priceBand":"","coreSellingPoints":[{"point":"","sourceInsightId":"可选"}],"keyIngredients":[],"efficacy":[],"usageScenarios":"","texture":""},"consumer":{"ageRange":"","keywords":[]},"insights":[{"id":"doc-insight-001","type":"pain_point|opportunity|need","content":"","frequency":0}],"styleKeywords":[],"hardConstraints":{"maxPackageCost":"可选","dimensions":"可选"}}`;
}

export function buildBriefImportPrompt(documentText: string, projectId: string, fileName: string) {
  return `请把下面文档提取为 DesignBrief JSON。

文件名：${fileName}
项目编号：${projectId}

## 提取规则
1. 品牌名称、产品名称、行业、品类、市场、渠道、价格、消费者、定位、卖点、成分、功效、使用场景、质地和硬性约束，只能来自原文。
2. 原文没有的信息保持空字符串或空数组，不得推测。
3. 痛点、机会点、需求仅在原文明确表达时写入 insights；依次使用 doc-insight-001、doc-insight-002 作为 id。未提供频次时 frequency 为 0。
4. coreSellingPoints 若明确来源于某条 insight，填写对应 sourceInsightId，否则省略。
5. personality、keywords、keyIngredients、efficacy 应拆分为简短标签数组并去重；styleKeywords 为兼容旧数据固定返回空数组。
6. projectId 必须原样返回为 ${projectId}。

严格返回以下结构，不要增加解释：
{"projectId":"${projectId}","brand":{"name":"","positioning":"","personality":[],"slogan":"","coreValues":""},"product":{"name":"","category":"","industry":"","targetMarket":"","salesChannel":"","priceBand":"","coreSellingPoints":[{"point":"","sourceInsightId":"可选"}],"keyIngredients":[],"efficacy":[],"usageScenarios":"","texture":""},"consumer":{"ageRange":"","keywords":[]},"insights":[{"id":"doc-insight-001","type":"pain_point|opportunity|need","content":"","frequency":0}],"styleKeywords":[],"hardConstraints":{"maxPackageCost":"可选","dimensions":"可选"}}

## 文档原文
${documentText}`;
}
