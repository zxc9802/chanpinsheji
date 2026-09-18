import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { imageCraftFixtures, resolveImageCraftFamily } from "../services/prompts/image-craft.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("craft families route by pack material instead of a single global adjective", () => {
  for (const fixture of imageCraftFixtures) {
    assert.equal(resolveImageCraftFamily(fixture.signals), fixture.family, fixture.name);
  }
});

test("product and packaging prompts inject the craft block", async () => {
  const [imagePrompts, packagingPrompt, directionPrompt, packagingGenerator] = await Promise.all([
    read("../services/prompts/image-prompts.ts"),
    read("../services/prompts/packaging-design-prompt.ts"),
    read("../services/prompts/product-design-direction-prompt.ts"),
    read("../services/packaging-generator.ts"),
  ]);
  assert.match(imagePrompts, /const craft=buildImageCraftBlock/);
  assert.match(imagePrompts, /上方严格占画面 60%/);
  assert.match(imagePrompts, /第 2 张是不可改动的定稿 Logo 强参考/);
  assert.match(packagingPrompt, /buildImageCraftBlock/);
  assert.match(packagingPrompt, /【商业成像】/);
  assert.match(directionPrompt, /buildImageCraftBlock/);
  assert.match(directionPrompt, /主光\/工艺\/镜头/);
  assert.match(packagingGenerator, /buildImageCraftBlock/);
  assert.match(packagingGenerator, /subject:"outer_package"/);
  const studio = await read("../services/quick-design.ts");
  assert.match(studio, /buildImageCraftBlock/);
  assert.match(studio, /subject: 'outer_package'/);
});
