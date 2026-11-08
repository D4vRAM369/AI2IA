export type AppEvent = "VIEW" | "READ" | "START" | "OBS" | "EXPORT";

type GoatCounter = { count?: (options: { path: string; title: string; event: boolean }) => void };

// Solo ids con forma de slug: así nunca viaja texto escrito por una persona.
const SAFE_ID = /^[a-z0-9-]{1,40}$/;

// El script de GoatCounter carga de forma asíncrona y VIEW se dispara al montar la página:
// si aún no está listo se reintenta cada 300 ms.
// ponytail: máximo 10 reintentos (~3 s); con adblock el evento se descarta. Una cola real solo si hiciera falta más.
const RETRY_MS = 300;
const MAX_ATTEMPTS = 10;

export function track(event: AppEvent, id?: string, attempt = 0): void {
  try {
    const counter = (window as unknown as { goatcounter?: GoatCounter }).goatcounter;
    if (!counter?.count) {
      if (attempt < MAX_ATTEMPTS) setTimeout(() => track(event, id, attempt + 1), RETRY_MS);
      return;
    }
    const suffix = id && SAFE_ID.test(id) ? `/${id}` : "";
    counter.count({ path: `evt/${event}${suffix}`, title: event, event: true });
  } catch {
    // Adblock, GoatCounter sin configurar o `window` ausente: la app sigue funcionando.
  }
}
