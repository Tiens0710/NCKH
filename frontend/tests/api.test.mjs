import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadApi(fetch) {
  const source = readFileSync(
    new URL("../lib/api.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const context = {
    exports: {},
    process: { env: {} },
    fetch,
    Intl,
    Date,
    Headers,
    AbortController,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(compiled.outputText, context);
  return context.exports;
}

test("FastAPI validation errors are readable rather than crashing on detail.includes", async () => {
  const { apiFetch } = loadApi(async () => ({
    ok: false,
    status: 422,
    json: async () => ({
      detail: [{ msg: "Invalid UUID" }, { msg: "Field required" }],
    }),
  }));
  await assert.rejects(apiFetch("/test"), {
    message: "Invalid UUID; Field required",
    status: 422,
  });
});

test("503 with structured detail does not masquerade as a Supabase config error", async () => {
  const { apiFetch } = loadApi(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ detail: [{ msg: "Worker unavailable" }] }),
  }));
  await assert.rejects(apiFetch("/test"), {
    message: "Worker unavailable",
    status: 503,
  });
});

test("network failure is reported as API unreachable", async () => {
  const { apiFetch } = loadApi(async () => {
    throw new Error("Connection refused");
  });
  await assert.rejects(
    apiFetch("/test"),
    (error) => error.status === 0 && error.message.includes("Không kết nối"),
  );
});

test("a stalled API request times out instead of spinning indefinitely", async () => {
  const { apiFetch } = loadApi(
    (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(new Error("Aborted")),
        );
      }),
  );
  await assert.rejects(
    apiFetch("/test", undefined, 10),
    (error) => error.status === 408,
  );
});

test("caller cancellation is not mislabeled as an API outage", async () => {
  const failure = new Error("Caller canceled");
  const { apiFetch } = loadApi(
    (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(failure));
      }),
  );
  const controller = new AbortController();
  const request = apiFetch("/test", { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, (error) => error === failure);
});

test("Headers instances retain authorization and get a default Accept header", async () => {
  const { apiFetch } = loadApi(async (url, options) => {
    assert.equal(options.headers.get("Authorization"), "Bearer test-value");
    assert.equal(options.headers.get("Accept"), "application/json");
    return { ok: true, json: async () => ({ ok: true }) };
  });
  assert.equal(
    (
      await apiFetch("/test", {
        headers: new Headers({ Authorization: "Bearer test-value" }),
      })
    ).ok,
    true,
  );
});
