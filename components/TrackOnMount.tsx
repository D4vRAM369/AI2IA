"use client";

import { useEffect } from "react";

import { track, type AppEvent } from "@/lib/analytics";

// Registra un evento de analítica una vez al mostrar la página. `id` solo admite un slug (lo valida `track`).
export default function TrackOnMount({ event, id }: { event: AppEvent; id?: string }) {
  useEffect(() => {
    track(event, id);
  }, [event, id]);
  return null;
}
