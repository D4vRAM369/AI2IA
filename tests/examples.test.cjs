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
  assert.deepEqual(Array.from(getExamples(), (example) => example.id), ["curiosidad", "compilador"]);
});

test("todos con provisional: true mientras sean de maqueta", () => {
  const { getExamples } = load("lib/examples.ts");
  for (const example of getExamples()) {
    assert.equal(example.provisional, true);
    assert.match(example.modelA, /maqueta/i);
    assert.match(example.modelB, /maqueta/i);
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
