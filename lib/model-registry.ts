export type ModelProvider = "anthropic" | "openrouter" | "ollama" | "zai" | "siliconflow" | "groq" | "gemini";

export type DialogueMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ModelOption = {
  key: string;
  label: string;
  note: string;
  provider: ModelProvider;
  model: string;
  apiClass: "paid" | "free" | "local";
};

export const MODEL_REGISTRY: ModelOption[] = [
  {
    key: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    note: "API de Anthropic",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiClass: "paid",
  },
  {
    key: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    note: "API de Anthropic",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    apiClass: "paid",
  },
  {
    key: "openrouter-free",
    label: "OpenRouter gratuito (automatico)",
    note: "Modelos gratuitos con limites de uso",
    provider: "openrouter",
    model: "openrouter/free",
    apiClass: "free",
  },
  {
    key: "zai-glm-4-7-flash-free",
    label: "Z.AI GLM-4.7-Flash (free)",
    note: "Proveedor chino (gratis)",
    provider: "zai",
    model: "glm-4.7-flash",
    apiClass: "free",
  },
  {
    key: "zai-glm-4-5-flash-free",
    label: "Z.AI GLM-4.5-Flash (free)",
    note: "Proveedor chino (gratis)",
    provider: "zai",
    model: "glm-4.5-flash",
    apiClass: "free",
  },
  {
    key: "siliconflow-qwen3-8b-free",
    label: "SiliconFlow Qwen3-8B (free)",
    note: "Proveedor chino (gratis segun limites)",
    provider: "siliconflow",
    model: "Qwen/Qwen3-8B",
    apiClass: "free",
  },
  {
    key: "siliconflow-hunyuan-a13b-free",
    label: "SiliconFlow Hunyuan-A13B (free)",
    note: "Proveedor chino (gratis segun limites)",
    provider: "siliconflow",
    model: "tencent/Hunyuan-A13B-Instruct",
    apiClass: "free",
  },
  {
    key: "gemma-4-31b-it-free",
    label: "Gemma 4 31B IT (OpenRouter free)",
    note: "Gratis segun disponibilidad",
    provider: "openrouter",
    model: "google/gemma-4-31b-it:free",
    apiClass: "free",
  },
  {
    key: "gemma-4-26b-a4b-it-free",
    label: "Gemma 4 26B A4B IT (OpenRouter free)",
    note: "Gratis segun disponibilidad",
    provider: "openrouter",
    model: "google/gemma-4-26b-a4b-it:free",
    apiClass: "free",
  },
  {
    key: "gemini-3-1-flash-lite-free",
    label: "Gemini 3.1 Flash-Lite (free)",
    note: "Google AI Studio (gratis con limites)",
    provider: "gemini",
    model: "gemini-3.1-flash-lite",
    apiClass: "free",
  },
  {
    key: "gemini-2-5-flash-free",
    label: "Gemini 2.5 Flash (free)",
    note: "Google AI Studio (gratis con limites)",
    provider: "gemini",
    model: "gemini-2.5-flash",
    apiClass: "free",
  },
  {
    key: "groq-gpt-oss-20b-free",
    label: "GPT-OSS 20B (Groq free)",
    note: "Groq (gratis, 8K tokens/min)",
    provider: "groq",
    model: "openai/gpt-oss-20b",
    apiClass: "free",
  },
  {
    key: "groq-gpt-oss-120b-free",
    label: "GPT-OSS 120B (Groq free)",
    note: "Groq (gratis, 8K tokens/min)",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    apiClass: "free",
  },
  {
    key: "ollama-qwen3",
    label: "Qwen3 local (Ollama)",
    note: "Modelo local via Ollama",
    provider: "ollama",
    model: "qwen3:8b",
    apiClass: "local",
  },
];

export function getModelByKey(key: string): ModelOption | undefined {
  return MODEL_REGISTRY.find((entry) => entry.key === key);
}
