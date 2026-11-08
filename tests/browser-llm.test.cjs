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

const messages = [{ role: "user", content: "Hola" }, { role: "assistant", content: "Buenas" }];
const secret = "sk-SECRET";
function setup(reply = () => Response.json({
  content: [{ type: "thinking" }, { type: "text", text: "Respuesta de Anthropic" }],
  choices: [{ message: { content: "Respuesta compatible" } }],
})) {
  const calls = [];
  const { callProviderDirect } = load("lib/browser-llm.ts", {
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      return reply();
    },
  });
  const signal = new AbortController().signal;
  return { calls, signal, call(provider, key = secret) {
    return callProviderDirect(registry.MODEL_REGISTRY.find((m) => m.provider === provider),
      "Habla en español.", messages, 1000, key, signal);
  } };
}

test("anthropic envía la cabecera anthropic-dangerous-direct-browser-access y x-api-key", async () => {
  const app = setup();
  assert.equal(await app.call("anthropic", `  ${secret}  `), "Respuesta de Anthropic");
  const call = app.calls[0];
  assert.equal(call.url, "https://api.anthropic.com/v1/messages");
  assert.equal(call.method, "POST");
  assert.equal(call.signal, app.signal);
  assert.deepEqual({ ...call.headers }, {
    "Content-Type": "application/json", "x-api-key": secret,
    "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true",
  });
  assert.deepEqual(JSON.parse(call.body), {
    model: registry.MODEL_REGISTRY[0].model, max_tokens: 1000, system: "Habla en español.", messages,
  });
});

test("openrouter, zai, siliconflow, groq y gemini usan Bearer y sus URL", async () => {
  const urls = {
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    zai: "https://api.z.ai/api/paas/v4/chat/completions",
    siliconflow: "https://api.siliconflow.com/v1/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  };
  for (const [provider, url] of Object.entries(urls)) {
    const app = setup();
    assert.equal(await app.call(provider), "Respuesta compatible");
    const call = app.calls[0];
    assert.equal(call.url, url);
    assert.equal(call.method, "POST");
    assert.equal(call.signal, app.signal);
    assert.deepEqual({ ...call.headers }, { "Content-Type": "application/json", Authorization: `Bearer ${secret}` });
    assert.deepEqual(JSON.parse(call.body), {
      model: registry.MODEL_REGISTRY.find((m) => m.provider === provider).model,
      max_tokens: 1000, messages: [{ role: "system", content: "Habla en español." }, ...messages],
    });
  }
});

test("rechaza sin clave y no llama a fetch", async () => {
  const app = setup();
  for (const provider of ["anthropic", "openrouter", "zai", "siliconflow", "groq", "gemini"]) {
    for (const key of ["", "   "]) {
      await assert.rejects(app.call(provider, key), /Introduce tu clave API de/);
    }
  }
  assert.equal(app.calls.length, 0);
});

test("un TypeError de fetch se convierte en mensaje de bloqueo", async () => {
  const app = setup(() => { throw new TypeError(`Failed to fetch ${secret}`); });
  await assert.rejects(app.call("anthropic"), (error) => {
    assert.match(error.message, /bloque/);
    assert.match(error.message, /instalable/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
});

test("oculta la clave si el proveedor la devuelve en el error", async () => {
  for (const provider of ["anthropic", "openrouter", "zai", "siliconflow", "groq", "gemini"]) {
    for (const body of [{ error: { message: `bad key ${secret} ${secret}` } }, { message: `bad key ${secret}` }]) {
      const app = setup(() => Response.json(body, { status: 401 }));
      await assert.rejects(app.call(provider), (error) => {
        assert.ok(!error.message.includes(secret));
        assert.match(error.message, /\[clave oculta\]/);
        return true;
      });
      assert.equal(app.calls.length, 1);
    }
  }
});

test("ollama no está soportado", async () => {
  const app = setup();
  await assert.rejects(app.call("ollama"), /Ollama.*instalable/);
  assert.equal(app.calls.length, 0);
});

test("la cancelación conserva AbortError sin revelar la clave", async () => {
  const app = setup(() => { throw new DOMException(secret, "AbortError"); });
  await assert.rejects(app.call("openrouter"), (error) => {
    assert.equal(error.name, "AbortError");
    assert.ok(!error.message.includes(secret));
    return true;
  });
});

test("una respuesta vacía usa el texto de reserva de la ruta local", async () => {
  for (const provider of ["anthropic", "openrouter", "zai", "siliconflow", "groq", "gemini"]) {
    const app = setup(() => Response.json({}));
    assert.equal(await app.call(provider), "[sin respuesta]");
  }
});

test("una respuesta no JSON muestra un error en español sin revelar la clave", async () => {
  const app = setup(() => new Response(secret, { status: 502 }));
  await assert.rejects(app.call("openrouter"), (error) => {
    assert.match(error.message, /respuesta.*JSON/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
});

test("un contenido que no es texto no se devuelve como respuesta", async () => {
  const llm = setup(() => Response.json({ choices: [{ message: { content: { x: 1 } } }] }));
  assert.equal(await llm.call("openrouter"), "[sin respuesta]");
});

test("cancelar mientras se lee el cuerpo conserva AbortError", async () => {
  const abort = Object.assign(new Error("cancelado"), { name: "AbortError" });
  const llm = setup(() => ({ ok: true, json: async () => { throw abort; } }));
  await assert.rejects(llm.call("openrouter"), (error) => error.name === "AbortError");
});
