/**
 * Validaciones de UI — wrappers que usan rules.js y devuelven formato amigable para UI.
 * Evita duplicación entre dashboard.js y schedule-ui.js
 * JS puro para navegador.
 */

import {
  validarSuperposicion,
  validarCoresPorEscalafon,
  validarCupoCoresMensual,
  validarHorarioCompleto,
  duracionHoras
} from './rules.js';

// ============================================
// VALIDACIÓN EN TIEMPO REAL (para schedule UI)
// ============================================

/**
 * Valida bloques de un día específico para feedback visual inmediato
 */
export function validarDiaUI(bloques, dia) {
  const bloquesDia = bloques.filter(b => b.dia === dia);

  const superposicion = validarSuperposicion(bloquesDia);
  if (!superposicion.ok) {
    return {
      ok: false,
      message: superposicion.error,
      day: dia,
      blocks: bloquesDia
    };
  }

  return { ok: true };
}

/**
 * Valida todos los días para el botón "Guardar horario"
 */
export function validarHorarioCompletoUI(bloques, escalafon, horariosExistentes, efectivoId, cupoTotal) {
  const result = validarHorarioCompleto(bloques, escalafon, horariosExistentes, efectivoId, cupoTotal);
  return {
    ok: result.ok,
    message: result.error
  };
}

// ============================================
// HELPERS PARA UI
// ============================================

export function obtenerHorasPorTipo(bloques) {
  const result = { Servicio: 0, CORES: 0, 'Cátedra': 0 };
  bloques.forEach(b => { result[b.tipo] = (result[b.tipo] || 0) + duracionHoras(b.entrada, b.salida); });
  return result;
}

export function generarResumenDia(bloques, dia) {
  const bloquesDia = bloques.filter(b => b.dia === dia);
  if (!bloquesDia.length) return 'Sin bloques';

  const horas = obtenerHorasPorTipo(bloquesDia);
  const partes = [];
  if (horas.Servicio) partes.push(`${horas.Servicio}h Servicio`);
  if (horas.CORES) partes.push(`${horas.CORES}h CORES`);
  if (horas['Cátedra']) partes.push(`${horas['Cátedra']}h Cátedra`);

  return `${bloquesDia.length} bloque${bloquesDia.length > 1 ? 's' : ''} · ${partes.join(', ')}`;
}

export function detectarConflictoDia(bloques, dia) {
  const bloquesDia = bloques.filter(b => b.dia === dia);
  for (let i = 0; i < bloquesDia.length; i++) {
    for (let j = i + 1; j < bloquesDia.length; j++) {
      const a = bloquesDia[i];
      const b = bloquesDia[j];
      const aIni = parseInt(a.entrada.split(':')[0], 10);
      const aFin = parseInt(a.salida.split(':')[0], 10);
      const bIni = parseInt(b.entrada.split(':')[0], 10);
      const bFin = parseInt(b.salida.split(':')[0], 10);
      if (Math.max(aIni, bIni) < Math.min(aFin, bFin)) {
        return `Superposición: ${a.tipo} (${a.entrada}–${a.salida}) con ${b.tipo} (${b.entrada}–${b.salida})`;
      }
    }
  }
  return null;
}