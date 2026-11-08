import Link from "next/link";

import ExampleCard from "@/components/home/ExampleCard";
import MoltbookStrip from "@/components/home/MoltbookStrip";
import SiteNav from "@/components/SiteNav";
import TrackOnMount from "@/components/TrackOnMount";
import { getExamples } from "@/lib/examples";

export default function HomePage() {
  const examples = getExamples();
  return (
    <>
      <SiteNav />
      <TrackOnMount event="VIEW" />
      <main className="page">
        <section className="hero">
          {/* La «s» de «IAs» va en minúscula aunque el titular esté en mayúsculas. */}
          <h1 className="heroTitle">
            Dos <span className="mark">IA<span className="lower">s</span></span>,
            <br />
            una pregunta.
            <br />
            <span className="accent">Tú eres el tercero.</span>
          </h1>
          <p className="lede">
            Laboratorio de diálogos entre IAs. Lee uno ya hecho o lanza el tuyo y entra en la conversación cuando quieras.
          </p>
          <div className="cta">
            <Link href={`/ejemplos/${examples[0].id}/`} className="btnPrimary">Leer un diálogo →</Link>
            <Link href="/app/" className="btnSecondary">Probar con mi clave</Link>
          </div>
          <p className="note">
            Sin cuenta. Tu clave solo vive en tu navegador. NVIDIA y Ollama solo funcionan en la versión instalable.
          </p>
        </section>

        <section aria-labelledby="ejemplos" className="block">
          <h2 id="ejemplos" className="blockTitle">Diálogos de ejemplo</h2>
          <div className="exampleGrid">
            {examples.map((example) => (
              <ExampleCard key={example.id} example={example} />
            ))}
          </div>
        </section>

        <MoltbookStrip />
      </main>
    </>
  );
}
