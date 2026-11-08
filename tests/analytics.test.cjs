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

test("si GoatCounter aún no ha cargado, reintenta y entrega el evento cuando esté listo", () => {
  const timers = [];
  const calls = [];
  const win = {};
  const { track } = load("lib/analytics.ts", { window: win, setTimeout: (callback) => timers.push(callback) });
  track("VIEW");
  assert.equal(calls.length, 0);
  assert.equal(timers.length, 1, "queda un reintento programado");
  win.goatcounter = { count: (arg) => calls.push(arg) };
  timers.shift()();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "evt/VIEW");
  assert.equal(timers.length, 0, "no sigue reintentando una vez entregado");
});

test("si GoatCounter nunca carga (adblock), deja de reintentar tras 10 intentos", () => {
  const timers = [];
  const { track } = load("lib/analytics.ts", { window: {}, setTimeout: (callback) => timers.push(callback) });
  track("START");
  let runs = 0;
  while (timers.length && runs < 50) { timers.shift()(); runs += 1; }
  assert.equal(runs, 10);
});
