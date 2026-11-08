import type { ModelOption, ModelProvider } from "@/lib/model-registry";

// Proveedores con CORS comprobado el 8 nov 2026 (ver docs/05_ERRORES_Y_SOLUCIONES.md).
// Ollama queda fuera: un sitio estático no puede llegar al Ollama local de cada visitante.
export const PUBLIC_PROVIDERS: readonly ModelProvider[] = ["anthropic", "openrouter", "zai", "siliconflow"];

export function modelsForMode(models: ModelOption[], isPublic: boolean): ModelOption[] {
  return isPublic ? models.filter((model) => PUBLIC_PROVIDERS.includes(model.provider)) : models;
}
