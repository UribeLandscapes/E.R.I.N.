const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// En Apps Script todos los archivos comparten un solo ámbito global: dos `const` o `function`
// con el mismo nombre en archivos distintos rompen el proyecto entero al cargar.
test('ningún nombre global se declara en dos archivos de src', () => {
  const carpeta = path.join(__dirname, '..', 'src');
  const vistos = new Map();
  const repetidos = [];
  for (const archivo of fs.readdirSync(carpeta).filter((a) => a.endsWith('.js'))) {
    const texto = fs.readFileSync(path.join(carpeta, archivo), 'utf8');
    for (const [, nombre] of texto.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (vistos.has(nombre)) repetidos.push(`${nombre} (${vistos.get(nombre)} y ${archivo})`);
      else vistos.set(nombre, archivo);
    }
  }
  assert.deepEqual(repetidos, []);
});
