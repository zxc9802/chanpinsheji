import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("product site keeps the main-site SSO callback and encrypted session contract", async () => {
  const [sso, callback, session, proxy, env] = await Promise.all([
    read("lib/main-app-sso.ts"),
    read("app/api/sso/callback/route.ts"),
    read("app/api/sso/session/route.ts"),
    read("proxy.ts"),
    read(".env.example"),
  ]);

  assert.match(sso, /const PRODUCT = ["']chanpinsheji["']/);
  assert.match(sso, /const COOKIE_NAME = ["']qycm_chanpinsheji_sso["']/);
  assert.match(sso, /https:\/\/chanpinsheji\.qycm\.top/);
  assert.match(sso, /externalSso/);
  assert.match(sso, /AES-GCM/);
  assert.match(sso, /expiresAt > Date\.now\(\)/);
  assert.match(sso, /\/api\/sso\/session/);
  assert.match(callback, /exchangeMainAppSsoTicket/);
  assert.match(callback, /createMainAppSessionCookie/);
  assert.match(session, /validateMainAppSession/);
  assert.match(proxy, /api\/sso\/callback/);
  assert.match(proxy, /request\.nextUrl\.pathname\.startsWith\(["']\/api\/["']\)/);
  assert.match(proxy, /getMainAppSsoLaunchUrl/);
  assert.match(env, /MAIN_APP_SSO_EXCHANGE_URL=https:\/\/www\.qycm\.top\/api\/external-sso\/chanpinsheji\/exchange/);
  assert.match(env, /MAIN_APP_SSO_CLIENT_SECRET=/);
  assert.match(env, /APP_SESSION_SECRET=/);
});
