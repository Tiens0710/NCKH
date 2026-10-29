// One live provider call using the actual parser; no videos, job tokens or keys printed.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
function load(file, deps, globals = {}) {
  const output = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: output, exports: output.exports, require: name => name in deps ? deps[name] : require(name),
    Response, AbortSignal, fetch, console, ...globals });
  return output.exports;
}
const key = fs.readFileSync(path.resolve('../.cache/gemini-api-key'), 'utf8').trim();
const intent = load('lib/person-intent.ts', {});
const model = load('lib/gemini-person-search.ts', { 'server-only': {}, './person-intent': intent,
  './demo-queue': { read: async () => null, write: async () => true, QueueError: class extends Error {} },
}, { process: { env: { GEMINI_API_KEY: key, MULTICAM_WORKER_TOKEN: 'probe-no-job-data' } },
  fetch: async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const data = await response.clone().json().catch(() => ({}));
      console.log(JSON.stringify({ http_status: response.status, error_status: data.error?.status,
        reasons: data.error?.details?.map(item => item.reason).filter(Boolean) ?? [],
        message: String(data.error?.message ?? '').replaceAll(key, '[redacted]').slice(0, 500) }));
    }
    return response;
  },
});
model.understandPersonQuery('Tìm giúp tôi người mặc áo sáng màu, phía dưới tối màu')
  .then(result => console.log(JSON.stringify({ model: 'gemini-2.5-flash', intent: result })))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
