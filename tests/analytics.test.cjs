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

function withCounter(count) {
  return load("lib/analytics.ts", { window: { goatcounter: { count } } }).track;
}

test("track envía evt/<EVENTO>/<id> con event: true", () => {
  const calls = [];
  withCounter((arg) => calls.push(arg))("READ", "curiosidad");
  // JSON: los objetos creados dentro de node:vm tienen otro Object.prototype y deepEqual estricto los rechaza.
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ path: "evt/READ/curiosidad", title: "READ", event: true }]);
});

test("track sin id usa solo el nombre del evento", () => {
  const calls = [];
  withCounter((arg) => calls.push(arg))("VIEW");
  assert.equal(calls[0].path, "evt/VIEW");
});

test("un id con forma no válida se descarta (nunca texto libre)", () => {
  const calls = [];
  const track = withCounter((arg) => calls.push(arg));
  track("READ", "Hola, soy un comentario privado");
  track("READ", "a".repeat(41));
  assert.deepEqual(calls.map((call) => call.path), ["evt/READ", "evt/READ"]);
});

test("sin GoatCounter (adblock o sin configurar) track no lanza", () => {
  assert.doesNotThrow(() => load("lib/analytics.ts", { window: {} }).track("START"));
  assert.doesNotThrow(() => load("lib/analytics.ts").track("START"));
});

test("si goatcounter.count lanza, track no lanza", () => {
  assert.doesNotThrow(() => withCounter(() => { throw new Error("bloqueado"); })("EXPORT"));
});
