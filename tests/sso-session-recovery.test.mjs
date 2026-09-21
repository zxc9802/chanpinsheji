import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextResponse } = require('next/server');

async function load(relative, stubs = {}) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    throw new Error('Unexpected import: ' + name);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

async function scenario(run) {
  const oldFetch = globalThis.fetch;
  const oldNow = Date.now;
  const oldSecret = process.env.APP_SESSION_SECRET;
  let now = 1_800_000_000_000;
  Date.now = () => now;
  process.env.APP_SESSION_SECRET = 'test-session-secret';
  try {
    const sso = await load('../lib/main-app-sso.ts');
    const { proxy } = await load('../proxy.ts', { 'next/server': { NextResponse }, './lib/main-app-sso': sso });
    const { GET } = await load('../app/api/sso/session/route.ts', { 'next/server': { NextResponse }, '@/lib/main-app-sso': sso });
    const session = {
      token: 'test-main-token',
      user: { id: 'test-user', account: 'test', nickname: 'Test', role: 'member' },
      expiresAt: now + 7 * 86_400_000,
    };
    const value = await sso.createMainAppSessionCookie(session);
    const request = (pathname = '/api/projects', cookie = value) => ({
      nextUrl: new URL(pathname, 'https://tool.example'),
      cookies: { get: () => cookie ? { value: cookie } : undefined },
    });
    await run({ sso, proxy, GET, request, session, advance: ms => { now += ms; } });
  } finally {
    globalThis.fetch = oldFetch;
    Date.now = oldNow;
    if (oldSecret === undefined) delete process.env.APP_SESSION_SECRET;
    else process.env.APP_SESSION_SECRET = oldSecret;
  }
}

for (const failure of [429, 500, 502, 503, 'network', 'timeout']) {
  test('preserves a valid session and blocks requests during ' + failure, async () => {
    await scenario(async ({ proxy, GET, request, advance }) => {
      globalThis.fetch = async () => new Response('{}', { status: 200 });
      assert.equal((await proxy(request())).status, 200);
      advance(31_000);
      globalThis.fetch = async () => {
        if (failure === 'network') throw new TypeError('fetch failed');
        if (failure === 'timeout') throw new DOMException('timed out', 'TimeoutError');
        return new Response('{}', { status: failure });
      };
      for (const response of [await proxy(request()), await proxy(request('/')), await GET(request('/api/sso/session'))]) {
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('set-cookie'), null);
        assert.equal(response.headers.get('location'), null);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('retry-after'), '5');
        assert.match(await response.text(), /稍后.*重试/);
      }
      globalThis.fetch = async () => new Response('{}', { status: 200 });
      assert.equal((await proxy(request())).status, 200);
      assert.equal((await GET(request('/api/sso/session'))).status, 200);
    });
  });
}

for (const status of [401, 403]) {
  test('revoked or disabled sessions remain rejected: ' + status, async () => {
    await scenario(async ({ proxy, GET, request }) => {
      globalThis.fetch = async () => new Response('{}', { status });
      for (const response of [await proxy(request()), await GET(request('/api/sso/session'))]) {
        assert.equal(response.status, 401);
        assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
      }
      assert.equal((await proxy(request('/'))).status, 307);
    });
  });
}

test('expired and missing cookies stay rejected even during an outage', async () => {
  await scenario(async ({ proxy, GET, request, advance }) => {
    globalThis.fetch = async () => { throw new Error('expired cookies must not reach the upstream'); };
    advance(8 * 86_400_000);
    assert.equal((await proxy(request())).status, 401);
    assert.equal((await GET(request('/api/sso/session'))).status, 401);
    assert.equal((await proxy(request('/api/projects', ''))).status, 401);
  });
});
