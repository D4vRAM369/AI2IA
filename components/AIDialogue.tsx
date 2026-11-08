"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { track } from "@/lib/analytics";
import { IS_PUBLIC } from "@/lib/app-mode";
import { callProviderDirect } from "@/lib/browser-llm";
import { buildSystemA, buildSystemB, SUGGESTED_TOPICS } from "@/lib/dialogue-config";
import { getModelByKey, MODEL_REGISTRY, type ModelProvider } from "@/lib/model-registry";
import { modelsForMode } from "@/lib/provider-support";

// En local es el registro completo; en la web pública, solo proveedores con CORS y sin Ollama.
const AVAILABLE_MODELS = modelsForMode(MODEL_REGISTRY, IS_PUBLIC);

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  zai: "Z.AI",
  siliconflow: "SiliconFlow",
  ollama: "Ollama",
};

type UIMessage = {
  role: "A" | "B" | "OBS";
  text: string;
  id: number;
  ts: string;
};

type LLMMessage = {
  role: "user" | "assistant";
  content: string;
};

async function callModel(
  modelKey: string,
  systemPrompt: string,
  messages: LLMMessage[],
  apiKey?: string,
  signal?: AbortSignal,
): Promise<string> {
  if (IS_PUBLIC) {
    // Web estática: no hay servidor. El navegador llama al proveedor con la clave de la persona.
    const model = getModelByKey(modelKey);
    if (!model) throw new Error("Modelo no soportado.");
    return callProviderDirect(model, systemPrompt, messages, 1000, apiKey ?? "", signal ?? new AbortController().signal);
  }

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey?.trim() ? { "X-API-Key": apiKey.trim() } : {}),
    },
    body: JSON.stringify({ modelKey, systemPrompt, messages, maxTokens: 1000 }),
    signal,
  });

  const data = (await response.json()) as { text?: string; error?: string };
  if (!response.ok || data.error) {
    throw new Error(data.error ?? "Error al consultar el modelo.");
  }

  return data.text ?? "[sin respuesta]";
}

export default function AIDialogue() {
  const [phase, setPhase] = useState<"setup" | "running">("setup");
  const [topic, setTopic] = useState<string>("");
  const [customTopic, setCustomTopic] = useState<string>("");
  const [mode, setMode] = useState<"finite" | "infinite">("finite");
  const [selectedModelA, setSelectedModelA] = useState<string>(AVAILABLE_MODELS[0].key);
  const [selectedModelB, setSelectedModelB] = useState<string>(AVAILABLE_MODELS[1]?.key ?? AVAILABLE_MODELS[0].key);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [turn, setTurn] = useState<number>(0);
  const [observerInput, setObserverInput] = useState<string>("");
  const [waitingObserver, setWaitingObserver] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Partial<Record<ModelProvider, string>>>({});

  const pausedRef = useRef<boolean>(false);
  const runningRef = useRef<boolean>(false);
  const sessionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingObserverRef = useRef<Record<"A" | "B", string[]>>({ A: [], B: [] });
  const historyARef = useRef<LLMMessage[]>([]);
  const historyBRef = useRef<LLMMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [messages]);

  useEffect(() => () => {
    sessionRef.current += 1;
    runningRef.current = false;
    pausedRef.current = false;
    abortRef.current?.abort();
  }, []);

  const selectedModelAMeta = useMemo(
    () => MODEL_REGISTRY.find((modelItem) => modelItem.key === selectedModelA),
    [selectedModelA],
  );
  const selectedModelBMeta = useMemo(
    () => MODEL_REGISTRY.find((modelItem) => modelItem.key === selectedModelB),
    [selectedModelB],
  );

  const finalTopicDisplay = customTopic.trim() || topic || SUGGESTED_TOPICS[0];
  const modelALabel = selectedModelAMeta?.label ?? selectedModelA;
  const modelBLabel = selectedModelBMeta?.label ?? selectedModelB;
  const selectedProviders = Array.from(new Set(
    [selectedModelAMeta, selectedModelBMeta]
      .filter((model) => model && model.provider !== "ollama")
      .map((model) => model!.provider),
  ));

  const getTs = () =>
    new Date().toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const addMessage = (role: UIMessage["role"], text: string) => {
    setMessages((prev) => [...prev, { role, text, id: Date.now() + Math.random(), ts: getTs() }]);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitIfPaused = async (session: number) => {
    while (pausedRef.current && sessionRef.current === session && runningRef.current) {
      await sleep(250);
    }
  };

  const checkObserver = (speaker: "A" | "B", history: MutableRefObject<LLMMessage[]>) => {
    const pending = pendingObserverRef.current[speaker];
    if (pending.length === 0) {
      return;
    }

    history.current.push({ role: "user", content: pending.map((message) => `[OBSERVADOR]: ${message}`).join("\n\n") });
    pendingObserverRef.current[speaker] = [];
    setWaitingObserver(pendingObserverRef.current.A.length > 0 || pendingObserverRef.current.B.length > 0);
  };

  const generateTurn = async (
    session: number,
    speaker: "A" | "B",
    modelKey: string,
    systemPrompt: string,
    sourceHistory: MutableRefObject<LLMMessage[]>,
    targetHistory: MutableRefObject<LLMMessage[]>,
  ) => {
    while (runningRef.current && sessionRef.current === session) {
      await waitIfPaused(session);
      if (!runningRef.current || sessionRef.current !== session) return;
      checkObserver(speaker, sourceHistory);
      const controller = new AbortController();
      abortRef.current = controller;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]);
      const provider = getModelByKey(modelKey)?.provider;
      try {
        const text = await callModel(modelKey, systemPrompt, sourceHistory.current,
          provider ? apiKeys[provider] : undefined, signal);
        // A cancelled or superseded request must never publish a late response.
        if (!runningRef.current || sessionRef.current !== session) return;
        if (controller.signal.aborted) continue;
        if (signal.aborted) throw signal.reason;
        sourceHistory.current.push({ role: "assistant", content: text });
        targetHistory.current.push({ role: "user", content: text });
        addMessage(speaker, text);
        setTurn((value) => value + 1);
        return;
      } catch (turnError) {
        if (!runningRef.current || sessionRef.current !== session) return;
        if (controller.signal.aborted) continue;
        if (signal.aborted) throw new Error("El modelo ha superado los 60 segundos de espera. Puedes iniciar un nuevo dialogo.");
        throw turnError;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    }
  };

  const runLoop = async (session: number, sysA: string, sysB: string, infinite: boolean) => {
    const maxCycles = infinite ? Number.POSITIVE_INFINITY : 14;
    let cycle = 0;
    while (runningRef.current && sessionRef.current === session &&
      (cycle < maxCycles || pendingObserverRef.current.A.length > 0 || pendingObserverRef.current.B.length > 0)) {
      await sleep(150);
      if (!runningRef.current || sessionRef.current !== session) return;
      await generateTurn(session, "B", selectedModelB, sysB, historyBRef, historyARef);
      if (!runningRef.current || sessionRef.current !== session) return;
      await sleep(150);
      if (!runningRef.current || sessionRef.current !== session) return;
      await generateTurn(session, "A", selectedModelA, sysA, historyARef, historyBRef);
      cycle += 1;
    }
  };

  const stop = () => {
    sessionRef.current += 1;
    runningRef.current = false;
    pausedRef.current = false;
    abortRef.current?.abort();
    pendingObserverRef.current = { A: [], B: [] };
    setWaitingObserver(false);
    setObserverInput("");
    setRunning(false);
    setPaused(false);
  };

  const reset = () => {
    stop();
    setPhase("setup");
    setMessages([]);
    setTurn(0);
    setError(null);
    setWaitingObserver(false);
  };

  const startDialogue = async () => {
    if (runningRef.current) return;
    track("START");
    const session = ++sessionRef.current;
    const finalTopic = customTopic.trim() || topic || SUGGESTED_TOPICS[0];

    setError(null);
    setMessages([]);
    setPhase("running");
    setRunning(true);
    setPaused(false);
    setObserverInput("");
    setTurn(0);
    runningRef.current = true;
    pausedRef.current = false;
    pendingObserverRef.current = { A: [], B: [] };
    setWaitingObserver(false);
    historyARef.current = [];
    historyBRef.current = [];

    const sysA = buildSystemA(finalTopic);
    const sysB = buildSystemB(finalTopic);
    const infinite = mode === "infinite";

    try {
      const openingPrompt = `Abre el dialogo sobre: "${finalTopic}". Plantea una idea o pregunta que genuinamente te intrigue.`;
      historyARef.current.push({ role: "user", content: openingPrompt });
      await generateTurn(session, "A", selectedModelA, sysA, historyARef, historyBRef);
      if (!runningRef.current || sessionRef.current !== session) return;
      await runLoop(session, sysA, sysB, infinite);
    } catch (runtimeError) {
      if (sessionRef.current !== session) return;
      setError(runtimeError instanceof Error ? runtimeError.message : "Error desconocido.");
    } finally {
      if (sessionRef.current === session) {
        runningRef.current = false;
        pausedRef.current = false;
        setRunning(false);
        setPaused(false);
        setWaitingObserver(false);
      }
    }
  };

  const submitObserver = () => {
    const val = observerInput.trim();
    if (!val || !runningRef.current) {
      return;
    }
    track("OBS");
    pendingObserverRef.current.A.push(val);
    pendingObserverRef.current.B.push(val);
    addMessage("OBS", val);
    setObserverInput("");
    setWaitingObserver(true);
    abortRef.current?.abort();
  };

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  const saveLog = () => {
    track("EXPORT");
    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const dateStr = now.toLocaleDateString("es-ES", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const lines = messages
        .map((msg) => {
          const labels: Record<UIMessage["role"], string> = {
            A: "### Instancia A",
            B: "### Instancia B",
            OBS: "### Observador",
          };

          return `${labels[msg.role]} \`${msg.ts}\`\n\n${msg.text}`;
        })
        .join("\n\n---\n\n");

      const content = `# AI2IA — Dialogo entre modelos de IA

**Tema:** ${finalTopicDisplay}  
**Modelo IA1 (A):** ${modelALabel}  
**Proveedor IA1 (A):** ${selectedModelAMeta?.provider ?? "desconocido"}  
**Modelo IA2 (B):** ${modelBLabel}  
**Proveedor IA2 (B):** ${selectedModelBMeta?.provider ?? "desconocido"}  
**Modo:** ${mode === "infinite" ? "Indefinido" : "Finito (29 intervenciones IA)"}  
**Fecha:** ${dateStr}  
**Hora de exportacion:** ${now.toLocaleTimeString("es-ES")}  
**Intervenciones IA:** ${messages.filter((message) => message.role !== "OBS").length}  
**Comentarios del observador:** ${messages.filter((message) => message.role === "OBS").length}

---

${lines}

---

Generado por AI2IA
`;

      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      document.body.appendChild(a);
      a.href = url;
      a.download = `ai2ia-dialogo-${timestamp}.md`;
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch {
      setError("No se pudo guardar el log.");
    }
  };

  return (
    <main className="shell">
      <header className="header">
        <p className="eyebrow">dos inteligencias · una conversación</p>
        <h1>AI2IA</h1>
      </header>

      {phase === "setup" && (
        <section className="setupCard">
          <SectionLabel>tema</SectionLabel>
          <div className="topicGrid">
            {SUGGESTED_TOPICS.map((item) => (
              <button
                key={item}
                aria-pressed={topic === item && !customTopic}
                onClick={() => {
                  setTopic(item);
                  setCustomTopic("");
                }}
                className={topic === item && !customTopic ? "chip chipActive" : "chip"}
              >
                {item}
              </button>
            ))}
          </div>

          <input
            type="text"
            className="input"
            aria-label="Tema personalizado"
            placeholder="o escribe tu propio tema..."
            value={customTopic}
            onChange={(event) => {
              setCustomTopic(event.target.value);
              setTopic("");
            }}
            onKeyDown={(event) => event.key === "Enter" && void startDialogue()}
          />

          <SectionLabel>modo</SectionLabel>
          <div className="modeGrid">
            {[
              ["finite", "finito", "29 intervenciones IA + comentarios"],
              ["infinite", "indefinido", "hasta detener"],
            ].map(([value, label, sub]) => (
              <button
                key={value}
                aria-pressed={mode === value}
                onClick={() => setMode(value as "finite" | "infinite")}
                className={mode === value ? "modeBtn modeBtnActive" : "modeBtn"}
              >
                <span>{label}</span>
                <small>{sub}</small>
              </button>
            ))}
          </div>

          <SectionLabel>modelo ia1 (a)</SectionLabel>
          <div className="modelGrid">
            {AVAILABLE_MODELS.map((modelItem) => {
              const isActive = selectedModelA === modelItem.key;
              return (
                <button
                  aria-pressed={isActive}
                  key={`a-${modelItem.key}`}
                  onClick={() => setSelectedModelA(modelItem.key)}
                  className={isActive ? "modelBtn modelBtnActive" : "modelBtn"}
                >
                  <span>{modelItem.label}</span>
                  <small>
                    {modelItem.note} · {modelItem.apiClass}
                  </small>
                </button>
              );
            })}
          </div>

          <SectionLabel>modelo ia2 (b)</SectionLabel>
          <div className="modelGrid">
            {AVAILABLE_MODELS.map((modelItem) => {
              const isActive = selectedModelB === modelItem.key;
              return (
                <button
                  aria-pressed={isActive}
                  key={`b-${modelItem.key}`}
                  onClick={() => setSelectedModelB(modelItem.key)}
                  className={isActive ? "modelBtn modelBtnActive" : "modelBtn"}
                >
                  <span>{modelItem.label}</span>
                  <small>
                    {modelItem.note} · {modelItem.apiClass}
                  </small>
                </button>
              );
            })}
          </div>

          {selectedProviders.length > 0 && (
            <fieldset className="credentials">
              <legend>tus claves API (BYOK)</legend>
              <p id="api-key-help" className="credentialHelp">
                {IS_PUBLIC
                  ? "Tu clave solo vive en la memoria de esta pagina hasta recargarla o cerrarla. Se envia unicamente al proveedor que elijas, directamente desde tu navegador."
                  : "Se mantienen solo en memoria hasta recargar o cerrar esta pagina. Se envian al servidor para consultar el proveedor. Si dejas un campo vacio, se usa la clave configurada en el servidor."}
              </p>
              <p className="credentialHelp">
                Para usar modelos gratuitos, selecciona OpenRouter gratuito en A y B y{" "}
                <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">crea tu clave de OpenRouter</a>.
                {IS_PUBLIC
                  ? " Se aplican limites de uso. NVIDIA y Ollama solo funcionan en la version instalable."
                  : " Se aplican limites de uso. Ollama local no necesita clave."}
              </p>
              {selectedProviders.map((provider) => (
                <div key={provider}>
                  <label htmlFor={`api-key-${provider}`}>Clave de {PROVIDER_LABELS[provider]}</label>
                  <input
                    id={`api-key-${provider}`}
                    type="password"
                    className="input"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="api-key-help"
                    placeholder="Introduce tu clave API"
                    maxLength={4096}
                    value={apiKeys[provider] ?? ""}
                    onChange={(event) => setApiKeys((previous) => ({ ...previous, [provider]: event.target.value }))}
                  />
                </div>
              ))}
            </fieldset>
          )}

          <div className="centeredRow">
            <button onClick={() => void startDialogue()} className="actionBtn">
              iniciar dialogo
            </button>
          </div>
        </section>
      )}

      {phase === "running" && (
        <section className="runCard">
          <p className="metaLine">&quot;{finalTopicDisplay}&quot;</p>
          <p className="metaLine2">
            A: {modelALabel} · B: {modelBLabel} · {mode === "infinite" ? "indefinido" : "finito"} · turno {turn}
          </p>

          <div className="controls">
            {running ? (
              <>
                <button onClick={togglePause} className="actionBtn altBtn">
                  {paused ? "reanudar" : "pausar"}
                </button>
                <button onClick={stop} className="actionBtn stopBtn">
                  detener
                </button>
              </>
            ) : (
              <button onClick={reset} className="actionBtn">
                nuevo dialogo
              </button>
            )}

            <button
              onClick={saveLog}
              disabled={messages.length === 0}
              className={messages.length > 0 ? "actionBtn saveBtn" : "actionBtn disabledBtn"}
            >
              guardar log
            </button>
          </div>

          <p className="statusLine" role="status" aria-live="polite">
            {running && !paused && "pensando..."}
            {paused && "pausado"}
            {!running && messages.length > 0 && "finalizado"}
            {waitingObserver && (paused ? " · intervencion en cola: pulsa reanudar" : " · incorporando tu comentario")}
          </p>

          <div className="observerRow">
            <input
              type="text"
              className="input observerInput"
              aria-label="Intervenir como observador"
              placeholder="Intervenir como observador... (Enter)"
              disabled={!running}
              maxLength={500}
              value={observerInput}
              onChange={(event) => setObserverInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && submitObserver()}
            />
            <button
              onClick={submitObserver}
              disabled={!running || !observerInput.trim()}
              className={running && observerInput.trim() ? "actionBtn observerBtn" : "actionBtn disabledBtn"}
            >
              enviar
            </button>
          </div>

          {running && <p className="credentialHelp">Tu comentario se muestra al enviar e interrumpe la respuesta en curso para incorporarlo. Ambos modelos lo reciben; en pausa espera hasta reanudar.</p>}

          {error && <div className="errorBox" role="alert">error: {error}</div>}

          <div className="messages" role="log" aria-label="Conversación entre modelos y observador" aria-live="polite" aria-relevant="additions">
            {messages.map((msg) => (
              <Bubble key={msg.id} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        </section>
      )}
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="sectionLabel">{children}</p>;
}

function Bubble({ msg }: { msg: UIMessage }) {
  const isObs = msg.role === "OBS";
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(timer);
  }, []);

  const styles: Record<UIMessage["role"], { label: string; bubble: string; wrap: string; meta: string }> = {
    A: { label: "instancia a", bubble: "bubble bubbleA", wrap: "bubbleWrap bubbleWrapA", meta: "metaA" },
    B: { label: "instancia b", bubble: "bubble bubbleB", wrap: "bubbleWrap bubbleWrapB", meta: "metaB" },
    OBS: { label: "observador", bubble: "bubble bubbleObs", wrap: "bubbleWrap bubbleWrapObs", meta: "metaObs" },
  };

  const roleStyle = styles[msg.role];

  return (
    <article
      className={roleStyle.wrap}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0px)" : "translateY(8px)",
        transition: "opacity .35s ease, transform .35s ease",
      }}
    >
      <div className={roleStyle.meta}>
        <span>{roleStyle.label}</span>
        <time>{msg.ts}</time>
      </div>
      <div className={isObs ? `${roleStyle.bubble} obsBubble` : roleStyle.bubble}>{msg.text}</div>
    </article>
  );
}
