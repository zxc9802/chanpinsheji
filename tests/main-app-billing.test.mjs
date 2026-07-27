import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("text and background image calls reserve and settle main-site credits", async () => {
  const client = await readFile(new URL("../lib/server-ai-client.ts", import.meta.url), "utf8");
  const imageRoute = await readFile(new URL("../app/api/ai/image/route.ts", import.meta.url), "utf8");
  const billing = await readFile(new URL("../lib/main-app-billing.ts", import.meta.url), "utf8");

  assert.match(client, /reserveMainAppCredits\(/);
  assert.match(client, /billing\.settleText\(/);
  assert.match(client, /billing\.settleMedia\(\)/);
  assert.match(client, /billing\.release\(\)/);
  assert.match(client, /instanceof MainAppBillingError/);
  assert.match(imageRoute, /billingUserId:\s*await currentBillingUserId\(\)/);
  assert.match(billing, /product:\s*"chanpinsheji"/);
  assert.match(billing, /x-qycm-sso-client-secret/);
  assert.match(billing, /class MainAppBillingError extends Error/);
});
