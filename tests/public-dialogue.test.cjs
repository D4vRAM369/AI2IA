const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const flush = () => new Promise((resolve) => setImmediate(resolve));

// Harness copiado de tests/observer.test.cjs, con modo público y analítica sustituibles.
function mountDialogue({ publicMode = false } = {}) {
  const hooks = [];
  const fetches = [];
  const tracked = [];
  const effects = [];
  let mounted = false;
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (value) => {
        hooks[index] = typeof value === "function" ? value(hooks[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return hooks[index] ??= { current: initial };
    },
    useMemo: (fn) => fn(),
    useEffect(effect, deps) {
      if (!mounted || deps.length > 0) effects.push(effect);
    },
  };
  function load(relativePath) {
    const filename = path.join(__dirname, "..", relativePath);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(source, {
      module, exports: module.exports, Error, AbortController, DOMException, TypeError,
      window: { matchMedia: () => ({ matches: false }) },
      AbortSignal: { any: AbortSignal.any, timeout: () => new AbortController().signal },
      setTimeout: () => 0,
      require: (name) => name === "react" ? react
        : name === "@/lib/app-mode" ? { IS_PUBLIC: publicMode }
        : name === "@/lib/analytics" ? { track: (...args) => tracked.push(args) }
        : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name),
      fetch: (url, options) => new Promise(() => {
        fetches.push({ url, options, body: JSON.parse(options.body) });
      }),
    }, { filename });
    return module.exports;
  }
  const Component = load("components/AIDialogue.tsx").default;
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  }
  function render() {
    cursor = 0;
    const tree = nodes(Component());
    for (const node of tree) {
      if (node.type === "div" && node.props.ref) node.props.ref.current = { scrollIntoView() {} };
    }
    for (const effect of effects.splice(0)) effect();
    mounted = true;
    return tree;
  }
  const button = (text) => {
    const found = render().find((node) => node.type === "button" && node.props.children === text);
    assert.ok(found, `button ${text} exists`);
    return found;
  };
  return {
    fetches,
    tracked,
    render,
    button,
    errorText: () => {
      const box = render().find((node) => node.props?.className === "errorBox");
      return box ? JSON.stringify(box.props.children) : "";
    },
    setKey(provider, value) {
      render().find((node) => node.props?.id === `api-key-${provider}`).props.onChange({ target: { value } });
    },
    async start() { button("iniciar dialogo").props.onClick(); await flush(); },
    send(text) {
      render().find((node) => node.type === "input" && node.props.className.includes("observerInput"))
        .props.onChange({ target: { value: text } });
      button("enviar").props.onClick();
    },
  };
}

test("modo público: sin clave no hay petición y se muestra el error", async () => {
  const app = mountDialogue({ publicMode: true });
  await app.start();
  assert.equal(app.fetches.length, 0);
  assert.match(app.errorText(), /Introduce tu clave API de/);
});

test("modo público: sin clave se queda en la configuración y no registra START", async () => {
  const app = mountDialogue({ publicMode: true });
  await app.start();
  assert.ok(app.render().find((node) => node.type === "button" && node.props.children === "iniciar dialogo"),
    "sigue la pantalla de configuración, donde está el campo de la clave");
  assert.equal(app.tracked.some((call) => call[0] === "START"), false);
  assert.match(app.errorText(), /anthropic/i);
});

test("modo público: escribir la clave borra el error anterior", async () => {
  const app = mountDialogue({ publicMode: true });
  await app.start();
  assert.notEqual(app.errorText(), "");
  app.setKey("anthropic", "sk-ant-prueba");
  assert.equal(app.errorText(), "");
});

test("modo público: con clave se llama directo al proveedor, nunca a /api/chat", async () => {
  const app = mountDialogue({ publicMode: true });
  app.render();
  app.setKey("anthropic", "sk-ant-prueba");
  await app.start();
  assert.equal(app.fetches.length, 1);
  assert.equal(app.fetches[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(app.fetches[0].options.headers["anthropic-dangerous-direct-browser-access"], "true");
});

test("modo público: la lista de modelos no incluye Ollama; en local sí", () => {
  const keys = (app) => app.render().filter((node) => typeof node.key === "string").map((node) => node.key);
  assert.equal(keys(mountDialogue({ publicMode: true })).some((key) => key.includes("ollama")), false);
  assert.equal(keys(mountDialogue({ publicMode: false })).some((key) => key.includes("ollama")), true);
});

test("modo público: el texto de ayuda no promete la clave del servidor", () => {
  const text = JSON.stringify(mountDialogue({ publicMode: true }).render().map((node) => node.props?.children));
  assert.doesNotMatch(text, /clave configurada en el servidor/);
  assert.doesNotMatch(text, /Ollama local no necesita clave/);
});

test("el comentario del observador admite como máximo 500 caracteres", async () => {
  const app = mountDialogue();
  await app.start();
  const input = app.render().find((node) => node.type === "input" && node.props.className.includes("observerInput"));
  assert.equal(input.props.maxLength, 500);
});

test("START, OBS y EXPORT se registran una vez cada uno", async () => {
  const app = mountDialogue();
  await app.start();
  app.send("Hablemos de astronomia");
  app.button("guardar log").props.onClick();
  assert.deepEqual(app.tracked.map((call) => call[0]), ["START", "OBS", "EXPORT"]);
  for (const call of app.tracked) assert.equal(call.length, 1, "no se envía ningún dato extra");
});
