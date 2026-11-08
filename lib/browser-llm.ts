import type { ModelOption, DialogueMessage } from "@/lib/model-registry";

// ponytail: duplica route.ts; extraer un módulo común cuando se retire el modo local
export async function callProviderDirect(
  model: ModelOption,
  systemPrompt: string,
  messages: DialogueMessage[],
  maxTokens: number,
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  if (model.provider === "ollama") {
    throw new Error("Ollama solo está disponible en la versión instalable.");
  }
  const key = apiKey.trim();
  if (!key) {
    throw new Error(`Introduce tu clave API de ${model.provider}.`);
  }
  if (key.length > 4096 || !/^[\x21-\x7E]+$/.test(key)) {
    throw new Error("La clave API tiene un formato inválido.");
  }

  const anthropic = model.provider === "anthropic";
  const urls = {
    anthropic: "https://api.anthropic.com/v1/messages",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    zai: "https://api.z.ai/api/paas/v4/chat/completions",
    siliconflow: "https://api.siliconflow.com/v1/chat/completions",
  };
  let response: Response;
  try {
    response = await fetch(urls[model.provider], {
      method: "POST",
      signal,
      headers: anthropic ? {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      } : {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(anthropic ? {
        model: model.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      } : {
        model: model.model,
        max_tokens: maxTokens,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      const cancelled = new Error(name === "AbortError"
        ? "Solicitud cancelada."
        : "El proveedor ha superado el tiempo de espera.");
      cancelled.name = name;
      throw cancelled;
    }
    if (name === "TypeError") {
      throw new Error("El navegador ha bloqueado la conexión al proveedor o no hay red. Prueba la versión instalable.");
    }
    throw new Error("No se pudo conectar con el proveedor.");
  }

  const data = await response.json().catch(() => {
    throw new Error("El proveedor devolvió una respuesta que no es JSON válido.");
  }) as {
    error?: { message?: string };
    message?: string;
    content?: Array<{ type?: string; text?: string }>;
    choices?: Array<{ message?: { content?: string } }>;
  } | null;

  if (!response.ok || data?.error) {
    const detail = data?.error?.message ?? data?.message;
    throw new Error(typeof detail === "string"
      ? `Error del proveedor: ${detail.replaceAll(key, "[clave oculta]")}`
      : "Error del proveedor.");
  }
  return (anthropic
    ? data?.content?.find((piece) => piece.type === "text")?.text
    : data?.choices?.[0]?.message?.content) ?? "[sin respuesta]";
}
