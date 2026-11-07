/**
 * Lógica de negocio pura — sin DOM, sin Firebase, testeable.
 * Todas las funciones son puras y determinísticas.
 * JS puro (sin TypeScript) para que corra directo en el navegador.
 */

// ============================================
// CONSTANTES DE NEGOCIO
// ============================================

export const ESCALAFONES = Object.freeze(['Comando', 'Administrativo', 'General']);
export const TIPOS_HORA = Object.freeze(['Servicio', 'CORES', 'Cátedra']);
export const DIAS_SEMANA = Object.freeze([
  'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'
]);

export const MAX_CORES_POR_ESCALAFON = Object.freeze({
  Comando: 80,
  Administrativo: 60,
  General: 0
});

export const COLORES_TIPO = Object.freeze({
  Servicio: '#0284c7',
  CORES: '#ea580c',
  Cátedra: '#16a34a'
});

export const ETIQUETAS_TIPO = Object.freeze({
  Servicio: 'Serv',
  CORES: 'Core',
  Cátedra: 'Cat'
});

// ============================================
// UTILIDADES DE FECHA/HORA
// ============================================

export function parseHora(hora) {
  return Number.parseInt(hora.split(':')[0], 10);
}

export function formatearHora(hora) {
  return `${String(hora).padStart(2, '0')}:00`;
}

export function duracionHoras(entrada, salida) {
  const inicio = parseHora(entrada);
  const fin = parseHora(salida);
  let diff = fin - inicio;
  if (diff < 0) diff += 24;
  return diff;
}

export function esDomingo(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia).getDay() === 0;
}

export function obtenerDiaSemana(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const idx = new Date(anio, mes - 1, dia).getDay();
  return DIAS_SEMANA[idx];
}

export function fechaInicioSemana(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const d = new Date(anio, mes - 1, dia);
  const diff = d.getDay();
  d.setDate(d.getDate() - diff);
  return d.toISOString().split('T')[0];
}

export function fechaFinSemana(fechaInicio) {
  const [anio, mes, dia] = fechaInicio.split('-').map(Number);
  const d = new Date(anio, mes - 1, dia);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

export function semanaTexto(fechaInicio, fechaFin) {
  const fmt = (f) => {
    const [a, m, d] = f.split('-');
    return `${d}/${m}`;
  };
  return `Semana del ${fmt(fechaInicio)} al ${fmt(fechaFin)}`;
}

export function fechaFormato(fecha) {
  if (fecha instanceof Date) {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
  }
  return fecha; // ya es string YYYY-MM-DD
}

export function estaEnSemanaActual(fechaInicio, fechaFin) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const ini = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  return hoy >= ini && hoy <= fin;
}

// ============================================
// VALIDACIONES DE NEGOCIO
// ============================================

export function validarBloque(bloque) {
  if (!DIAS_SEMANA.includes(bloque.dia)) {
    return { ok: false, error: `Día inválido: ${bloque.dia}` };
  }
  if (!TIPOS_HORA.includes(bloque.tipo)) {
    return { ok: false, error: `Tipo inválido: ${bloque.tipo}` };
  }
  const hEntrada = parseHora(bloque.entrada);
  const hSalida = parseHora(bloque.salida);
  if (Number.isNaN(hEntrada) || Number.isNaN(hSalida) || hEntrada < 0 || hEntrada > 24 || hSalida < 0 || hSalida > 24) {
    return { ok: false, error: 'Horas inválidas (0-24)' };
  }
  if (hEntrada === hSalida) {
    return { ok: false, error: 'Entrada y salida no pueden ser iguales' };
  }
  return { ok: true };
}

export function validarSuperposicion(bloques) {
  for (let i = 0; i < bloques.length; i++) {
    for (let j = i + 1; j < bloques.length; j++) {
      const a = bloques[i];
      const b = bloques[j];
      if (a.dia !== b.dia) continue;

      const aIni = parseHora(a.entrada);
      const aFin = parseHora(a.salida);
      const bIni = parseHora(b.entrada);
      const bFin = parseHora(b.salida);

      if (Math.max(aIni, bIni) < Math.min(aFin, bFin)) {
        return {
          ok: false,
          error: `Conflicto en ${a.dia.toUpperCase()}: ${a.tipo} (${a.entrada}–${a.salida}) se superpone con ${b.tipo} (${b.entrada}–${b.salida})`
        };
      }
    }
  }
  return { ok: true };
}

export function validarCoresPorEscalafon(bloques, escalafon) {
  const horasCores = bloques
    .filter(b => b.tipo === 'CORES')
    .reduce((sum, b) => sum + duracionHoras(b.entrada, b.salida), 0);

  if (horasCores === 0) return { ok: true };

  if (!['Comando', 'Administrativo'].includes(escalafon)) {
    return { ok: false, error: `El escalafón ${escalafon} no puede registrar CORES` };
  }

  const max = MAX_CORES_POR_ESCALAFON[escalafon];
  if (horasCores > max) {
    return { ok: false, error: `Superás el máximo de ${max} hs de CORES para ${escalafon}` };
  }
  return { ok: true };
}

export function validarCupoCoresMensual(bloquesNuevos, horariosExistentes, efectivoIdActual, cupoTotal) {
  const horasCoresNuevas = bloquesNuevos
    .filter(b => b.tipo === 'CORES')
    .reduce((sum, b) => sum + duracionHoras(b.entrada, b.salida), 0);

  if (horasCoresNuevas === 0) return { ok: true };

  const horasCoresExistentes = horariosExistentes
    .filter(h => h.efectivoId !== efectivoIdActual)
    .flatMap(h => h.bloques || [])
    .filter(b => b.tipo === 'CORES')
    .reduce((sum, b) => sum + duracionHoras(b.entrada, b.salida), 0);

  const restantes = cupoTotal - horasCoresExistentes;
  if (horasCoresNuevas > restantes) {
    return { ok: false, error: `No hay suficiente cupo de CORES. Disponibles: ${restantes} hs` };
  }
  return { ok: true };
}

export function validarHorarioCompleto(bloques, escalafon, horariosExistentes, efectivoId, cupoTotal) {
  const checks = [
    () => validarSuperposicion(bloques),
    () => validarCoresPorEscalafon(bloques, escalafon),
    () => validarCupoCoresMensual(bloques, horariosExistentes, efectivoId, cupoTotal)
  ];

  for (const check of checks) {
    const result = check();
    if (!result.ok) return result;
  }
  return { ok: true };
}

// ============================================
// CÁLCULOS Y AGREGACIONES
// ============================================

export function calcularHorasTotales(bloques) {
  return bloques.reduce((sum, b) => sum + duracionHoras(b.entrada, b.salida), 0);
}

export function calcularHorasCores(bloques) {
  return bloques
    .filter(b => b.tipo === 'CORES')
    .reduce((sum, b) => sum + duracionHoras(b.entrada, b.salida), 0);
}

export function calcularHorasPorTipo(bloques) {
  const result = { Servicio: 0, CORES: 0, 'Cátedra': 0 };
  bloques.forEach(b => { result[b.tipo] += duracionHoras(b.entrada, b.salida); });
  return result;
}

export function agruparBloquesPorDia(bloques) {
  const result = {};
  DIAS_SEMANA.forEach(d => result[d] = []);
  bloques.forEach(b => result[b.dia].push(b));
  return result;
}

export function obtenerBloquesDelDia(bloques, dia) {
  return bloques.filter(b => b.dia === dia);
}

// ============================================
// PRESENTISMO - VISTA PLANILLA (estilo XLSX)
// ============================================

export function generarPlanillaDiaria(efectivos, horarios, fecha) {
  const diaKey = obtenerDiaSemana(fecha);
  const rows = [];

  Object.entries(efectivos).forEach(([id, efectivo]) => {
    const horario = horarios[id];
    const bloquesDia = horario?.bloques?.filter(b => b.dia === diaKey) || [];

    const rangos = agruparContiguos(bloquesDia);
    const totalHoras = bloquesDia.reduce((sum, b) => sum + duracionHoras(b.entrada, b.salida), 0);

    rows.push({ efectivo, dia: diaKey, bloques: bloquesDia, rangos, totalHoras });
  });

  return rows;
}

function agruparContiguos(bloques) {
  if (!bloques.length) return [];

  const ordenados = [...bloques].sort((a, b) => parseHora(a.entrada) - parseHora(b.entrada));

  const rangos = [];
  let actual = { ...ordenados[0] };

  for (let i = 1; i < ordenados.length; i++) {
    const sig = ordenados[i];
    const actualFin = parseHora(actual.salida);
    const sigIni = parseHora(sig.entrada);

    if (actual.tipo === sig.tipo && actualFin === sigIni) {
      actual.salida = sig.salida;
    } else {
      rangos.push({
        tipo: actual.tipo,
        inicio: actual.entrada,
        fin: actual.salida,
        horas: duracionHoras(actual.entrada, actual.salida)
      });
      actual = { ...sig };
    }
  }

  rangos.push({
    tipo: actual.tipo,
    inicio: actual.entrada,
    fin: actual.salida,
    horas: duracionHoras(actual.entrada, actual.salida)
  });

  return rangos;
}

// ============================================
// EXPORTACIÓN XLSX - MAPEO A PLANTILLA
// ============================================

export const TEMPLATE_COLUMNS = Object.freeze({
  order: 1,             // A: Orden
  rank: 3,              // C: Jerarquía
  escalafon: 4,         // D: Escalafón
  legajo: 5,            // E: Legajo
  nombre: 6,            // F: Apellido y nombre
  ordinaryEntry: 7,     // G: Horario ordinario - entrada
  ordinaryExit: 9,      // I: Horario ordinario - salida
  ordinaryHours: 11,    // K: Total horas ordinarias
  coresEntry: 12,       // L: CORES - inicio
  coresExit: 14,        // N: CORES - finaliza
  coresHours: 16        // P: Total horas CORES
});

export function convertirAPlanillaXlsx(rows) {
  return rows.map(row => {
    const ordinary = row.rangos.filter(r => r.tipo === 'Servicio' || r.tipo === 'Cátedra');
    const cores = row.rangos.filter(r => r.tipo === 'CORES');

    return {
      nombre: row.efectivo.nombre,
      legajo: row.efectivo.legajo,
      cargo: row.efectivo.cargo,
      escalafon: row.efectivo.escalafon || '-',
      ordinaryEntry: ordinary[0]?.inicio || '',
      ordinaryExit: ordinary[ordinary.length - 1]?.fin || '',
      ordinaryHours: ordinary.reduce((s, r) => s + r.horas, 0),
      coresEntry: cores[0]?.inicio || '',
      coresExit: cores[cores.length - 1]?.fin || '',
      coresHours: cores.reduce((s, r) => s + r.horas, 0)
    };
  });
}

// ============================================
// ROLES Y PERMISOS
// ============================================

export const ROLE_PERMISSIONS = Object.freeze({
  admin: {
    leerEfectivos: true,
    escribirEfectivos: true,
    leerHorarios: true,
    escribirHorarios: true,
    leerConfig: true,
    escribirConfig: true,
    gestionarUsuarios: true
  },
  operador: {
    leerEfectivos: true,
    escribirEfectivos: true,
    leerHorarios: true,
    escribirHorarios: true,
    leerConfig: true,
    escribirConfig: false,
    gestionarUsuarios: false
  },
  viewer: {
    leerEfectivos: true,
    escribirEfectivos: false,
    leerHorarios: true,
    escribirHorarios: false,
    leerConfig: true,
    escribirConfig: false,
    gestionarUsuarios: false
  }
});

export function puede(rol, accion) {
  return ROLE_PERMISSIONS[rol]?.[accion] === true;
}

export function rolDesdeCustomClaims(claims) {
  if (claims.admin === true) return 'admin';
  if (claims.operador === true) return 'operador';
  return 'viewer';
}