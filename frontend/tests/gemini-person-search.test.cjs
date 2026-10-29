const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function compile(file, dependencies = {}, globals = {}) {
  const target = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: target, exports: target.exports, require: name => name in dependencies ? dependencies[name] : require(name),
    AbortSignal, Response, Request, console, ...globals });
  return target.exports;
}
const intentModule = compile('lib/person-intent.ts');
const filter = (upper = [], lower = [], exclude_upper = [], exclude_lower = []) => ({ upper, lower, exclude_upper, exclude_lower });
const intent = { status: 'ok', message: 'Áo trắng, quần đen.', alternatives: [filter(['white'], ['black'])] };
test('validated intent handles OR, negation and never matches unknown colors on exclusion', () => {
  const tracks = [ ['white','black'], ['blue','black'], ['unknown','black'], ['red','white'] ].map(([upper,lower]) => ({ clothing_colors: { upper: { name: upper }, lower: { name: lower } } }));
  assert.equal(intentModule.filterPeopleByIntent(tracks, intent).length, 1);
  const notWhite = { ...intent, alternatives: [filter([], [], ['white'])] };
  assert.equal(intentModule.filterPeopleByIntent(tracks, notWhite).length, 2);
  assert.equal(intentModule.filterPeopleByIntent(tracks, { ...intent, alternatives: [filter(['white','blue'], ['black'])] }).length, 2);
  for (const invalid of [{ ...intent, alternatives: [] }, { ...intent, alternatives: [filter()] },
    { ...intent, alternatives: [filter(['white'], [], ['white'])] }, { ...intent, alternatives: [filter(['invented'])] },
    { ...intent, status: 'unsupported' }]) assert.throws(() => intentModule.validateIntent(invalid));
  assert.equal(intentModule.filterPeopleByIntent(tracks, { status: 'unsupported', message: 'Chưa hỗ trợ balô.', alternatives: [] }).length, 0);
});

function fixture(providerIntent = intent, status = 200) {
  const objects = new Map(); let calls = 0;
  class QueueError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const queue = { QueueError, read: async path => objects.get(path) ?? null,
    write: async (path, value, overwrite = true) => { if (!overwrite && objects.has(path)) return false; objects.set(path, value); return true; } };
  const module = compile('lib/gemini-person-search.ts', { 'server-only': {}, './demo-queue': queue, './person-intent': intentModule }, {
    process: { env: { GEMINI_API_KEY: 'secret-key', MULTICAM_WORKER_TOKEN: 'test-worker' } },
    fetch: async (url, options) => {
      calls++;
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
      assert.equal(options.headers['x-goog-api-key'], 'secret-key');
      const body = JSON.parse(options.body);
      assert.equal(body.contents[0].parts.length, 1);
      assert.equal(body.contents[0].parts[0].text.includes('secret-key'), false);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      return Response.json(status === 200 ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(providerIntent) }] } }] } : { error: { message: 'PRIVATE PROVIDER ERROR' } }, { status });
    },
  });
  return { module, objects, calls: () => calls };
}
test('deduplicates concurrent searches and caches by normalized query without storing raw input', async () => {
  const f = fixture();
  await Promise.all([f.module.understandPersonQuery('áo trắng'), f.module.understandPersonQuery('áo trắng')]);
  await f.module.understandPersonQuery(' ÁO   TRẮNG ');
  assert.equal(f.calls(), 1);
  assert.equal([...f.objects.keys()].some(path => path.includes('áo')), false);
  await assert.rejects(f.module.understandPersonQuery('x'.repeat(501)));
});
test('caps uncached requests at four per minute, preserves cached results', async () => {
  const f = fixture();
  for (let n = 0; n < 4; n++) await f.module.understandPersonQuery(`query ${n}`);
  await assert.rejects(f.module.understandPersonQuery('query 5'), error => error.status === 429);
  await f.module.understandPersonQuery('query 0');
  assert.equal(f.calls(), 4);
});
test('sanitizes upstream failures and rejects malformed model filters', async () => {
  const f = fixture(intent, 403);
  await assert.rejects(f.module.understandPersonQuery('áo trắng'), error => error.status === 503 && !error.message.includes('PRIVATE'));
  const bad = fixture({ ...intent, alternatives: [filter()] });
  await assert.rejects(bad.module.understandPersonQuery('áo trắng'), error => error.status === 502);
});
test('search endpoint authenticates job before invoking Gemini', async () => {
  let calls = 0;
  const route = compile('app/api/demo/jobs/[id]/search/route.ts', {
    '@/lib/demo-queue': { jobAuth: async () => { throw new Error('unauthorized'); }, failure: () => Response.json({}, { status: 404 }) },
    '@/lib/gemini-person-search': { understandPersonQuery: () => { calls++; } },
  });
  const response = await route.POST(new Request('https://demo.test/api/demo/jobs/id/search', { method: 'POST', body: '{}' }), { params: Promise.resolve({ id: 'id' }) });
  assert.equal(response.status, 404); assert.equal(calls, 0);
});
