const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
function load(relativePath, overrides = {}, append = "") {
  const filename = path.join(__dirname, "..", relativePath);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source + append, {
    module,
    exports: module.exports,
    require: (name) => name === "@/lib/model-registry" ? registry
      : name === "@/lib/dialogue-config" ? dialogueConfig : require(name),
    Error, AbortSignal,
    ...overrides,
  }, { filename });
  return module.exports;
}

const registry = load("lib/model-registry.ts");
const dialogueConfig = load("lib/dialogue-config.ts");

test("ids únicos y con forma /^[a-z0-9-]+$/", () => {
  const { getExamples } = load("lib/examples.ts");
  const ids = Array.from(getExamples(), (example) => example.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/);
});

test("todo role es A, B u OBS", () => {
  const { getExamples } = load("lib/examples.ts");
  for (const example of getExamples()) {
    for (const turn of example.turns) assert.ok(["A", "B", "OBS"].includes(turn.role));
  }
});

test("hay al menos 2 ejemplos", () => {
  const { getExamples } = load("lib/examples.ts");
  assert.ok(getExamples().length >= 2);
  assert.deepEqual(Array.from(getExamples(), (example) => example.id), ["naturaleza-ia", "viajes-universos", "curiosidad", "compilador"]);
});

test("las maquetas están marcadas y el ejemplo real no", () => {
  const { getExamples } = load("lib/examples.ts");
  for (const example of getExamples()) {
    if (example.provisional) {
      assert.match(example.modelA, /maqueta/i);
      assert.match(example.modelB, /maqueta/i);
    } else {
      assert.doesNotMatch(`${example.modelA} ${example.modelB}`, /maqueta/i);
    }
  }
  assert.deepEqual(Array.from(getExamples(), (example) => example.provisional), [false, false, true, true]);
});

test("naturaleza-ia es una conversación real exportada, sin razonamiento interno filtrado", () => {
  const { getExample } = load("lib/examples.ts");
  const example = getExample("naturaleza-ia");
  assert.equal(example.date, "2026-11-07");
  assert.match(example.modelA, /GLM-4\.5-Flash/);
  assert.match(example.modelB, /OpenRouter/);
  assert.equal(example.turns.length, 18);
  assert.ok(example.turns.every((turn) => turn.role !== "OBS"));
  assert.match(example.note, /omit/i, "avisa de que es un extracto");
  for (const turn of example.turns) {
    assert.doesNotMatch(turn.text, /Analyze the Input|Deconstruct|Drafting the Response/);
  }
});

test("viajes-universos es real, de dos modelos gratuitos y conserva el comentario del observador", () => {
  const { getExample } = load("lib/examples.ts");
  const example = getExample("viajes-universos");
  assert.equal(example.date, "2026-11-08");
  assert.match(example.modelA, /GLM-4\.5-Flash/);
  assert.match(example.modelB, /Gemini 3\.1 Flash-Lite/);
  assert.equal(example.turns.length, 30);
  const obs = example.turns.filter((turn) => turn.role === "OBS");
  assert.equal(obs.length, 1);
  assert.equal(obs[0].text, "¿Creen que el viaje en el tiempo es posible?");
  assert.equal(example.turns.filter((turn) => turn.role !== "OBS").length, 29);
  for (const turn of example.turns) {
    assert.ok(turn.text.trim());
    assert.doesNotMatch(turn.text, /Analyze the Input|Deconstruct|Drafting the Response|\[sin respuesta\]/);
  }
});

test('getExample("no-existe") es undefined', () => {
  const { getExample } = load("lib/examples.ts");
  assert.equal(getExample("no-existe"), undefined);
});

test("getExample(getExamples()[0].id) devuelve el primero", () => {
  const { getExample, getExamples } = load("lib/examples.ts");
  assert.equal(getExample(getExamples()[0].id), getExamples()[0]);
});

test("los ejemplos tienen metadatos y varios turnos que alternan A y B", () => {
  const { getExamples } = load("lib/examples.ts");
  for (const example of getExamples()) {
    for (const field of ["title", "topic", "modelA", "modelB"]) {
      assert.equal(typeof example[field], "string");
      assert.ok(example[field].trim());
    }
    assert.match(example.date, /^\d{4}-\d{2}-\d{2}$/);
    const aiTurns = example.turns.filter((turn) => turn.role !== "OBS");
    assert.ok(aiTurns.length >= 4);
    aiTurns.forEach((turn, index) => assert.equal(turn.role, index % 2 === 0 ? "A" : "B"));
    for (const turn of example.turns) {
      assert.equal(typeof turn.text, "string");
      assert.ok(turn.text.trim());
    }
  }
});

test("curiosidad incluye un turno OBS", () => {
  const { getExample } = load("lib/examples.ts");
  assert.ok(getExample("curiosidad").turns.some((turn) => turn.role === "OBS"));
});
