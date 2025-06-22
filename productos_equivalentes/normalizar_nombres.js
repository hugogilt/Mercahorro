const fs = require('fs');
const path = require('path');

// ------------------ Configuración ------------------
const RUTA_CONSUM = path.join(__dirname, 'productos_consum-normalizar-nombres.json');
const RUTA_MERCADONA = path.join(__dirname, 'productos_mercadona-normalizar-nombres.json');
const RANGO_TOLERANCIA_MAXIMA = 0.6;

// ------------------ Funciones auxiliares ------------------
function normalizarNombre(nombre) {
  return nombre
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/(hacendado|consum|marca blanca|pascual|danone|coca-cola|pepsi|nestle)/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(\w+)s\b/g, '$1')
    .split(/\s+/)
    .sort()
    .join(' ')
    .trim();
}

function esMarcaBlanca(nombre) {
  return /(hacendado|consum|marca blanca|bosque verde)/i.test(nombre);
}

function estimarPesoConsum(p) {
  return +(p.precio / p.precio_kilo).toFixed(2);
}

function diferenciaRelativa(a, b) {
  return Math.abs(a - b) / ((a + b) / 2);
}

function limpiarNombre(nombre) {
  return nombre
    .replace(/\b(hacendado|consum|marca blanca|bosque verde)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ✅ Excepción para "Pañuelos de papel" vs "Pañuelo Compacto..."
function esExcepcionPañuelos(nombreConsum, nombreMercadona) {
  const nombreC = nombreConsum.toLowerCase();
  const nombreM = nombreMercadona.toLowerCase();

  // Ambas deben contener "pañuelo"
  if (!nombreC.includes("pañuelo") || !nombreM.includes("pañuelo")) {
    return false;
  }

  // Si Mercadona es Bosque Verde y Consum NO es marca blanca, NO emparejar
  if (nombreM.includes("bosque verde") && !nombreC.includes("consum")) {
    return false;
  }

  // Variantes específicas
  const variantes = ["mentol", "aloe", "extra", "suave"];
  const variantesC = variantes.filter(v => nombreC.includes(v));
  const variantesM = variantes.filter(v => nombreM.includes(v));

  if (variantesC.length && variantesM.length) {
    // Si ambos especifican variante, deben coincidir
    return variantesC.some(v => variantesM.includes(v));
  }

  if (!variantesC.length && variantesM.length) {
    // Si Consum NO especifica variante pero Mercadona sí, asumir coincidencia
    return true;
  }

  if (!variantesC.length && !variantesM.length) {
    // Ninguno especifica variante, asumimos coincidencia genérica
    return true;
  }

  return false;
}




// ------------------ Carga de archivos ------------------
const productosConsum = JSON.parse(fs.readFileSync(RUTA_CONSUM));
const productosMercadona = JSON.parse(fs.readFileSync(RUTA_MERCADONA));

// ------------------ Preparar datos ------------------
const productosC = productosConsum.map(p => {
  const nombreNormalizado = normalizarNombre(p.nombre || '');
  const peso = estimarPesoConsum(p);
  return {
    original: p,
    nombreNormalizado,
    peso,
    esMarcaBlanca: esMarcaBlanca(p.nombre),
    supermercado: 'Consum'
  };
});

const productosM = productosMercadona.map(p => {
  const nombreNormalizado = normalizarNombre(p.nombre || '');
  const peso = parseFloat(p.peso);
  return {
    original: p,
    nombreNormalizado,
    peso,
    esMarcaBlanca: esMarcaBlanca(p.nombre),
    supermercado: 'Mercadona'
  };
});

// ------------------ Emparejamiento ------------------
const matches = [];
const usadosConsum = new Set();
const usadosMercadona = new Set();

for (const prodM of productosM) {
  if (usadosMercadona.has(prodM.original.nombre)) continue;

  const candidatos = productosC.filter(prodC =>
    !usadosConsum.has(prodC.original.nombre) && (
      (prodC.nombreNormalizado === prodM.nombreNormalizado && prodC.esMarcaBlanca === prodM.esMarcaBlanca) ||
      esExcepcionPañuelos(prodC.original.nombre, prodM.original.nombre) // ✅ Excepción especial
    )
  );

  let mejorMatch = null;
  let menorDiferencia = Infinity;

  for (const candidato of candidatos) {
    const diff = Math.abs(prodM.peso - candidato.peso);
    if (diff < menorDiferencia) {
      menorDiferencia = diff;
      mejorMatch = candidato;
    }
  }

  const rompeReglaCoca = /coca[-\s]?cola/i.test(prodM.original.nombre) &&
    /hacendado|consum/i.test(mejorMatch?.original?.nombre || '');
  const excesoDiferencia = diferenciaRelativa(prodM.peso, mejorMatch?.peso || 0) > RANGO_TOLERANCIA_MAXIMA;

  if (mejorMatch && !rompeReglaCoca && !excesoDiferencia) {
    usadosConsum.add(mejorMatch.original.nombre);
    usadosMercadona.add(prodM.original.nombre);

    const ambosMarcaBlanca = mejorMatch.esMarcaBlanca && prodM.esMarcaBlanca;
    let nombreFinal = limpiarNombre(prodM.original.nombre);

    if (ambosMarcaBlanca) {
      nombreFinal += ' Marca Blanca';
    }

    matches.push({
      nombre: nombreFinal,
      consum: mejorMatch.original,
      mercadona: prodM.original
    });
  }
}

// ------------------ Productos sin pareja ------------------
const unicosConsum = productosC
  .filter(p => !usadosConsum.has(p.original.nombre))
  .map(p => p.original);

const unicosMercadona = productosM
  .filter(p => !usadosMercadona.has(p.original.nombre))
  .map(p => p.original);

// ------------------ Guardar resultados ------------------
fs.writeFileSync('productos_equivalentes.json', JSON.stringify(matches, null, 2));
fs.writeFileSync('productos_solo_consum.json', JSON.stringify(unicosConsum, null, 2));
fs.writeFileSync('productos_solo_mercadona.json', JSON.stringify(unicosMercadona, null, 2));

console.log("✅ Comparación completada.");
console.log(`🔁 Productos equivalentes: ${matches.length}`);
console.log(`🟠 Solo en Consum: ${unicosConsum.length}`);
console.log(`🔵 Solo en Mercadona: ${unicosMercadona.length}`);
