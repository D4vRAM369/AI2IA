import type { ModelOption } from "@/lib/model-registry";

const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const MAX_DYNAMIC = 10;
const SAFE_ID = /^[A-Za-z0-9._\-/]{1,100}:free$/;

type CatalogEntry = {
  id?: unknown;
  name?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  reasoning?: unknown;
};

function isFreeTextModel(entry: CatalogEntry): entry is CatalogEntry & { id: string } {
  if (!entry || typeof entry !== "object") return false;
  const out = entry.architecture?.output_modalities;
  const input = entry.architecture?.input_modalities;
  return typeof entry.id === "string" && SAFE_ID.test(entry.id)
    && String(entry.pricing?.prompt) === "0" && String(entry.pricing?.completion) === "0"
    && Array.isArray(out) && out.length === 1 && out[0] === "text"
    && Array.isArray(input) && input.includes("text");
}

// Mezcla la lista fija con el catálogo público: quita los :free que ya no existen y añade los nuevos.
// Si el catálogo no tiene la forma esperada, devuelve la lista fija sin tocar.
export function mergeFreeModels(base: ModelOption[], catalog: unknown): ModelOption[] {
  const data = (catalog as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return base;
  const free = (data as CatalogEntry[]).filter(isFreeTextModel);
  if (free.length === 0) return base;
  const alive = new Set(free.map((entry) => entry.id));
  const kept = base.filter((model) => model.provider !== "openrouter"
    || model.model === "openrouter/free" || alive.has(model.model));
  const known = new Set(kept.map((model) => model.model));
  const extra: ModelOption[] = free
    .filter((entry) => !known.has(entry.id))
    .slice(0, MAX_DYNAMIC)
    .map((entry) => {
      const name = typeof entry.name === "string" ? entry.name.replace(/\s*\(free\)\s*$/i, "").slice(0, 60) : entry.id;
      return {
        key: `or-${entry.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
        label: `${name} (OpenRouter free)`,
        note: entry.reasoning === true ? "Catalogo en vivo · razona: puede gastar tokens pensando" : "Catalogo en vivo",
        provider: "openrouter" as const,
        model: entry.id,
        apiClass: "free" as const,
      };
    });
  return [...kept, ...extra];
}

// GET público sin clave ni datos del diálogo. Cualquier fallo devuelve la lista fija.
export async function loadFreeModels(base: ModelOption[], signal?: AbortSignal): Promise<ModelOption[]> {
  try {
    const response = await fetch(CATALOG_URL, { signal });
    if (!response.ok) return base;
    return mergeFreeModels(base, await response.json());
  } catch {
    return base;
  }
}
