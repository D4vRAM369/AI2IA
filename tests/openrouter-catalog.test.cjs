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
const base = MODEL_REGISTRY.filter((m) => m.provider !== "ollama");
const entry = (id, over = {}) => ({
  id, name: `Nombre ${id} (free)`, pricing: { prompt: "0", completion: "0" },
  architecture: { input_modalities: ["text"], output_modalities: ["text"] }, ...over,
});
const json = (value) => JSON.parse(JSON.stringify(value));

test("quita los :free que ya no existen y conserva openrouter/free", () => {
  const { mergeFreeModels } = load("lib/openrouter-catalog.ts");
  const out = mergeFreeModels(base, { data: [entry("google/gemma-4-31b-it:free")] });
  const models = out.map((m) => m.model);
  assert.ok(models.includes("openrouter/free"));
  assert.ok(models.includes("google/gemma-4-31b-it:free"));
  assert.ok(!models.includes("google/gemma-4-26b-a4b-it:free"));
});

test("añade modelos nuevos y marca los que razonan", () => {
  const { mergeFreeModels } = load("lib/openrouter-catalog.ts");
  const out = mergeFreeModels(base, { data: [entry("acme/nuevo:free", { reasoning: true }), entry("acme/otro:free")] });
  const nuevo = out.find((m) => m.model === "acme/nuevo:free");
  assert.deepEqual(json({ provider: nuevo.provider, apiClass: nuevo.apiClass }), { provider: "openrouter", apiClass: "free" });
  assert.match(nuevo.note, /razona/);
  assert.doesNotMatch(out.find((m) => m.model === "acme/otro:free").note, /razona/);
  assert.equal(nuevo.label, "Nombre acme/nuevo:free (OpenRouter free)");
  assert.equal(new Set(out.map((m) => m.key)).size, out.length);
});

test("descarta lo que no es gratis, no es :free, no es solo texto o tiene id raro", () => {
  const { mergeFreeModels } = load("lib/openrouter-catalog.ts");
  const out = mergeFreeModels(base, { data: [
    entry("a/pago:free", { pricing: { prompt: "0.1", completion: "0" } }),
    entry("a/sinsufijo"),
    entry("a/musica:free", { architecture: { input_modalities: ["text"], output_modalities: ["text", "audio"] } }),
    entry("a/imagen:free", { architecture: { input_modalities: ["image"], output_modalities: ["text"] } }),
    entry("a/<script>:free"),
    entry("a/ok:free"),
  ] });
  const models = out.map((m) => m.model);
  for (const bad of ["a/pago:free", "a/sinsufijo", "a/musica:free", "a/imagen:free", "a/<script>:free"]) assert.ok(!models.includes(bad), bad);
  assert.ok(models.includes("a/ok:free"));
});

test("limita a 10 los modelos nuevos", () => {
  const { mergeFreeModels } = load("lib/openrouter-catalog.ts");
  const data = Array.from({ length: 30 }, (_, i) => entry(`x/m${i}:free`));
  assert.equal(mergeFreeModels(base, { data }).length - base.filter((m) => m.provider !== "openrouter" || m.model === "openrouter/free").length, 10);
});

test("un catálogo con forma inesperada devuelve la lista fija", () => {
  const { mergeFreeModels } = load("lib/openrouter-catalog.ts");
  for (const bad of [null, undefined, {}, { data: "x" }, { data: [] }, { data: [null, 5, {}] }, "texto"]) {
    assert.equal(mergeFreeModels(base, bad), base);
  }
});

test("loadFreeModels: sin red, error HTTP o JSON roto devuelven la lista fija; con éxito la mezcla", async () => {
  const run = (fetch) => load("lib/openrouter-catalog.ts", { fetch }).loadFreeModels(base);
  assert.equal(await run(async () => { throw new TypeError("sin red"); }), base);
  assert.equal(await run(async () => new Response("{}", { status: 500 })), base);
  assert.equal(await run(async () => new Response("no json")), base);
  const ok = await run(async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/models");
    assert.equal(options.headers, undefined);
    assert.equal(options.method, undefined);
    return Response.json({ data: [entry("acme/nuevo:free")] });
  });
  assert.ok(ok.some((m) => m.model === "acme/nuevo:free"));
});
