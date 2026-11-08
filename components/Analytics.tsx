// Carga GoatCounter solo si NEXT_PUBLIC_GOATCOUNTER_URL está definida (p. ej. https://TU-CUENTA.goatcounter.com).
// Sin cookies. Next sustituye el literal process.env.NEXT_PUBLIC_GOATCOUNTER_URL en el build.
export default function Analytics() {
  const url = process.env.NEXT_PUBLIC_GOATCOUNTER_URL;
  if (!url) return null;
  return <script async data-goatcounter={`${url.replace(/\/$/, "")}/count`} src="//gc.zgo.at/count.js" />;
}
