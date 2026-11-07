import {
    auth,
    db,
    signOut,
    onAuthStateChanged,
    collection,
    addDoc,
    setDoc,
    getDocs,
    deleteDoc,
    doc
} from './firebase-config.js';

import {
    DIAS_SEMANA,
    TIPOS_HORA,
    ESCALAFONES,
    validarHorarioCompleto,
    calcularHorasTotales,
    calcularHorasCores,
    agruparBloquesPorDia,
    obtenerBloquesDelDia,
    generarPlanillaDiaria,
    convertirAPlanillaXlsx,
    estaEnSemanaActual,
    semanaTexto,
    fechaFormato,
    rolDesdeCustomClaims,
    puede,
    COLORES_TIPO,
    ETIQUETAS_TIPO
} from './business/index.js';

// ============================================
// ESTADO GLOBAL
// ============================================

const state = {
    horariosMap: {},
    efectivosMap: {},
    bancoCoresMensualTotal: 150,
    userRole: 'viewer',
    userClaims: {}
};

const elements = {
    tablaGeneral: document.getElementById('tabla-general'),
    formEfectivo: document.getElementById('form-efectivo'),
    formHorario: document.getElementById('form-horario'),
    selectEfectivo: document.getElementById('select-efectivo'),
    inputFechaPresentismo: document.getElementById('fecha-presentismo'),
    tablaPresentismo: document.getElementById('tabla-presentismo'),
    theadPresentismo: document.getElementById('thead-presentismo'),
    btnLogout: document.getElementById('btn-logout'),
    btnSidebarToggle: document.getElementById('btn-sidebar-toggle'),
    btnSidebarToggleDesktop: document.getElementById('btn-sidebar-toggle-desktop'),
    // Selector de semana
    semanaSelector: document.getElementById('semana-selector'),
    // Vista presentismo
    btnVistaPlanilla: document.getElementById('btn-vista-planilla'),
    btnVistaGrilla: document.getElementById('btn-vista-grilla')
};

// ============================================
// UTILIDADES UI
// ============================================

function cambiarPestana(nombrePestana) {
    document.querySelectorAll('.tab-content').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `content-${nombrePestana}`);
    });
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.pestana === nombrePestana);
    });
}

function mostrarNotificacion(mensaje, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${tipo === 'error' ? 'error' : tipo === 'info' ? 'info' : tipo === 'warning' ? 'warning' : ''}`.trim();
    const icon = tipo === 'error' ? '⚠' : tipo === 'info' ? 'ℹ' : tipo === 'warning' ? '⚠' : '✓';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${mensaje}</span>
        <button class="toast-close" aria-label="Cerrar">×</button>
    `;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

function limpiarContenedoresDias() {
    DIAS_SEMANA.forEach((dia) => {
        const contenedor = document.getElementById(`lista-${dia}`);
        if (contenedor) contenedor.innerHTML = '';
    });
}

function generarOpcionesHoras(seleccionada = '') {
    const options = [];
    for (let i = 0; i <= 24; i++) {
        const hora = i < 10 ? `0${i}:00` : `${i}:00`;
        const active = hora === seleccionada ? 'selected' : '';
        options.push(`<option value="${hora}" ${active}>${hora} hs</option>`);
    }
    return options.join('');
}

function agregarBloque(dia, tipo = 'Servicio', entrada = '08:00', salida = '16:00') {
    const contenedor = document.getElementById(`lista-${dia}`);
    if (!contenedor) return;

    const bloque = document.createElement('div');
    bloque.className = 'block-item';
    bloque.dataset.dia = dia;
    bloque.dataset.tipo = tipo;
    bloque.innerHTML = `
        <select class="tipo-hora">
            <option value="Servicio" ${tipo === 'Servicio' ? 'selected' : ''}>Servicio</option>
            <option value="CORES" ${tipo === 'CORES' ? 'selected' : ''}>CORES</option>
            <option value="Cátedra" ${tipo === 'Cátedra' ? 'selected' : ''}>Cátedra</option>
        </select>
        <select class="hora-entrada">${generarOpcionesHoras(entrada)}</select>
        <select class="hora-salida">${generarOpcionesHoras(salida)}</select>
        <button type="button" aria-label="Eliminar bloque">✕</button>
    `;

    bloque.querySelector('button').addEventListener('click', () => {
        bloque.remove();
        actualizarResumenDia(dia);
    });

    const tipoSelect = bloque.querySelector('.tipo-hora');
    tipoSelect.addEventListener('change', () => {
        bloque.dataset.tipo = tipoSelect.value;
        actualizarResumenDia(dia);
    });

    bloque.querySelectorAll('.hora-entrada, .hora-salida').forEach(sel => {
        sel.addEventListener('change', () => actualizarResumenDia(dia));
    });

    contenedor.appendChild(bloque);
    contenedor.closest('.day-card')?.setAttribute('open', '');
    tipoSelect?.focus();
    actualizarResumenDia(dia);
}

function actualizarResumenDia(dia) {
    const contenedor = document.getElementById(`lista-${dia}`);
    if (!contenedor) return;

    const bloques = [];
    contenedor.querySelectorAll('.block-item').forEach(item => {
        bloques.push({
            dia: dia,
            tipo: item.querySelector('.tipo-hora').value,
            entrada: item.querySelector('.hora-entrada').value,
            salida: item.querySelector('.hora-salida').value
        });
    });

    const tarjeta = contenedor.closest('.day-card');
    if (!tarjeta) return;

    const resumen = tarjeta.querySelector('.day-summary');
    const vacio = tarjeta.querySelector('.day-empty');
    const conflicto = tarjeta.querySelector('.day-conflict');

    if (resumen) {
        resumen.textContent = bloques.length
            ? `${bloques.length} ${bloques.length === 1 ? 'bloque' : 'bloques'} · ${calcularHorasTotales(bloques)} h`
            : 'Sin bloques';
    }
    if (vacio) vacio.hidden = bloques.length > 0;

    // Detectar conflicto
    let msg = '';
    for (let i = 0; i < bloques.length && !msg; i++) {
        for (let j = i + 1; j < bloques.length; j++) {
            const a = bloques[i], b = bloques[j];
            const aIni = parseInt(a.entrada.split(':')[0], 10);
            const aFin = parseInt(a.salida.split(':')[0], 10);
            const bIni = parseInt(b.entrada.split(':')[0], 10);
            const bFin = parseInt(b.salida.split(':')[0], 10);
            if (Math.max(aIni, bIni) < Math.min(aFin, bFin)) {
                msg = `Superposición: ${a.tipo} (${a.entrada}–${a.salida}) con ${b.tipo} (${b.entrada}–${b.salida})`;
                break;
            }
        }
    }
    if (conflicto) {
        conflicto.textContent = msg;
        conflicto.hidden = !msg;
    }

    // Los bordes se colorean via CSS usando data-tipo attribute
    // No necesitamos hacer nada aquí
}

// ============================================
// AUTENTICACIÓN Y ROLES
// ============================================

async function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('index.html');
            return;
        }

        const tokenResult = await user.getIdTokenResult();
        state.userClaims = tokenResult.claims || {};
        state.userRole = rolDesdeCustomClaims(state.userClaims);

        const userTag = document.getElementById('user-email');
        if (userTag) {
            const roleClass = state.userRole === 'admin' ? 'admin' : state.userRole === 'operador' ? 'operador' : 'viewer';
            userTag.innerHTML = `${user.email || 'Usuario'} <span class="role-badge ${roleClass}">${state.userRole.toUpperCase()}</span>`;
        }

        aplicarPermisosUI();

        const hoy = new Date().toISOString().split('T')[0];

        // Selector de semana - por defecto domingo de esta semana
        const domingoActual = fechaFormato(new Date(hoy));
        const [anio, mes, dia] = domingoActual.split('-').map(Number);
        const d = new Date(anio, mes - 1, dia);
        const diff = d.getDay();
        d.setDate(d.getDate() - diff);
        const domingoSemana = d.toISOString().split('T')[0];

        if (elements.semanaSelector) {
            elements.semanaSelector.value = domingoSemana;
            elements.semanaSelector.addEventListener('change', renderGeneralTable);
        }

        if (elements.inputFechaPresentismo) {
            elements.inputFechaPresentismo.value = hoy;
            elements.inputFechaPresentismo.addEventListener('change', cargarPresentismoDiario);
        }

        if (elements.btnVistaPlanilla) {
            elements.btnVistaPlanilla.addEventListener('click', () => setVistaPresentismo('planilla'));
        }
        if (elements.btnVistaGrilla) {
            elements.btnVistaGrilla.addEventListener('click', () => setVistaPresentismo('grilla'));
        }

        await cargarDatosDashboard();
    });
}

function aplicarPermisosUI() {
    const { userRole } = state;
    const canWrite = puede(userRole, 'escribirEfectivos');
    const canWriteHorarios = puede(userRole, 'escribirHorarios');
    const canWriteConfig = puede(userRole, 'escribirConfig');
    const canManageUsers = puede(userRole, 'gestionarUsuarios');

    // Formulario efectivos
    const formEfectivo = elements.formEfectivo;
    if (formEfectivo) {
        formEfectivo.querySelectorAll('input, select, button').forEach(el => {
            el.disabled = !canWrite;
        });
    }

    // Formulario horarios
    const formHorario = elements.formHorario;
    if (formHorario) {
        formHorario.querySelectorAll('input, select, button').forEach(el => {
            el.disabled = !canWriteHorarios;
        });
    }

    // Banco CORES config
    const formBanco = document.getElementById('form-banco-cores');
    if (formBanco) {
        formBanco.querySelectorAll('input, button').forEach(el => {
            el.disabled = !canWriteConfig;
        });
    }

    // Botón resetear CORES (solo admin)
    const btnReset = document.querySelector('.btn-danger[onclick*="limpiarHorasCoresHuerfanas"]');
    if (btnReset) btnReset.disabled = !canManageUsers;

    // Botones eliminar en tabla general
    document.querySelectorAll('.btn-danger[data-id]').forEach(btn => {
        btn.disabled = !canWrite;
    });
}

// ============================================
// BINDINGS
// ============================================

function bindSidebar() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => cambiarPestana(btn.dataset.pestana));
    });

    // Get both toggle buttons (mobile top + desktop sidebar footer)
    const toggleMobile = elements.btnSidebarToggle;
    const toggleDesktop = elements.btnSidebarToggleDesktop;

    function setupToggle(btn) {
        if (!btn) return;
        btn.addEventListener('click', () => {
            const sidebar = document.getElementById('app-sidebar');
            const isMobile = window.matchMedia('(max-width: 900px)').matches;

            if (isMobile) {
                // Mobile: open/close sidebar
                const isOpen = sidebar.classList.toggle('open');
                btn.setAttribute('aria-expanded', String(isOpen));
                const label = btn.querySelector('.sidebar-toggle-label');
                if (label) label.textContent = isOpen ? 'Ocultar menú' : 'Mostrar menú';
                document.body.classList.toggle('sidebar-open', isOpen);
            } else {
                // Desktop: collapse/expand sidebar
                const isCollapsed = sidebar.classList.toggle('collapsed');
                btn.setAttribute('aria-expanded', String(!isCollapsed));
                const label = btn.querySelector('.sidebar-toggle-label');
                if (label) label.textContent = isCollapsed ? 'Mostrar menú' : 'Ocultar menú';
            }
        });
    }

    setupToggle(toggleMobile);
    setupToggle(toggleDesktop);

    // Show/hide desktop toggle based on screen size
    function updateToggleVisibility() {
        const isMobile = window.matchMedia('(max-width: 900px)').matches;
        if (toggleDesktop) {
            toggleDesktop.style.display = isMobile ? 'none' : 'flex';
        }
    }
    updateToggleVisibility();
    window.addEventListener('resize', updateToggleVisibility);

    // Close sidebar on tab click (mobile only)
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const isMobile = window.matchMedia('(max-width: 900px)').matches;
            if (isMobile) {
                const sidebar = document.getElementById('app-sidebar');
                sidebar.classList.remove('open');
                document.body.classList.remove('sidebar-open');
                if (toggleMobile) {
                    toggleMobile.setAttribute('aria-expanded', 'false');
                    const label = toggleMobile.querySelector('.sidebar-toggle-label');
                    if (label) label.textContent = 'Mostrar menú';
                }
            }
        });
    });

    // ESC key to close sidebar (mobile) or collapse (desktop)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const sidebar = document.getElementById('app-sidebar');
            const isMobile = window.matchMedia('(max-width: 900px)').matches;

            if (isMobile && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                document.body.classList.remove('sidebar-open');
            } else if (!isMobile && !sidebar.classList.contains('collapsed')) {
                sidebar.classList.add('collapsed');
            }

            // Update both toggle buttons
            [toggleMobile, toggleDesktop].forEach(btn => {
                if (!btn) return;
                btn.setAttribute('aria-expanded', 'false');
                btn.focus();
                const label = btn.querySelector('.sidebar-toggle-label');
                if (label) label.textContent = isMobile ? 'Mostrar menú' : 'Mostrar menú';
            });
        }
    });

    // Handle window resize - reset mobile state
    window.addEventListener('resize', () => {
        const sidebar = document.getElementById('app-sidebar');
        const isMobile = window.matchMedia('(max-width: 900px)').matches;
        if (!isMobile) {
            sidebar.classList.remove('open');
            document.body.classList.remove('sidebar-open');
            [toggleMobile, toggleDesktop].forEach(btn => {
                if (!btn) return;
                btn.setAttribute('aria-expanded', sidebar.classList.contains('collapsed') ? 'false' : 'true');
                const label = btn.querySelector('.sidebar-toggle-label');
                if (label) label.textContent = sidebar.classList.contains('collapsed') ? 'Mostrar menú' : 'Ocultar menú';
            });
        }
        updateToggleVisibility();
    });
}

function bindLogout() {
    if (elements.btnLogout) {
        elements.btnLogout.addEventListener('click', async () => {
            await signOut(auth);
            window.location.replace('index.html');
        });
    }
}

function bindDayButtons() {
    document.querySelectorAll('[data-day]').forEach((button) => {
        button.addEventListener('click', () => agregarBloque(button.dataset.day));
    });
}

function bindFormEfectivo() {
    if (!elements.formEfectivo) return;

    elements.formEfectivo.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!puede(state.userRole, 'escribirEfectivos')) {
            mostrarNotificacion('Sin permisos para crear efectivos', 'error');
            return;
        }

        const nombre = document.getElementById('nombre').value.trim();
        const legajo = document.getElementById('legajo').value.trim();
        const cargo = document.getElementById('cargo').value.trim();
        const escalafon = document.getElementById('escalafon').value;

        if (!nombre || !legajo || !cargo) {
            mostrarNotificacion('Completá nombre, legajo y cargo.', 'error');
            return;
        }
        if (!ESCALAFONES.includes(escalafon)) {
            mostrarNotificacion('Escalafón inválido.', 'error');
            return;
        }

        try {
            await addDoc(collection(db, 'efectivos'), { nombre, legajo, cargo, escalafon });
            elements.formEfectivo.reset();
            await cargarDatosDashboard();
            mostrarNotificacion('Efectivo guardado con éxito');
        } catch (error) {
            console.error('Error al guardar efectivo:', error);
            mostrarNotificacion('Hubo un error al guardar el efectivo.', 'error');
        }
    });
}

function bindFormHorario() {
    if (!elements.formHorario) return;

    elements.formHorario.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!puede(state.userRole, 'escribirHorarios')) {
            mostrarNotificacion('Sin permisos para guardar horarios', 'error');
            return;
        }

        const efectivoId = elements.selectEfectivo.value;
        const fechaInicioValue = document.getElementById('semana').value;

        if (!efectivoId) { mostrarNotificacion('Seleccioná un efectivo.', 'error'); return; }
        if (!fechaInicioValue) { mostrarNotificacion('Seleccioná una fecha de inicio de semana.', 'error'); return; }

        const [anio, mes, dia] = fechaInicioValue.split('-').map(Number);
        const fechaInicio = new Date(anio, mes - 1, dia);
        if (fechaInicio.getDay() !== 0) { mostrarNotificacion('La fecha de inicio debe ser domingo.', 'error'); return; }

        const fechaFin = new Date(fechaInicio);
        fechaFin.setDate(fechaInicio.getDate() + 6);

        const bloquesGuardados = [];
        DIAS_SEMANA.forEach((diaNombre) => {
            const contenedor = document.getElementById(`lista-${diaNombre}`);
            if (!contenedor) return;
            contenedor.querySelectorAll('.block-item').forEach((item) => {
                bloquesGuardados.push({
                    dia: diaNombre,
                    tipo: item.querySelector('.tipo-hora').value,
                    entrada: item.querySelector('.hora-entrada').value,
                    salida: item.querySelector('.hora-salida').value
                });
            });
        });

        const escalafon = state.efectivosMap[efectivoId]?.escalafon || 'General';
        const validation = validarHorarioCompleto(
            bloquesGuardados,
            escalafon,
            Object.values(state.horariosMap),
            efectivoId,
            state.bancoCoresMensualTotal
        );
        if (!validation.ok) {
            mostrarNotificacion(validation.error, 'error');
            return;
        }

        const payload = {
            efectivoId,
            fechaInicio: fechaFormato(fechaInicio),
            fechaFin: fechaFormato(fechaFin),
            semana: semanaTexto(fechaFormato(fechaInicio), fechaFormato(fechaFin)),
            bloques: bloquesGuardados
        };

        try {
            const horarioActual = state.horariosMap[efectivoId];
            if (horarioActual?.docId) {
                await setDoc(doc(db, 'horarios', horarioActual.docId), payload);
                mostrarNotificacion('Horario actualizado correctamente');
            } else {
                await addDoc(collection(db, 'horarios'), payload);
                mostrarNotificacion('Horario guardado correctamente');
            }

            elements.formHorario.reset();
            limpiarContenedoresDias();
            await cargarDatosDashboard();
        } catch (error) {
            console.error('Error guardando horario:', error);
            mostrarNotificacion('No se pudo guardar el horario.', 'error');
        }
    });
}

function bindSelectEfectivo() {
    if (!elements.selectEfectivo) return;

    elements.selectEfectivo.addEventListener('change', (event) => {
        const id = event.target.value;
        limpiarContenedoresDias();
        const semana = document.getElementById('semana');
        if (semana) semana.value = '';
        if (!id) return;

        const horarioActual = state.horariosMap[id];
        if (!horarioActual) return;

        if (semana && horarioActual.fechaInicio) semana.value = horarioActual.fechaInicio;
        (horarioActual.bloques || []).forEach((bloque) => {
            agregarBloque(bloque.dia, bloque.tipo, bloque.entrada, bloque.salida);
        });
    });
}

// ============================================
// RENDER: TABLA GENERAL (INICIO) — CON SELECTOR DE SEMANA
// ============================================

function renderGeneralTable() {
    if (!elements.tablaGeneral) return;
    elements.tablaGeneral.innerHTML = '';

    if (!Object.keys(state.efectivosMap).length) {
        elements.tablaGeneral.innerHTML = '<tr><td colspan="13" class="empty-row">No hay efectivos cargados.</td></tr>';
        return;
    }

    // Semana seleccionada (domingo inicio)
    const semanaSeleccionada = elements.semanaSelector?.value;
    let fechaInicioSel = null, fechaFinSel = null;
    if (semanaSeleccionada) {
        fechaInicioSel = semanaSeleccionada;
        const [a, m, d] = semanaSeleccionada.split('-').map(Number);
        const fin = new Date(a, m - 1, d);
        fin.setDate(fin.getDate() + 6);
        fechaFinSel = fin.toISOString().split('T')[0];
    }

    Object.entries(state.efectivosMap).forEach(([id, efectivo]) => {
        const horario = state.horariosMap[id] || { bloques: [] };

        let bloquesAMostrar = horario.bloques || [];
        if (fechaInicioSel && fechaFinSel && horario.fechaInicio && horario.fechaFin) {
            // Mostrar solo si el horario coincide con la semana seleccionada
            if (horario.fechaInicio !== fechaInicioSel) {
                bloquesAMostrar = [];
            }
        }

        const totalHoras = calcularHorasTotales(bloquesAMostrar);
        const bloquesPorDia = agruparBloquesPorDia(bloquesAMostrar);

        const obtenerDiaHTML = (diaNombre) => {
            const bloquesDia = bloquesPorDia[diaNombre] || [];
            if (!bloquesDia.length) return '<span class="franco">Franco</span>';

            return bloquesDia.map((bloque) => {
                const color = COLORES_TIPO[bloque.tipo] || '#0284c7';
                return `<div class="mini-pill" style="background:${color};">${bloque.tipo}: ${bloque.entrada}-${bloque.salida}</div>`;
            }).join('');
        };

        const fila = document.createElement('tr');
        const puedeEliminar = puede(state.userRole, 'escribirEfectivos');
        fila.innerHTML = `
            <td><strong>${efectivo.nombre}</strong></td>
            <td>${efectivo.legajo}</td>
            <td>${efectivo.cargo}</td>
            <td><span class="pill">${efectivo.escalafon || '-'}</span></td>
            <td>${obtenerDiaHTML('domingo')}</td>
            <td>${obtenerDiaHTML('lunes')}</td>
            <td>${obtenerDiaHTML('martes')}</td>
            <td>${obtenerDiaHTML('miercoles')}</td>
            <td>${obtenerDiaHTML('jueves')}</td>
            <td>${obtenerDiaHTML('viernes')}</td>
            <td>${obtenerDiaHTML('sabado')}</td>
            <td><strong class="hours-blue">${totalHoras} hs</strong></td>
            <td>${puedeEliminar ? `<button type="button" class="btn-danger" data-id="${id}">Eliminar</button>` : '<span class="sin-permiso">—</span>'}</td>
        `;

        if (puedeEliminar) {
            fila.querySelector('.btn-danger').addEventListener('click', () => eliminarEfectivo(id));
        }
        elements.tablaGeneral.appendChild(fila);
    });
}

// ============================================
// RENDER: MÉTRICAS
// ============================================

function renderMetricas() {
    const total = Object.keys(state.efectivosMap).length;
    const totalVacaciones = Object.values(state.efectivosMap).filter((ef) => ef.estado === 'Vacaciones').length;
    const diaHoy = DIAS_SEMANA[new Date().getDay()];
    const activosHoy = Object.entries(state.horariosMap).filter(([id, horario]) => {
        if (!horario.bloques) return false;
        return horario.bloques.some((bloque) => bloque.dia === diaHoy);
    }).length;

    const elTotal = document.getElementById('stat-total-efectivos');
    const elVac = document.getElementById('stat-vacaciones');
    const elAct = document.getElementById('stat-activos-hoy');
    if (elTotal) elTotal.textContent = String(total);
    if (elVac) elVac.textContent = String(totalVacaciones);
    if (elAct) elAct.textContent = String(activosHoy);

    const badge = document.getElementById('fecha-hoy-badge');
    if (badge) badge.textContent = `Fecha: ${new Date().toLocaleDateString()}`;
}

// ============================================
// RENDER: BANCO CORES
// ============================================

function renderBancoCores() {
    const totalConsumidas = Object.values(state.horariosMap).reduce((total, horario) => {
        if (!horario.bloques) return total;
        return total + calcularHorasCores(horario.bloques);
    }, 0);

    const restantes = state.bancoCoresMensualTotal - totalConsumidas;

    const elTotal = document.getElementById('card-total-cores');
    const elCons = document.getElementById('card-consumidas-cores');
    const elRest = document.getElementById('card-restantes-cores');
    if (elTotal) elTotal.textContent = `${state.bancoCoresMensualTotal} hs`;
    if (elCons) elCons.textContent = `${totalConsumidas} hs`;
    if (elRest) {
        elRest.textContent = `${restantes} hs`;
        elRest.style.color = restantes < 0 ? '#fca5a5' : '#4ade80';
    }

    const input = document.getElementById('input-banco-cores-total');
    if (input && document.activeElement !== input) input.value = String(state.bancoCoresMensualTotal);

    const detalle = document.getElementById('tabla-detalle-cores');
    if (!detalle) return;
    detalle.innerHTML = '';

    let hayRegistros = false;
    Object.entries(state.horariosMap).forEach(([idEfectivo, horario]) => {
        const efectivo = state.efectivosMap[idEfectivo];
        if (!horario.bloques) return;

        const bloquesCores = horario.bloques.filter((b) => b.tipo === 'CORES');
        if (!bloquesCores.length) return;
        hayRegistros = true;

        bloquesCores.forEach((bloque) => {
            const total = calcularHorasTotales([bloque]);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${efectivo?.nombre || 'Sin nombre'}</strong></td>
                <td>${efectivo?.legajo || 'S/D'}</td>
                <td><span class="pill">${efectivo?.escalafon || '-'}</span></td>
                <td>${horario.semana || 'Sin especificar'}</td>
                <td><span>${bloque.dia}</span> (${bloque.entrada} a ${bloque.salida})</td>
                <td><strong style="color:#fbbf24;">${total} hs</strong></td>
            `;
            detalle.appendChild(row);
        });
    });

    if (!hayRegistros) {
        detalle.innerHTML = '<tr><td colspan="6" class="empty-row">No hay horas CORES asignadas todavía.</td></tr>';
    }
}

// ============================================
// PRESENTISMO — DOS VISTAS: GRILLA 24H / PLANILLA
// ============================================

let vistaPresentismo = 'grilla';

function setVistaPresentismo(vista) {
    vistaPresentismo = vista;
    if (elements.btnVistaPlanilla) {
        elements.btnVistaPlanilla.classList.toggle('active', vista === 'planilla');
        elements.btnVistaPlanilla.setAttribute('aria-pressed', vista === 'planilla');
    }
    if (elements.btnVistaGrilla) {
        elements.btnVistaGrilla.classList.toggle('active', vista === 'grilla');
        elements.btnVistaGrilla.setAttribute('aria-pressed', vista === 'grilla');
    }
    cargarPresentismoDiario();
}

async function cargarPresentismoDiario() {
    if (!elements.inputFechaPresentismo || !elements.theadPresentismo || !elements.tablaPresentismo) return;

    const fechaSeleccionada = elements.inputFechaPresentismo.value;
    if (!fechaSeleccionada) return;

    if (vistaPresentismo === 'planilla') {
        renderPresentismoPlanilla(fechaSeleccionada);
    } else {
        renderPresentismoGrilla(fechaSeleccionada);
    }
}

function renderPresentismoGrilla(fecha) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const fechaObj = new Date(anio, mes - 1, dia);
    const diaKey = DIAS_SEMANA[fechaObj.getDay()];

    let header = '<tr><th>Efectivo</th><th>Legajo</th><th>Cargo</th><th>Escalafón</th>';
    for (let hora = 0; hora < 24; hora++) {
        header += `<th>${String(hora).padStart(2, '0')}:00</th>`;
    }
    header += '<th>Estado</th></tr>';
    elements.theadPresentismo.innerHTML = header;

    elements.tablaPresentismo.innerHTML = '';

    Object.entries(state.efectivosMap).forEach(([id, efectivo]) => {
        const horario = state.horariosMap[id];
        const horasPorTurno = Array(24).fill('');
        let activo = false;

        if (horario && horario.bloques) {
            horario.bloques.filter((b) => b.dia === diaKey).forEach((bloque) => {
                activo = true;
                const ini = parseInt(bloque.entrada.split(':')[0], 10);
                const fin = parseInt(bloque.salida.split(':')[0], 10);
                for (let h = ini; h < fin; h++) horasPorTurno[h] = bloque.tipo;
            });
        }

        const cells = horasPorTurno.map((tipo) => {
            if (!tipo) return '<td class="cell-empty">-</td>';
            const color = COLORES_TIPO[tipo] || '#0284c7';
            const label = ETIQUETAS_TIPO[tipo] || 'Serv';
            return `<td class="cell-filled" style="background:${color};">${label}</td>`;
        }).join('');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${efectivo.nombre}</strong></td>
            <td>${efectivo.legajo}</td>
            <td>${efectivo.cargo}</td>
            <td><span class="pill">${efectivo.escalafon || '-'}</span></td>
            ${cells}
            <td><span class="status ${activo ? 'status-active' : 'status-franco'}">${activo ? 'Activo' : 'Franco'}</span></td>
        `;
        elements.tablaPresentismo.appendChild(row);
    });
}

function renderPresentismoPlanilla(fecha) {
    const rows = generarPlanillaDiaria(state.efectivosMap, state.horariosMap, fecha);

    const header = `
        <tr>
            <th>Efectivo</th>
            <th>Legajo</th>
            <th>Cargo</th>
            <th>Escalafón</th>
            <th>Día</th>
            <th>Horario Ordinario</th>
            <th>Hs Ord.</th>
            <th>CORES</th>
            <th>Hs CORES</th>
            <th>Total Hs</th>
            <th>Estado</th>
        </tr>
    `;
    elements.theadPresentismo.innerHTML = header;

    elements.tablaPresentismo.innerHTML = '';

    rows.forEach(row => {
        const ordinario = row.rangos.filter(r => r.tipo === 'Servicio' || r.tipo === 'Cátedra');
        const cores = row.rangos.filter(r => r.tipo === 'CORES');

        const ordStr = ordinario.map(r => `${r.inicio}–${r.fin} (${r.tipo})`).join('; ') || '—';
        const coresStr = cores.map(r => `${r.inicio}–${r.fin}`).join('; ') || '—';
        const ordHs = ordinario.reduce((s, r) => s + r.horas, 0);
        const coresHs = cores.reduce((s, r) => s + r.horas, 0);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${row.efectivo.nombre}</strong></td>
            <td>${row.efectivo.legajo}</td>
            <td>${row.efectivo.cargo}</td>
            <td><span class="pill">${row.efectivo.escalafon || '-'}</span></td>
            <td>${row.dia}</td>
            <td>${ordStr}</td>
            <td>${ordHs > 0 ? `<strong>${ordHs}h</strong>` : '—'}</td>
            <td>${coresStr}</td>
            <td>${coresHs > 0 ? `<strong style="color:#fbbf24;">${coresHs}h</strong>` : '—'}</td>
            <td><strong>${row.totalHoras}h</strong></td>
            <td><span class="status ${row.totalHoras > 0 ? 'status-active' : 'status-franco'}">${row.totalHoras > 0 ? 'Activo' : 'Franco'}</span></td>
        `;
        elements.tablaPresentismo.appendChild(tr);
    });
}

// ============================================
// EXPORTACIÓN XLSX — DELEGADA A xlsx-export.js (usa plantilla real)
// ============================================

// La exportación la maneja js/xlsx-export.js usando la plantilla PRESENTISMO BLANCO.xlsx
// y la lógica de negocio (generarPlanillaDiaria + convertirAPlanillaXlsx).
// Aquí solo exponemos el estado para que xlsx-export.js pueda acceder a él.
window.stateDashboard = state;

// ============================================
// BANCO CORES CONFIG
// ============================================

async function cargarBancoCoresConfiguracion() {
    try {
        const snapshot = await getDocs(collection(db, 'config'));
        const configDoc = snapshot.docs.find((d) => d.id === 'bancoCoresMensual');
        if (configDoc) {
            const totalHoras = Number(configDoc.data().totalHoras);
            if (!Number.isNaN(totalHoras) && totalHoras >= 0) state.bancoCoresMensualTotal = totalHoras;
        }
    } catch (error) {
        console.warn('No se pudo cargar la configuración de CORES:', error);
    }
}

async function guardarBancoCoresMensual(event) {
    event.preventDefault();
    if (!puede(state.userRole, 'escribirConfig')) {
        mostrarNotificacion('Solo administradores pueden cambiar el cupo CORES', 'error');
        return;
    }

    const input = document.getElementById('input-banco-cores-total');
    if (!input) return;

    const valor = Number.parseInt(input.value, 10);
    if (Number.isNaN(valor) || valor < 0) {
        mostrarNotificacion('Ingrese un valor válido.', 'error');
        return;
    }

    try {
        await setDoc(doc(db, 'config', 'bancoCoresMensual'), {
            totalHoras: valor,
            updatedAt: new Date().toISOString()
        });
        state.bancoCoresMensualTotal = valor;
        mostrarNotificacion(`Banco CORES actualizado a ${valor} hs.`);
        renderBancoCores();
    } catch (error) {
        console.error('Error guardando configuración de CORES:', error);
        mostrarNotificacion('No se pudo guardar el cupo de CORES.', 'error');
    }
}

async function limpiarHorasCoresHuerfanas() {
    if (!puede(state.userRole, 'gestionarUsuarios')) {
        mostrarNotificacion('Solo administradores pueden resetear CORES', 'error');
        return;
    }

    const confirmar = confirm('¿Deseas resetear TODOS los horarios y borrar el consumo de CORES?');
    if (!confirmar) return;

    try {
        const snap = await getDocs(collection(db, 'horarios'));
        await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, 'horarios', d.id))));
        mostrarNotificacion('Registros de CORES reseteados.');
        await cargarDatosDashboard();
    } catch (error) {
        console.error('Error limpiando CORES:', error);
        mostrarNotificacion('No se pudieron resetear los datos.', 'error');
    }
}

// ============================================
// ELIMINAR EFECTIVO (CON LIMPIEZA HORARIO)
// ============================================

async function eliminarEfectivo(id) {
    const puedeElim = puede(state.userRole, 'escribirEfectivos');
    if (!puedeElim) {
        mostrarNotificacion('Sin permisos para eliminar efectivos', 'error');
        return;
    }

    const confirmar = confirm('¿Seguro que quieres eliminar este efectivo? Esto también borrará su horario y horas CORES asociadas.');
    if (!confirmar) return;

    try {
        const horario = state.horariosMap[id];
        if (horario?.docId) await deleteDoc(doc(db, 'horarios', horario.docId));
        await deleteDoc(doc(db, 'efectivos', id));
        await cargarDatosDashboard();
        mostrarNotificacion('Efectivo y su horario eliminados correctamente');
    } catch (error) {
        console.error('Error eliminando efectivo:', error);
        mostrarNotificacion('No se pudo eliminar el efectivo.', 'error');
    }
}

// ============================================
// CARGA PRINCIPAL
// ============================================

async function cargarDatosDashboard() {
    try {
        await cargarBancoCoresConfiguracion();

        const [snapEfectivos, snapHorarios] = await Promise.all([
            getDocs(collection(db, 'efectivos')),
            getDocs(collection(db, 'horarios'))
        ]);

        if (elements.selectEfectivo) {
            elements.selectEfectivo.innerHTML = '<option value="">Seleccione un efectivo</option>';
        }

        state.efectivosMap = {};
        snapEfectivos.forEach((docSnap) => {
            state.efectivosMap[docSnap.id] = docSnap.data();
            if (elements.selectEfectivo) {
                const opt = document.createElement('option');
                opt.value = docSnap.id;
                opt.textContent = `${docSnap.data().nombre} (Legajo: ${docSnap.data().legajo})`;
                elements.selectEfectivo.appendChild(opt);
            }
        });

        state.horariosMap = {};
        snapHorarios.forEach((docSnap) => {
            const data = docSnap.data();
            state.horariosMap[data.efectivoId] = { docId: docSnap.id, ...data };
        });

        renderBancoCores();
        renderMetricas();
        renderGeneralTable();
        await cargarPresentismoDiario();
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        if (elements.tablaGeneral) {
            elements.tablaGeneral.innerHTML = '<tr><td colspan="13" class="empty-row error-row">Error al cargar los datos.</td></tr>';
        }
    }
}

// ============================================
// EXPORTS GLOBALES (para onclick inline en HTML)
// ============================================

window.cambiarPestana = cambiarPestana;
window.agregarBloque = agregarBloque;
window.guardarBancoCoresMensual = guardarBancoCoresMensual;
window.limpiarHorasCoresHuerfanas = limpiarHorasCoresHuerfanas;

// ============================================
// INIT
// ============================================

bindSidebar();
bindDayButtons();
bindFormEfectivo();
bindFormHorario();
bindSelectEfectivo();
bindLogout();
setupAuthListener();

if (elements.inputFechaPresentismo) {
    elements.inputFechaPresentismo.addEventListener('change', cargarPresentismoDiario);
}

window.addEventListener('load', () => {
    const input = document.getElementById('semana');
    if (input) input.value = new Date().toISOString().split('T')[0];
});

if (document.querySelector('.tab-btn.active')) {
    cambiarPestana('inicio');
}

export {};