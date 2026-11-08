import type { ExampleDialogue } from "@/lib/examples";

// Vista de lectura de un diálogo guardado. A, B y observador se distinguen por letra y nombre, no solo por color.
export default function ExampleReader({ example }: { example: ExampleDialogue }) {
  const label = (role: "A" | "B" | "OBS") =>
    role === "A" ? `A · ${example.modelA}` : role === "B" ? `B · ${example.modelB}` : "TÚ · OBSERVADOR";
  const wrap = { A: "bubbleWrapA", B: "bubbleWrapB", OBS: "bubbleWrapObs" } as const;
  const meta = { A: "metaA", B: "metaB", OBS: "metaObs" } as const;
  const bubble = { A: "bubbleA", B: "bubbleB", OBS: "bubbleObs" } as const;

  return (
    <article>
      <header className="readerHead">
        <p className="eyebrowMono">{example.date} · {example.turns.length} turnos</p>
        <h1>{example.title}</h1>
        <p className="cardTopic">{example.topic}</p>
        {example.provisional && (
          <p className="provisionalNote">
            <span className="badge">Maqueta</span> Texto escrito para esta vista previa. No procede de modelos reales.
          </p>
        )}
      </header>
      <div className="messages" role="log" aria-label="Conversación de ejemplo">
        {example.turns.map((turn, index) => (
          <div key={index} className={`bubbleWrap ${wrap[turn.role]}`}>
            <div className={meta[turn.role]}>{label(turn.role)}</div>
            <div className={`bubble ${bubble[turn.role]}`}>{turn.text}</div>
          </div>
        ))}
      </div>
    </article>
  );
}
