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

const state = {
    horariosMap: {},
    efectivosMap: {},
    bancoCoresMensualTotal: 150
};

const elements = {
    tablaGeneral: document.getElementById('tabla-general'),
    formEfectivo: document.getElementById('form-efectivo'),
    formHorario: document.getElementById('form-horario'),
    selectEfectivo: document.getElementById('select-efectivo'),
    inputFechaPresentismo: document.getElementById('fecha-presentismo'),
    tablaPresentismo: document.getElementById('tabla-presentismo'),
    theadPresentismo: document.getElementById('thead-presentismo'),
    btnLogout: document.getElementById('btn-logout')
};

function obtenerDuracionHoras(entrada, salida) {
    const inicio = Number.parseInt(entrada.split(':')[0], 10);
    const fin = Number.parseInt(salida.split(':')[0], 10);
    let diferencia = fin - inicio;
    if (diferencia < 0) diferencia += 24;
    return diferencia;
}

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
    const toast = document.createElement('div');
    toast.className = `toast ${tipo === 'error' ? 'error' : tipo === 'info' ? 'info' : ''}`.trim();
    toast.innerHTML = `<span>${tipo === 'error' ? '⚠️' : tipo === 'info' ? 'ℹ️' : '✅'}</span><span>${mensaje}</span>`;
    container.appendChild(toast);

    window.setTimeout(() => {
        toast.remove();
    }, 4000);
}

function limpiarContenedoresDias() {
    ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].forEach((dia) => {
        const contenedor = document.getElementById(`lista-${dia}`);
        if (contenedor) contenedor.innerHTML = '';
    });
}

function generarOpcionesHoras(seleccionada = '') {
    const options = [];
    for (let i = 0; i <= 24; i += 1) {
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

    bloque.querySelector('button').addEventListener('click', () => bloque.remove());
    contenedor.appendChild(bloque);
    contenedor.closest('.day-card')?.setAttribute('open', '');
    bloque.querySelector('.tipo-hora').focus();
}

function validarSuperposicion(bloques) {
    for (let i = 0; i < bloques.length; i += 1) {
        for (let j = i + 1; j < bloques.length; j += 1) {
            const a = bloques[i];
            const b = bloques[j];
            if (a.dia !== b.dia) continue;

            const aInicio = Number.parseInt(a.entrada.split(':')[0], 10);
            const aFin = Number.parseInt(a.salida.split(':')[0], 10);
            const bInicio = Number.parseInt(b.entrada.split(':')[0], 10);
            const bFin = Number.parseInt(b.salida.split(':')[0], 10);

            if (Math.max(aInicio, bInicio) < Math.min(aFin, bFin)) {
                return `Conflicto en ${a.dia.toUpperCase()}: ${a.tipo} (${a.entrada} a ${a.salida}) se superpone con ${b.tipo} (${b.entrada} a ${b.salida}).`;
            }
        }
    }

    return null;
}

function getHorasCoresDesdeBloques(bloques) {
    return (bloques || []).reduce((total, bloque) => {
        if (bloque.tipo !== 'CORES') return total;
        return total + obtenerDuracionHoras(bloque.entrada, bloque.salida);
    }, 0);
}

function getHorasTotalesDesdeBloques(bloques) {
    return (bloques || []).reduce((total, bloque) => total + obtenerDuracionHoras(bloque.entrada, bloque.salida), 0);
}

function bindSidebar() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => cambiarPestana(btn.dataset.pestana));
    });
}

function setupAuthListener() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.replace('index.html');
            return;
        }

        const userTag = document.getElementById('user-email');
        if (userTag) userTag.textContent = user.email || 'Usuario autenticado';

        const hoy = new Date().toISOString().split('T')[0];
        if (elements.inputFechaPresentismo) {
            elements.inputFechaPresentismo.value = hoy;
            elements.inputFechaPresentismo.addEventListener('change', cargarPresentismoDiario);
        }

        cargarDatosDashboard();
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
    document.querySelectorAll('.btn-small').forEach((button) => {
        button.addEventListener('click', () => agregarBloque(button.dataset.day));
    });
}

function bindFormEfectivo() {
    if (!elements.formEfectivo) return;

    elements.formEfectivo.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nombre = document.getElementById('nombre').value.trim();
        const legajo = document.getElementById('legajo').value.trim();
        const cargo = document.getElementById('cargo').value.trim();
        const escalafon = document.getElementById('escalafon').value;

        if (!nombre || !legajo || !cargo) {
            mostrarNotificacion('Completá nombre, legajo y cargo.', 'error');
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
        const efectivoId = elements.selectEfectivo.value;
        const fechaInicioValue = document.getElementById('semana').value;

        if (!efectivoId) {
            mostrarNotificacion('Seleccioná un efectivo.', 'error');
            return;
        }

        if (!fechaInicioValue) {
            mostrarNotificacion('Seleccioná una fecha de inicio de semana.', 'error');
            return;
        }

        const [anio, mes, dia] = fechaInicioValue.split('-');
        const fechaInicio = new Date(Number(anio), Number(mes) - 1, Number(dia));
        if (fechaInicio.getDay() !== 0) {
            mostrarNotificacion('La fecha de inicio debe ser domingo.', 'error');
            return;
        }

        const fechaFin = new Date(fechaInicio);
        fechaFin.setDate(fechaInicio.getDate() + 6);

        const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const bloquesGuardados = [];

        diasSemana.forEach((diaNombre) => {
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

        const conflicto = validarSuperposicion(bloquesGuardados);
        if (conflicto) {
            mostrarNotificacion(conflicto, 'error');
            return;
        }

        const escalafon = state.efectivosMap[efectivoId]?.escalafon;
        const horasCores = getHorasCoresDesdeBloques(bloquesGuardados);

        if (horasCores > 0) {
            if (!['Comando', 'Administrativo'].includes(escalafon)) {
                mostrarNotificacion(`El escalafón ${escalafon || 'sin asignar'} no puede registrar CORES.`, 'error');
                return;
            }

            const maxHoras = escalafon === 'Comando' ? 80 : 60;
            if (horasCores > maxHoras) {
                mostrarNotificacion(`Superás el máximo de ${maxHoras} hs de CORES para ${escalafon}.`, 'error');
                return;
            }
        }

        const totalCoresExistentes = Object.entries(state.horariosMap).reduce((total, [id, horario]) => {
            if (id === efectivoId || !horario.bloques) return total;
            const bloquesOtros = horario.bloques.filter((bloque) => bloque.dia && bloque.tipo === 'CORES');
            return total + getHorasCoresDesdeBloques(bloquesOtros);
        }, 0);

        const restantes = state.bancoCoresMensualTotal - totalCoresExistentes;
        if (horasCores > restantes) {
            mostrarNotificacion(`No hay suficiente cupo de CORES. Disponibles: ${restantes} hs.`, 'error');
            return;
        }

        const fechaFormato = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
        const formatoVisual = (fecha) => `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const semanaText = `Semana del ${formatoVisual(fechaInicio)} al ${formatoVisual(fechaFin)}`;

        const payload = {
            efectivoId,
            fechaInicio: fechaFormato(fechaInicio),
            fechaFin: fechaFormato(fechaFin),
            semana: semanaText,
            bloques: bloquesGuardados
        };

        try {
            const horarioActual = state.horariosMap[efectivoId];
            if (horarioActual && horarioActual.docId) {
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

function renderGeneralTable() {
    if (!elements.tablaGeneral) return;
    elements.tablaGeneral.innerHTML = '';

    if (!Object.keys(state.efectivosMap).length) {
        elements.tablaGeneral.innerHTML = '<tr><td colspan="13" class="empty-row">No hay efectivos cargados.</td></tr>';
        return;
    }

    Object.entries(state.efectivosMap).forEach(([id, efectivo]) => {
        const horario = state.horariosMap[id] || { bloques: [] };
        const totalHoras = getHorasTotalesDesdeBloques(horario.bloques || []);

        const obtenerDiaHTML = (diaNombre) => {
            const bloquesDia = (horario.bloques || []).filter((bloque) => bloque.dia === diaNombre);
            if (!bloquesDia.length) return '<span class="franco">Franco</span>';

            return bloquesDia.map((bloque) => {
                let color = '#0284c7';
                if (bloque.tipo === 'CORES') color = '#ea580c';
                if (bloque.tipo === 'Cátedra') color = '#16a34a';

                return `<div class="mini-pill" style="background:${color};">${bloque.tipo}: ${bloque.entrada}-${bloque.salida}</div>`;
            }).join('');
        };

        const fila = document.createElement('tr');
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
            <td><button type="button" class="btn-danger" data-id="${id}">Eliminar</button></td>
        `;

        fila.querySelector('.btn-danger').addEventListener('click', () => eliminarEfectivo(id));
        elements.tablaGeneral.appendChild(fila);
    });
}

function renderMetricas() {
    const total = Object.keys(state.efectivosMap).length;
    const totalVacaciones = Object.values(state.efectivosMap).filter((ef) => ef.estado === 'Vacaciones').length;
    const diaHoy = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][new Date().getDay()];
    const activosHoy = Object.entries(state.horariosMap).filter(([id, horario]) => {
        if (!horario.bloques) return false;
        return horario.bloques.some((bloque) => bloque.dia === diaHoy);
    }).length;

    document.getElementById('stat-total-efectivos').textContent = String(total);
    document.getElementById('stat-vacaciones').textContent = String(totalVacaciones);
    document.getElementById('stat-activos-hoy').textContent = String(activosHoy);

    const badge = document.getElementById('fecha-hoy-badge');
    if (badge) badge.textContent = `Fecha: ${new Date().toLocaleDateString()}`;
}

function renderBancoCores() {
    const totalConsumidas = Object.values(state.horariosMap).reduce((total, horario) => {
        if (!horario.bloques) return total;
        return total + getHorasCoresDesdeBloques(horario.bloques);
    }, 0);

    const restantes = state.bancoCoresMensualTotal - totalConsumidas;

    document.getElementById('card-total-cores').textContent = `${state.bancoCoresMensualTotal} hs`;
    document.getElementById('card-consumidas-cores').textContent = `${totalConsumidas} hs`;
    document.getElementById('card-restantes-cores').textContent = `${restantes} hs`;
    document.getElementById('card-restantes-cores').style.color = restantes < 0 ? '#fca5a5' : '#4ade80';
    const input = document.getElementById('input-banco-cores-total');
    if (input && document.activeElement !== input) input.value = String(state.bancoCoresMensualTotal);

    const detalle = document.getElementById('tabla-detalle-cores');
    if (!detalle) return;
    detalle.innerHTML = '';

    let registrosEncontrados = false;
    Object.entries(state.horariosMap).forEach(([idEfectivo, horario]) => {
        const efectivo = state.efectivosMap[idEfectivo];
        if (!horario.bloques) return;

        const bloquesCores = horario.bloques.filter((bloque) => bloque.tipo === 'CORES');
        if (!bloquesCores.length) return;
        registrosEncontrados = true;

        bloquesCores.forEach((bloque) => {
            const total = obtenerDuracionHoras(bloque.entrada, bloque.salida);
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

    if (!registrosEncontrados) {
        detalle.innerHTML = '<tr><td colspan="6" class="empty-row">No hay horas CORES asignadas todavía.</td></tr>';
    }
}

async function cargarBancoCoresConfiguracion() {
    try {
        const snapshot = await getDocs(collection(db, 'config'));
        const configDoc = snapshot.docs.find((docSnap) => docSnap.id === 'bancoCoresMensual');
        if (configDoc) {
            const totalHoras = Number(configDoc.data().totalHoras);
            if (!Number.isNaN(totalHoras) && totalHoras >= 0) {
                state.bancoCoresMensualTotal = totalHoras;
            }
        }
    } catch (error) {
        console.warn('No se pudo cargar la configuración de CORES:', error);
    }
}

async function cargarDatosDashboard() {
    try {
        await cargarBancoCoresConfiguracion();

        const snapEfectivos = await getDocs(collection(db, 'efectivos'));
        const snapHorarios = await getDocs(collection(db, 'horarios'));

        if (elements.selectEfectivo) {
            elements.selectEfectivo.innerHTML = '<option value="">Seleccione un efectivo</option>';
        }

        state.efectivosMap = {};
        snapEfectivos.forEach((docSnap) => {
            state.efectivosMap[docSnap.id] = docSnap.data();
            if (elements.selectEfectivo) {
                const option = document.createElement('option');
                option.value = docSnap.id;
                option.textContent = `${docSnap.data().nombre} (Legajo: ${docSnap.data().legajo})`;
                elements.selectEfectivo.appendChild(option);
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

async function cargarPresentismoDiario() {
    if (!elements.inputFechaPresentismo || !elements.theadPresentismo || !elements.tablaPresentismo) return;

    const fechaSeleccionada = elements.inputFechaPresentismo.value;
    if (!fechaSeleccionada) return;

    const diasSemanaMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const [anio, mes, dia] = fechaSeleccionada.split('-');
    const fechaObj = new Date(Number(anio), Number(mes) - 1, Number(dia));
    const diaKey = diasSemanaMap[fechaObj.getDay()];

    let header = '<tr><th>Efectivo</th><th>Legajo</th><th>Cargo</th><th>Escalafón</th>';
    for (let hora = 0; hora < 24; hora += 1) {
        header += `<th>${hora.toString().padStart(2, '0')}:00</th>`;
    }
    header += '<th>Estado</th></tr>';
    elements.theadPresentismo.innerHTML = header;

    elements.tablaPresentismo.innerHTML = '';

    Object.entries(state.efectivosMap).forEach(([id, efectivo]) => {
        const horario = state.horariosMap[id];
        const horasPorTurno = Array(24).fill('');
        let activo = false;

        if (horario && horario.bloques) {
            horario.bloques.filter((bloque) => bloque.dia === diaKey).forEach((bloque) => {
                activo = true;
                const inicio = Number.parseInt(bloque.entrada.split(':')[0], 10);
                const fin = Number.parseInt(bloque.salida.split(':')[0], 10);
                for (let hora = inicio; hora < fin; hora += 1) {
                    horasPorTurno[hora] = bloque.tipo;
                }
            });
        }

        const cells = horasPorTurno.map((tipo) => {
            if (!tipo) return '<td class="cell-empty">-</td>';

            let color = '#0284c7';
            let label = 'Serv';
            if (tipo === 'CORES') { color = '#ea580c'; label = 'Core'; }
            if (tipo === 'Cátedra') { color = '#16a34a'; label = 'Cat'; }

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

async function guardarBancoCoresMensual(event) {
    event.preventDefault();
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
    const confirmar = window.confirm('¿Deseas resetear todos los horarios y borrar el consumo de CORES?');
    if (!confirmar) return;

    try {
        const snap = await getDocs(collection(db, 'horarios'));
        await Promise.all(snap.docs.map((docSnap) => deleteDoc(doc(db, 'horarios', docSnap.id))));
        mostrarNotificacion('Registros de CORES reseteados.');
        await cargarDatosDashboard();
    } catch (error) {
        console.error('Error limpiando CORES:', error);
        mostrarNotificacion('No se pudieron resetear los datos.', 'error');
    }
}

async function eliminarEfectivo(id) {
    const confirmar = window.confirm('¿Seguro que quieres eliminar este efectivo?');
    if (!confirmar) return;

    try {
        await deleteDoc(doc(db, 'efectivos', id));
        await cargarDatosDashboard();
        mostrarNotificacion('Efectivo eliminado correctamente');
    } catch (error) {
        console.error('Error eliminando efectivo:', error);
        mostrarNotificacion('No se pudo eliminar el efectivo.', 'error');
    }
}

function exportarPresentismoExcel() {
    const fecha = elements.inputFechaPresentismo?.value || new Date().toISOString().split('T')[0];
    if (!fecha) return;

    const [anio, mes, dia] = fecha.split('-');
    const diasSemanaMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const fechaObj = new Date(Number(anio), Number(mes) - 1, Number(dia));
    const diaSemana = diasSemanaMap[fechaObj.getDay()];

    let html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8" />
            <style>
                table { border-collapse: collapse; font-family: Arial, sans-serif; }
                td, th { border: 1px solid #333; padding: 6px; text-align: center; }
                th { background: #0f172a; color: white; }
            </style>
        </head>
        <body>
        <table>
            <tr>
                <th colspan="7">Planilla de Presentismo - ${fecha}</th>
            </tr>
            <tr>
                <th>Efectivo</th>
                <th>Legajo</th>
                <th>Cargo</th>
                <th>Escalafón</th>
                <th>Día</th>
                <th>Horario</th>
                <th>Tipo</th>
            </tr>
    `;

    Object.entries(state.efectivosMap).forEach(([id, efectivo]) => {
        const horario = state.horariosMap[id];
        const bloques = (horario?.bloques || []).filter((bloque) => bloque.dia === diaSemana);

        if (!bloques.length) {
            html += `
                <tr>
                    <td>${efectivo.nombre}</td>
                    <td>${efectivo.legajo}</td>
                    <td>${efectivo.cargo}</td>
                    <td>${efectivo.escalafon || '-'}</td>
                    <td>${diaSemana}</td>
                    <td>Franco</td>
                    <td>Sin turno</td>
                </tr>
            `;
            return;
        }

        bloques.forEach((bloque) => {
            html += `
                <tr>
                    <td>${efectivo.nombre}</td>
                    <td>${efectivo.legajo}</td>
                    <td>${efectivo.cargo}</td>
                    <td>${efectivo.escalafon || '-'}</td>
                    <td>${bloque.dia}</td>
                    <td>${bloque.entrada} - ${bloque.salida}</td>
                    <td>${bloque.tipo}</td>
                </tr>
            `;
        });
    });

    html += '</table></body></html>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `presentismo-${fecha}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

window.cambiarPestana = cambiarPestana;
window.agregarBloque = agregarBloque;
window.guardarBancoCoresMensual = guardarBancoCoresMensual;
window.limpiarHorasCoresHuerfanas = limpiarHorasCoresHuerfanas;
window.exportarPresentismoExcel = exportarPresentismoExcel;

bindSidebar();
bindDayButtons();
bindFormEfectivo();
bindFormHorario();
bindSelectEfectivo();
bindLogout();
setupAuthListener();

const fechaInput = document.getElementById('fecha-presentismo');
if (fechaInput) fechaInput.addEventListener('change', cargarPresentismoDiario);

window.addEventListener('load', () => {
    const input = document.getElementById('semana');
    if (input) input.value = new Date().toISOString().split('T')[0];
});

if (document.querySelector('.tab-btn.active')) {
    cambiarPestana('inicio');
}

export {};
