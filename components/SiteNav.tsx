import Link from "next/link";

// Next sustituye el literal process.env.NEXT_PUBLIC_METRICS_URL en el build.
// Sin la variable, «Métricas» no aparece: por defecto el panel es privado.
export default function SiteNav() {
  const metricsUrl = process.env.NEXT_PUBLIC_METRICS_URL;
  return (
    <nav className="siteNav" aria-label="Principal">
      <Link href="/" className="navBrand">AI2IA</Link>
      <ul className="navLinks">
        <li><Link href="/archivo/">Ejemplos</Link></li>
        <li><Link href="/app/">Probar</Link></li>
        {metricsUrl && (
          <li><a href={metricsUrl} target="_blank" rel="noreferrer">Métricas</a></li>
        )}
      </ul>
      <span className="navKey">Tu clave · solo en memoria</span>
    </nav>
  );
}
