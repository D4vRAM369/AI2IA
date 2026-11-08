const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest } = require("next/server");

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
      : name === "@/lib/dialogue-config" ? dialogueConfig
      : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name),
    Error, AbortSignal,
    ...overrides,
  }, { filename });
  return module.exports;
}

const registry = load("lib/model-registry.ts");
const dialogueConfig = load("lib/dialogue-config.ts");
const providers = {
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  zai: "ZAI_API_KEY",
  siliconflow: "SILICONFLOW_API_KEY",
};

function setup(env = {}, fetchReply, globals = {}) {
  const calls = [];
  const route = load("app/api/chat/route.ts", {
    process: { env },
    ...globals,
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      return fetchReply ? fetchReply(options) : Response.json({
        content: [{ type: "text", text: "respuesta" }],
        choices: [{ message: { content: "respuesta" } }],
        message: { content: "respuesta" },
      });
    },
  });
  return { calls, post: route.POST };
}

function request(provider = "anthropic", { key, body = {}, raw } = {}) {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key === undefined ? {} : { "X-API-Key": key }) },
    body: raw === undefined ? JSON.stringify({
      modelKey: registry.MODEL_REGISTRY.find((model) => model.provider === provider).key,
      systemPrompt: "Habla en español.",
      messages: [{ role: "user", content: "Hola" }],
      ...body,
    }) : raw,
  });
}

test("BYOK selects the caller's key for each remote provider", async (t) => {
  for (const [provider, envName] of Object.entries(providers)) {
    await t.test(provider, async () => {
      const { post, calls } = setup({ [envName]: "server-secret" });
      const response = await post(request(provider, { key: "  caller-secret  " }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { text: "respuesta" });
      assert.equal(calls.length, 1);
      const headers = new Headers(calls[0].headers);
      assert.equal(headers.get(provider === "anthropic" ? "x-api-key" : "Authorization"),
        provider === "anthropic" ? "caller-secret" : "Bearer caller-secret");
      assert.ok(!calls[0].body.includes("caller-secret"));
      assert.ok(!calls[0].body.includes("server-secret"));
    });
  }
});

test("blank or absent BYOK keys retain server configuration", async (t) => {
  for (const [provider, envName] of Object.entries(providers)) {
    await t.test(provider, async () => {
      for (const key of [undefined, "   "]) {
        const { post, calls } = setup({ [envName]: "server-secret" });
        assert.equal((await post(request(provider, { key }))).status, 200);
        const headers = new Headers(calls[0].headers);
        assert.equal(headers.get(provider === "anthropic" ? "x-api-key" : "Authorization"),
          provider === "anthropic" ? "server-secret" : "Bearer server-secret");
      }
    });
  }
  const { post, calls } = setup({ Z_CHAT_API_KEY: "legacy-zai-secret" });
  assert.equal((await post(request("zai"))).status, 200);
  assert.equal(new Headers(calls[0].headers).get("Authorization"), "Bearer legacy-zai-secret");
});

test("missing remote keys return 400 without contacting a provider", async () => {
  for (const provider of Object.keys(providers)) {
    const { post, calls } = setup();
    assert.equal((await post(request(provider))).status, 400);
    assert.equal(calls.length, 0);
  }
});

test("invalid keys and token limits are rejected before upstream calls", async () => {
  for (const key of ["x".repeat(4097), "invalid key", "invalid-é"]) {
    const { post, calls } = setup();
    assert.equal((await post(request("anthropic", { key }))).status, 400);
    assert.equal(calls.length, 0);
  }
  for (const maxTokens of [0, -1, 1.5, 4097, 1e9, "1000", null]) {
    const { post, calls } = setup();
    assert.equal((await post(request("anthropic", { key: "caller-secret", body: { maxTokens } }))).status, 400);
    assert.equal(calls.length, 0);
  }
  for (const maxTokens of [1, 4096]) {
    const { post, calls } = setup();
    assert.equal((await post(request("anthropic", { key: "caller-secret", body: { maxTokens } }))).status, 200);
    assert.equal(JSON.parse(calls[0].body).max_tokens, maxTokens);
  }
});

test("malformed JSON and null messages return 400", async () => {
  for (const options of [{ raw: "null" }, { raw: "{" }, { body: { messages: [null] } }]) {
    const { post, calls } = setup();
    const response = await post(request("anthropic", { key: "caller-secret", ...options }));
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  }
});

test("provider errors never return the active key or retry with the server key", async () => {
  for (const [provider, envName] of Object.entries(providers)) {
    const secret = "caller-secret";
    const { post, calls } = setup({ [envName]: "server-secret" }, () => Response.json({
      error: { message: `Rejected ${secret}` },
      message: `Rejected ${secret}`,
    }, { status: 401 }));
    const response = await post(request(provider, { key: secret }));
    assert.ok(response.status >= 400);
    assert.ok(!(await response.text()).includes(secret));
    assert.equal(calls.length, 1);
  }
});

test("Ollama still works without an API key", async () => {
  const { post, calls } = setup({ OLLAMA_BASE_URL: "http://localhost:11434" });
  assert.equal((await post(request("ollama"))).status, 200);
  assert.equal(calls[0].url, "http://localhost:11434/api/chat");
  assert.equal(new Headers(calls[0].headers).get("Authorization"), null);
});

test("the free router selects OpenRouter's free-only model", () => {
  const model = registry.getModelByKey("openrouter-free");
  assert.ok(model);
  assert.equal(model.provider, "openrouter");
  assert.equal(model.model, "openrouter/free");
  assert.equal(model.apiClass, "free");
});

test("the client sends only a trimmed key header and preserves cancellation", async () => {
  const calls = [];
  const { callModel } = load("components/AIDialogue.tsx", {
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      return Response.json({ text: "respuesta" });
    },
  }, "\nexports.callModel = callModel;\n");
  const signal = new AbortController().signal;
  for (const key of ["  caller-secret  ", "   ", undefined]) {
    assert.equal(await callModel("openrouter-free", "Sistema", [{ role: "user", content: "Hola" }], key, signal), "respuesta");
    const call = calls.at(-1);
    assert.equal(call.url, "/api/chat");
    assert.equal(new Headers(call.headers).get("X-API-Key"), key?.trim() || null);
    assert.equal(call.signal, signal);
    assert.deepEqual(JSON.parse(call.body), {
      modelKey: "openrouter-free",
      systemPrompt: "Sistema",
      messages: [{ role: "user", content: "Hola" }],
      maxTokens: 1000,
    });
  }
});

test("the setup renders a password field for the selected provider", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { default: AIDialogue } = load("components/AIDialogue.tsx");
  const html = renderToStaticMarkup(createElement(AIDialogue));
  assert.match(html, /type="password"/);
  assert.match(html, /Anthropic/);
  assert.match(html, /OpenRouter/);
});


test("all provider requests receive client cancellation", async () => {
  for (const provider of [...Object.keys(providers), "ollama"]) {
    const { post, calls } = setup();
    const req = request(provider, { key: "caller-secret" });
    await post(req);
    assert.ok(calls[0].signal, `${provider} forwards a signal`);
  }
});

test("a disconnected request aborts its upstream request", async () => {
  const controller = new AbortController();
  const { post, calls } = setup({}, (options) => new Promise((resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  }));
  const base = request("openrouter", { key: "caller-secret" });
  const req = new NextRequest(base, { signal: controller.signal });
  const pending = post(req);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(calls[0].signal);
  controller.abort();
  const response = await pending;
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(response.status, 499);
});

test("prompts do not assign the same vendor identity to both models", () => {
  for (const build of [dialogueConfig.buildSystemA, dialogueConfig.buildSystemB]) {
    assert.doesNotMatch(build("astronomia"), /Ambas son Claude|otra instancia de ti misma/);
    assert.match(build("astronomia"), /astronomia/);
  }
});


test("upstream timeout returns 504 without exposing credentials", async () => {
  const deadline = new AbortController();
  const { post } = setup({}, (options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  }), { AbortSignal: { any: AbortSignal.any, timeout(ms) {
    assert.equal(ms, 60_000);
    return deadline.signal;
  } } });
  const pending = post(request("openrouter", { key: "caller-secret" }));
  await new Promise((resolve) => setImmediate(resolve));
  deadline.abort(new DOMException("caller-secret timeout", "TimeoutError"));
  const response = await pending;
  assert.equal(response.status, 504);
  const body = await response.text();
  assert.match(body, /60 segundos/);
  assert.ok(!body.includes("caller-secret"));
});

test("AI2IA setup has accessible selections and correct finite turn count", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const Component = load("components/AIDialogue.tsx").default;
  const html = renderToStaticMarkup(createElement(Component));
  assert.match(html, /<h1>AI2IA<\/h1>/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-label="Tema personalizado"/);
  assert.match(html, /29 intervenciones IA/);
  assert.doesNotMatch(html, /Claude &lt;-&gt; Claude/);
});
