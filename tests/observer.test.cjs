const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const flush = () => new Promise((resolve) => setImmediate(resolve));

function mountDialogue({ ignoreAbort = false, reducedMotion = false } = {}) {
  const hooks = [];
  const timers = [];
  const requests = [];
  const timeouts = [];
  const effects = [];
  const cleanups = [];
  const scrolls = [];
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
      module, exports: module.exports, Error, AbortController, DOMException,
      window: { matchMedia: () => ({ matches: reducedMotion }) },
      AbortSignal: {
        any: AbortSignal.any,
        timeout(ms) {
          const controller = new AbortController();
          timeouts.push({ ms, controller });
          return controller.signal;
        },
      },
      setTimeout: (callback) => timers.push(callback),
      require: (name) => name === "react" ? react
        // La analítica no se prueba aquí: su setTimeout de reintento se mezclaría con la cola de turnos simulada.
        : name === "@/lib/analytics" ? { track() {} }
        : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name),
      fetch: (url, options) => new Promise((resolve, reject) => {
        requests.push({ body: JSON.parse(options.body), resolve, reject, signal: options.signal });
        if (!ignoreAbort) options.signal?.addEventListener("abort", () => reject(options.signal.reason), { once: true });
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
      if (node.type === "div" && node.props.ref) {
        node.props.ref.current = { scrollIntoView: (options) => scrolls.push(options) };
      }
    }
    for (const effect of effects.splice(0)) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    }
    mounted = true;
    return tree;
  }
  function button(text) {
    const found = render().find((node) => node.type === "button" && node.props.children === text);
    assert.ok(found, `button ${text} exists`);
    return found;
  }
  return {
    requests,
    timeouts,
    scrolls,
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
    render,
    button,
    messages: () => render().filter((node) => node.props?.msg).map((node) => node.props.msg),
    async start() { button("iniciar dialogo").props.onClick(); await flush(); },
    send(text) {
      render().find((node) => node.type === "input" && node.props.className.includes("observerInput"))
        .props.onChange({ target: { value: text } });
      button("enviar").props.onClick();
    },
    async respond(index) {
      requests[index].resolve(Response.json({ text: `respuesta ${index}` }));
      await flush();
    },
    async advance() {
      assert.ok(timers.length, "a turn is scheduled");
      timers.shift()();
      await flush();
    },
  };
}

test("a comment interrupts the opening and immediately retries the same speaker", async () => {
  const app = mountDialogue();
  await app.start();
  app.send("Hablemos de astronomia");
  assert.equal(app.messages().at(-1).text, "Hablemos de astronomia");
  await flush();
  assert.equal(app.requests[0].signal.aborted, true);
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[1].body.modelKey, app.requests[0].body.modelKey);
  assert.match(app.requests[1].body.messages.at(-1).content, /Hablemos de astronomia/);
  await app.respond(1);
  await app.advance();
  assert.match(app.requests[2].body.messages.at(-1).content, /Hablemos de astronomia/);
});

test("consecutive comments survive repeated interruptions and reach both models", async () => {
  const app = mountDialogue();
  await app.start();
  app.send("Astronomia");
  await flush();
  app.send("Con ejemplos sencillos");
  await flush();
  assert.equal(app.requests.length, 3);
  assert.match(JSON.stringify(app.requests[2].body), /Astronomia/);
  assert.match(app.requests[2].body.messages.at(-1).content, /Con ejemplos sencillos/);
  await app.respond(2);
  await app.advance();
  assert.match(app.requests[3].body.messages.at(-1).content, /Astronomia/);
  assert.match(app.requests[3].body.messages.at(-1).content, /Con ejemplos sencillos/);
  assert.equal(app.messages().filter((m) => m.role === "OBS").length, 2);
  assert.equal(app.messages().filter((m) => m.role === "A").length, 1);
});

test("stopping aborts the opening without presenting an error", async () => {
  const app = mountDialogue();
  await app.start();
  app.button("detener").props.onClick();
  assert.equal(app.requests[0].signal?.aborted, true);
  await flush();
  assert.equal(app.messages().length, 0);
  assert.ok(app.button("nuevo dialogo"));
  assert.ok(!app.render().some((node) => node.props?.role === "alert"));
  app.send("No debe quedar en cola");
  assert.equal(app.messages().length, 0);
});

test("a late response cannot write into a new session or stop it", async () => {
  const app = mountDialogue({ ignoreAbort: true });
  await app.start();
  app.button("detener").props.onClick();
  app.button("nuevo dialogo").props.onClick();
  await app.start();
  await app.respond(0);
  assert.equal(app.messages().length, 0);
  assert.ok(app.button("detener"));
  await app.respond(1);
  assert.equal(app.messages().length, 1);
});

test("a late failure from an old session cannot overwrite the current state", async () => {
  const app = mountDialogue({ ignoreAbort: true });
  await app.start();
  app.button("detener").props.onClick();
  app.button("nuevo dialogo").props.onClick();
  await app.start();
  app.requests[0].reject(new Error("old error"));
  await flush();
  assert.ok(app.button("detener"));
  assert.ok(!app.render().some((node) => node.props?.role === "alert"));
});

test("a comment during B's response restarts B, then reaches A", async () => {
  const app = mountDialogue();
  await app.start();
  await app.respond(0);
  await app.advance();
  app.send("Cambia de tema a musica");
  await flush();
  assert.equal(app.requests[1].signal.aborted, true);
  assert.equal(app.requests[2].body.modelKey, app.requests[1].body.modelKey);
  assert.match(app.requests[2].body.messages.at(-1).content, /Cambia de tema a musica/);
  await app.respond(2);
  await app.advance();
  assert.match(app.requests[3].body.messages.at(-1).content, /Cambia de tema a musica/);
});

test("a paused comment waits for resume and interrupts the pending response", async () => {
  const app = mountDialogue();
  await app.start();
  app.button("pausar").props.onClick();
  app.send("Explica las galaxias");
  await flush();
  assert.equal(app.requests[0].signal.aborted, true);
  assert.equal(app.requests.length, 1);
  app.button("reanudar").props.onClick();
  await app.advance();
  assert.equal(app.requests.length, 2);
  assert.match(app.requests[1].body.messages.at(-1).content, /Explica las galaxias/);
});

test("finite mode completes exactly 29 AI turns", async () => {
  const app = mountDialogue();
  await app.start();
  for (let index = 0; index < 29; index++) {
    await app.respond(index);
    if (index < 28) await app.advance();
  }
  assert.equal(app.messages().length, 29);
  assert.ok(app.button("nuevo dialogo"));
});

test("an intervention during the final response reaches both models before finishing", async () => {
  const app = mountDialogue();
  await app.start();
  for (let index = 0; index < 28; index++) {
    await app.respond(index);
    await app.advance();
  }
  app.send("Ahora explica las estrellas");
  await flush();
  assert.match(app.requests[29].body.messages.at(-1).content, /Ahora explica las estrellas/);
  await app.respond(29);
  await app.advance();
  assert.match(app.requests[30].body.messages.at(-1).content, /Ahora explica las estrellas/);
  await app.respond(30);
  await app.advance();
  await app.respond(31);
  assert.ok(app.button("nuevo dialogo"));
});

test("a provider failure ends the session with a visible error", async () => {
  const app = mountDialogue();
  await app.start();
  app.requests[0].reject(new Error("Proveedor no disponible"));
  await flush();
  assert.ok(app.button("nuevo dialogo"));
  assert.ok(app.render().some((node) => node.props?.role === "alert"));
});


test("a stalled provider times out after the configured 60-second deadline", async () => {
  const app = mountDialogue();
  await app.start();
  assert.equal(app.timeouts[0].ms, 60_000);
  app.timeouts[0].controller.abort(new DOMException("Timed out", "TimeoutError"));
  await flush();
  assert.ok(app.button("nuevo dialogo"));
  const alert = app.render().find((node) => node.props?.role === "alert");
  assert.ok(alert);
  assert.match(JSON.stringify(alert.props.children), /60 segundos/);
});

test("stopping while paused allows a fresh session to run", async () => {
  const app = mountDialogue();
  await app.start();
  app.button("pausar").props.onClick();
  app.send("Una instruccion pendiente");
  await flush();
  app.button("detener").props.onClick();
  app.button("nuevo dialogo").props.onClick();
  await app.start();
  await app.advance();
  assert.equal(app.requests.length, 2);
  assert.doesNotMatch(JSON.stringify(app.requests[1].body), /Una instruccion pendiente/);
  assert.ok(app.button("detener"));
});


test("unmounting cancels the pending request and discards late responses", async () => {
  const app = mountDialogue({ ignoreAbort: true });
  await app.start();
  app.unmount();
  assert.equal(app.requests[0].signal.aborted, true);
  await app.respond(0);
  assert.equal(app.messages().length, 0);
});

test("automatic scrolling respects reduced motion", async () => {
  for (const reducedMotion of [false, true]) {
    const app = mountDialogue({ reducedMotion });
    await app.start();
    app.render();
    assert.equal(app.scrolls.at(-1).behavior, reducedMotion ? "auto" : "smooth");
  }
});
