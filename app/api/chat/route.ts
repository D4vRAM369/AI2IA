import { NextRequest, NextResponse } from "next/server";

import { getModelByKey, type DialogueMessage } from "@/lib/model-registry";

export const runtime = "nodejs";

type ChatRequestBody = {
  modelKey: string;
  systemPrompt: string;
  messages: DialogueMessage[];
  maxTokens?: number;
};

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function normalizeMessages(raw: unknown): DialogueMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const role = asText((item as { role?: unknown }).role);
      const content = asText((item as { content?: unknown }).content);

      if ((role === "user" || role === "assistant") && content.trim().length > 0) {
        return { role, content };
      }
      return null;
    })
    .filter((item): item is DialogueMessage => item !== null);
}

async function callAnthropic(
  model: string,
  systemPrompt: string,
  messages: DialogueMessage[],
  maxTokens: number,
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  const data = (await response.json()) as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
  };

  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? "Error en Anthropic.");
  }

  return data.content?.find((piece) => piece.type === "text")?.text ?? "[sin respuesta]";
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  messages: DialogueMessage[],
  maxTokens: number,
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "AI2IA",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  const data = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? "Error en OpenRouter.");
  }

  return data.choices?.[0]?.message?.content ?? "[sin respuesta]";
}

async function callZAI(model: string, systemPrompt: string, messages: DialogueMessage[], maxTokens: number, apiKey: string, signal: AbortSignal): Promise<string> {
  const response = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  const data = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? "Error en Z.AI.");
  }

  return data.choices?.[0]?.message?.content ?? "[sin respuesta]";
}

async function callSiliconFlow(
  model: string,
  systemPrompt: string,
  messages: DialogueMessage[],
  maxTokens: number,
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("https://api.siliconflow.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  const data = (await response.json()) as {
    message?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    throw new Error(data.message ?? "Error en SiliconFlow.");
  }

  return data.choices?.[0]?.message?.content ?? "[sin respuesta]";
}

async function callOllama(model: string, systemPrompt: string, messages: DialogueMessage[], signal: AbortSignal): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  const data = (await response.json()) as {
    error?: string;
    message?: { content?: string };
  };

  if (!response.ok || data.error) {
    throw new Error(data.error ?? "Error en Ollama.");
  }

  return data.message?.content ?? "[sin respuesta]";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let apiKey = "";
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
  try {
    const body = (await request.json().catch(() => null)) as ChatRequestBody | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Solicitud invalida: se requiere un objeto JSON." }, { status: 400 });
    }
    const modelKey = asText(body.modelKey);
    const systemPrompt = asText(body.systemPrompt);
    const messages = normalizeMessages(body.messages);
    const maxTokens = body.maxTokens === undefined ? 1000 : body.maxTokens;

    if (!modelKey || !systemPrompt.trim() || messages.length === 0 || !Array.isArray(body.messages) || messages.length !== body.messages.length) {
      return NextResponse.json({ error: "Solicitud invalida: faltan campos requeridos." }, { status: 400 });
    }
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) {
      return NextResponse.json({ error: "maxTokens debe ser un entero entre 1 y 4096." }, { status: 400 });
    }

    const model = getModelByKey(modelKey);
    if (!model) {
      return NextResponse.json({ error: "Modelo no soportado." }, { status: 400 });
    }

    if (model.provider !== "ollama") {
      const serverKeys = {
        anthropic: process.env.ANTHROPIC_API_KEY,
        openrouter: process.env.OPENROUTER_API_KEY,
        zai: process.env.ZAI_API_KEY || process.env.Z_CHAT_API_KEY,
        siliconflow: process.env.SILICONFLOW_API_KEY,
      };
      apiKey = request.headers.get("X-API-Key")?.trim() || serverKeys[model.provider]?.trim() || "";
      if (!apiKey) {
        return NextResponse.json({ error: `Introduce tu clave API de ${model.provider} o configurala en el servidor.` }, { status: 400 });
      }
      if (apiKey.length > 4096 || !/^[\x21-\x7E]+$/.test(apiKey)) {
        return NextResponse.json({ error: "La clave API tiene un formato invalido." }, { status: 400 });
      }
    }

    let reply = "";
    if (model.provider === "anthropic") {
      reply = await callAnthropic(model.model, systemPrompt, messages, maxTokens, apiKey, signal);
    } else if (model.provider === "openrouter") {
      reply = await callOpenRouter(model.model, systemPrompt, messages, maxTokens, apiKey, signal);
    } else if (model.provider === "zai") {
      reply = await callZAI(model.model, systemPrompt, messages, maxTokens, apiKey, signal);
    } else if (model.provider === "siliconflow") {
      reply = await callSiliconFlow(model.model, systemPrompt, messages, maxTokens, apiKey, signal);
    } else {
      reply = await callOllama(model.model, systemPrompt, messages, signal);
    }

    return NextResponse.json({ text: reply });
  } catch (error) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Solicitud cancelada." }, { status: 499 });
    }
    if (signal.aborted) {
      return NextResponse.json({ error: "El proveedor ha superado los 60 segundos de espera." }, { status: 504 });
    }
    const message = error instanceof Error ? error.message : "Error inesperado en /api/chat.";
    return NextResponse.json({ error: apiKey ? message.replaceAll(apiKey, "[clave oculta]") : message }, { status: 500 });
  }
}
