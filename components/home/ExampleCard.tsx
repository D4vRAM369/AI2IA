import Link from "next/link";

import type { ExampleDialogue } from "@/lib/examples";

export default function ExampleCard({ example }: { example: ExampleDialogue }) {
  return (
    <article className="exampleCard">
      <p className="cardKicker">
        {example.provisional && <span className="badge">Maqueta</span>}
        <span>{example.turns.length} turnos</span>
      </p>
      <h3>{example.title}</h3>
      <p className="cardTopic">{example.topic}</p>
      <p className="vs">
        <span className="vsA">A · {example.modelA}</span>
        <span className="vsB">B · {example.modelB}</span>
      </p>
      <Link href={`/ejemplos/${example.id}/`} className="cardGo">
        Leer →<span className="srOnly"> {example.title}</span>
      </Link>
    </article>
  );
}
