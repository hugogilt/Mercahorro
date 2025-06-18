const fs = require('fs');

// Cargar archivos
const anterior = JSON.parse(fs.readFileSync('productos_equivalentes-anterior.json', 'utf8'));
const actual = JSON.parse(fs.readFileSync('productos_equivalentes.json', 'utf8'));

// Función para normalizar nombre
function normalizar(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/marca blanca/g, "")
    .replace(/[^a-z0-9]/g, " ") // quitar símbolos
    .replace(/\s+/g, " ") // quitar espacios repetidos
    .trim();
}

// Distancia de Levenshtein
function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return matrix[a.length][b.length];
}

// Porcentaje de similitud
function similitud(a, b) {
  const lev = levenshtein(a, b);
  return 1 - lev / Math.max(a.length, b.length);
}

// Buscar producto similar
function buscarProductoSimilar(producto, lista) {
    const nombreNorm = normalizar(producto.nombre);
    const idConsum = producto.consum?.id;
  
    let mejorMatch = null;
    let mejorSimilitud = 0;
  
    for (const p of lista) {
      // 1. Emparejar por ID exacto (si existe)
      if (idConsum && p.consum?.id === idConsum) {
        return p; // ID coincide, es el mismo producto
      }
  
      // 2. Comparar nombre normalizado si no coincide el ID
      const nombreComp = normalizar(p.nombre);
      const sim = similitud(nombreNorm, nombreComp);
  
      if (sim > mejorSimilitud) {
        mejorSimilitud = sim;
        mejorMatch = p;
      }
    }
  
    // 3. Devolver match si tiene buena similitud (> 0.8)
    return mejorSimilitud >= 0.8 ? mejorMatch : null;
  }
  

// Lógica principal
const cambios = [];
const revisados = new Set();

// Revisar productos antiguos
for (const prodAnterior of anterior) {
  const match = buscarProductoSimilar(prodAnterior, actual);

  if (match) {
    revisados.add(match.nombre);
    if (JSON.stringify(prodAnterior) !== JSON.stringify(match)) {
      cambios.push({
        tipo: "modificado",
        anterior: prodAnterior,
        actual: match
      });
    }
  } else {
    cambios.push({ tipo: "eliminado", producto: prodAnterior });
  }
}

// Detectar productos nuevos
for (const prodActual of actual) {
  if (!revisados.has(prodActual.nombre)) {
    cambios.push({ tipo: "nuevo", producto: prodActual });
  }
}

// Guardar resultados
fs.writeFileSync('cambios_productos.json', JSON.stringify(cambios, null, 2), 'utf8');
console.log(`Comparación finalizada. Se encontraron ${cambios.length} cambios.`);
