export type AppEvent = "VIEW" | "READ" | "START" | "OBS" | "EXPORT";

type GoatCounter = { count?: (options: { path: string; title: string; event: boolean }) => void };

// Solo ids con forma de slug: así nunca viaja texto escrito por una persona.
const SAFE_ID = /^[a-z0-9-]{1,40}$/;

export function track(event: AppEvent, id?: string): void {
  try {
    const counter = (window as unknown as { goatcounter?: GoatCounter }).goatcounter;
    if (!counter?.count) return;
    const suffix = id && SAFE_ID.test(id) ? `/${id}` : "";
    counter.count({ path: `evt/${event}${suffix}`, title: event, event: true });
  } catch {
    // Adblock, GoatCounter sin configurar o `window` ausente: la app sigue funcionando.
  }
}
