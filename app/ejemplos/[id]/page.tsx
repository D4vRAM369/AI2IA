import Link from "next/link";
import { notFound } from "next/navigation";

import ExampleReader from "@/components/ExampleReader";
import SiteNav from "@/components/SiteNav";
import TrackOnMount from "@/components/TrackOnMount";
import { getExample, getExamples } from "@/lib/examples";

// Sitio estático: solo se generan los ids que existen; cualquier otro es 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return getExamples().map((example) => ({ id: example.id }));
}

export default async function ExamplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const example = getExample(id);
  if (!example) notFound();
  return (
    <>
      <SiteNav />
      <TrackOnMount event="READ" id={example.id} />
      <main className="page">
        <ExampleReader example={example} />
        <p className="cta">
          <Link href="/app/" className="btnPrimary">Probar con mi clave →</Link>
        </p>
      </main>
    </>
  );
}
