const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "out");

function outputFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? outputFiles(file) : /\.(html|js)$/.test(entry.name) ? [file] : [];
  });
}

describe("Grupo 1: estructura del build público", () => {
  it("genera out/index.html", () => {
    assert.ok(existsSync(path.join(output, "index.html")), "Falta out/index.html");
  });

  it("no exporta ninguna ruta de servidor (out/api)", () => {
    assert.equal(existsSync(path.join(output, "api")), false);
  });

  // Solo HTML: Next incluye la cadena fonts.googleapis.com como constante interna en su JS,
  // pero lo que importa es que ninguna página enlace a Google Fonts (next/font autoaloja en el build).
  for (const forbidden of ["fonts.googleapis.com", "fonts.gstatic.com"]) {
    it(`ningún HTML enlaza a ${forbidden}`, () => {
      const matches = outputFiles(output)
        .filter((file) => file.endsWith(".html") && readFileSync(file, "utf8").includes(forbidden));
      assert.deepEqual(matches.map((file) => path.relative(root, file)), [], `Referencias prohibidas a ${forbidden}`);
    });
  }

  it("restaura app/api/chat/route.ts", () => {
    assert.ok(existsSync(path.join(root, "app/api/chat/route.ts")), "No se restauró la ruta API");
  });
});

describe("Grupo 2: rutas públicas", () => {
  for (const route of ["app", "archivo", "ejemplos/curiosidad"]) {
    it(`genera /${route}/`, () => {
      assert.ok(existsSync(path.join(output, route, "index.html")), `Falta out/${route}/index.html`);
    });
  }

  it("no genera /ejemplos/no-existe", () => {
    assert.equal(existsSync(path.join(output, "ejemplos/no-existe")), false);
  });
});
