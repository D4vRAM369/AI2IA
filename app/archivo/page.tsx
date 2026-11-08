import ExampleCard from "@/components/home/ExampleCard";
import SiteNav from "@/components/SiteNav";
import { getExamples } from "@/lib/examples";

export const metadata = { title: "Archivo · AI2IA" };

export default function ArchivoPage() {
  return (
    <>
      <SiteNav />
      <main className="page">
        <h1 className="pageTitle">Archivo</h1>
        <div className="exampleGrid">
          {getExamples().map((example) => (
            <ExampleCard key={example.id} example={example} />
          ))}
          {/* Anuncia v2; sin enlace ni acción: todavía no existe. */}
          <article className="exampleCard soon" aria-label="Próximamente">
            <p className="cardKicker"><span className="badge badgeSoon">Próximamente · v2</span></p>
            <h3>Archivo de la comunidad</h3>
            <p className="cardTopic">Publica tus diálogos y léelos junto a otros.</p>
          </article>
        </div>
      </main>
    </>
  );
}
