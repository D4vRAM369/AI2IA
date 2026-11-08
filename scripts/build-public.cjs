const { spawn } = require("node:child_process");
const { existsSync, renameSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const api = path.join(root, "app/api");
const backup = path.join(root, ".api-off");

async function main() {
  if (existsSync(backup)) {
    if (existsSync(api)) {
      throw new Error("Existen app/api y .api-off. Resuelve el conflicto antes de compilar; no se ha sobrescrito nada.");
    }
    renameSync(backup, api);
    console.log("API recuperada de una ejecución anterior.");
  }

  let moved = false;
  let child;
  let interrupted;
  const onSignal = (signal) => {
    if (interrupted) return;
    interrupted = signal;
    console.error(`Recibido ${signal}; deteniendo el build para restaurar la API.`);
    if (child?.pid) {
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") child.kill("SIGKILL");
      }
    }
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    // ponytail: mover app/api es frágil; sustituir por configuración de rutas cuando haya dos builds estables
    renameSync(api, backup);
    moved = true;
    console.log("API apartada; compilando la versión pública.");
    const code = await new Promise((resolve, reject) => {
      child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
        cwd: root,
        env: { ...process.env, NEXT_PUBLIC_APP_MODE: "public" },
        stdio: "inherit",
        detached: process.platform !== "win32",
      });
      child.once("error", reject);
      child.once("close", (status) => resolve(status ?? 1));
    });
    process.exitCode = interrupted ? (interrupted === "SIGINT" ? 130 : 143) : code;
    if (process.exitCode !== 0) console.error(`El build público no terminó correctamente (código ${process.exitCode}).`);
  } finally {
    try {
      if (moved) {
        if (existsSync(api)) {
          throw new Error("app/api reapareció durante el build. La API original permanece en .api-off; no se ha sobrescrito nada.");
        }
        renameSync(backup, api);
        console.log("API restaurada en app/api.");
      }
    } finally {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
  }
}

main().catch((error) => {
  console.error(`No se pudo completar el build público: ${error.message}`);
  process.exitCode = 1;
});
