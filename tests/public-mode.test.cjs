const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function load(relativePath, overrides = {}) {
  const filename = path.join(__dirname, "..", relativePath);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require, ...overrides }, { filename });
  return module.exports;
}

const { MODEL_REGISTRY } = load("lib/model-registry.ts");
const { modelsForMode, PUBLIC_PROVIDERS } = load("lib/provider-support.ts");

test("modo público excluye Ollama y solo deja proveedores con CORS comprobado", () => {
  const models = modelsForMode(MODEL_REGISTRY, true);
  assert.ok(models.length > 0);
  assert.equal(models.some((model) => model.provider === "ollama"), false);
  for (const model of models) assert.ok(PUBLIC_PROVIDERS.includes(model.provider), model.provider);
  assert.deepEqual([...PUBLIC_PROVIDERS].sort(), ["anthropic", "gemini", "groq", "openrouter", "siliconflow", "zai"]);
});

test("modo local oculta los proveedores solo-navegador (la ruta local no los conoce)", () => {
  const local = modelsForMode(MODEL_REGISTRY, false);
  assert.equal(local.some((m) => m.provider === "groq" || m.provider === "gemini"), false);
  assert.ok(local.some((m) => m.provider === "ollama"));
  assert.equal(local.length, MODEL_REGISTRY.filter((m) => m.provider !== "groq" && m.provider !== "gemini").length);
});

test("IS_PUBLIC es false cuando process no existe", () => {
  assert.equal(load("lib/app-mode.ts").IS_PUBLIC, false);
});

test("IS_PUBLIC es true solo con NEXT_PUBLIC_APP_MODE=public", () => {
  assert.equal(load("lib/app-mode.ts", { process: { env: { NEXT_PUBLIC_APP_MODE: "public" } } }).IS_PUBLIC, true);
  assert.equal(load("lib/app-mode.ts", { process: { env: {} } }).IS_PUBLIC, false);
});
