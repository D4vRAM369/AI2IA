// Next sustituye el literal process.env.NEXT_PUBLIC_APP_MODE en el build.
// El try/catch cubre los tests con node:vm, donde `process` no existe.
declare const process: { env: Record<string, string | undefined> };

export const IS_PUBLIC: boolean = (() => {
  try {
    return process.env.NEXT_PUBLIC_APP_MODE === "public";
  } catch {
    return false;
  }
})();
