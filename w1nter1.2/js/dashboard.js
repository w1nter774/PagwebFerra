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

const tablaGeneral = document.getElementById('tabla-general');
const formEfectivo = document.getElementById('form-efectivo');
const formHorario = document.getElementById('form-horario');
const selectEfectivo = document.getElementById('select-efectivo');
const inputFechaPresentismo = document.getElementById('fecha-presentismo');
const tablaPresentismo = document.getElementById('tabla-presentismo');
const theadPresentismo = document.getElementById('thead-presentismo');

let horariosMapGlobal = {};
let efectivosMapGlobal = {};
let bancoCoresMensualTotal = 150; // Valor por defecto inicial

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        const userTag = document.getElementById('user-email');
        if (userTag) userTag.textContent = user.email;
        
        const hoy = new Date().toISOString().split('T')[0];
        if (inputFechaPresentismo) {
            inputFechaPresentismo.value = hoy;
            inputFechaPresentismo.addEventListener('change', cargarPresentismoDiario);
        }

        cargarDatosDashboard();
    }
});

const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'index.html';
    });
}

window.cambiarPestana = function(nombrePestana) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const contenido = document.getElementById(`content-${nombrePestana}`);
    if (contenido) contenido.classList.add('active');

    event && event.currentTarget && event.currentTarget.classList.add('active');
};

function mostrarNotificacion(mensaje, tipo = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    
    if (tipo === 'error') {
        toast.style.backgroundColor = '#7f1d1d';
        toast.style.borderColor = '#991b1b';
        toast.innerHTML = `<span>⚠️</span> <span>${mensaje}</span>`;
    } else {
        toast.style.backgroundColor = '#16a34a';
        toast.innerHTML = `<span>✅</span> <span>${mensaje}</span>`;
    }

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// Función global para actualizar manualmente el banco CORES desde su pestaña propia
window.guardarBancoCoresMensual = function(event) {
    event.preventDefault();
    const inputVal = document.getElementById('input-banco-cores-total');
    if (inputVal) {
        const nuevoValor = parseInt(inputVal.value);
        if (isNaN(nuevoValor) || nuevoValor < 0) {
            mostrarNotificacion('Por favor ingrese un número válido de horas.', 'error');
            return;
        }
        bancoCoresMensualTotal = nuevoValor;
        mostrarNotificacion(`Banco CORES mensual actualizado a ${bancoCoresMensualTotal} hs.`);
        cargarDatosDashboard();
    }
};

// Función para limpiar o resetear todas las horas CORES huérfanas / registros de horarios
window.limpiarHorasCoresHuerfanas = async function() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const confirmToast = document.createElement('div');
    confirmToast.className = 'toast';
    confirmToast.style.backgroundColor = '#1e293b';
    confirmToast.style.border = '1px solid #475569';
    confirmToast.style.flexDirection = 'column';
    confirmToast.style.alignItems = 'flex-start';
    confirmToast.style.gap = '8px';

    confirmToast.innerHTML = `
        <span style="font-weight: 600; color: #f8fafc;">¿Deseas limpiar/eliminar todos los registros de horarios para resetear el Banco CORES?</span>
        <div style="display: flex; gap: 8px; width: 100%; justify-content: flex-end;">
            <button id="btn-cancel-clean" style="background: #334155; color: #cbd5e1; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">Cancelar</button>
            <button id="btn-confirm-clean" style="background: #dc2626; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">Sí, limpiar todo</button>
        </div>
    `;

    container.appendChild(confirmToast);

    document.getElementById('btn-cancel-clean').addEventListener('click', () => {
        confirmToast.remove();
    });

    document.getElementById('btn-confirm-clean').addEventListener('click', async () => {
        confirmToast.remove();
        try {
            const snapHorarios = await getDocs(collection(db, "horarios"));
            const promesasBorrado = snapHorarios.docs.map(documento => deleteDoc(doc(db, "horarios", documento.id)));
            await Promise.all(promesasBorrado);

            cargarDatosDashboard();
            mostrarNotificacion('✅ Registros de horarios y horas CORES reseteados con éxito.');
        } catch (error) {
            console.error("Error al limpiar horarios: ", error);
            mostrarNotificacion('Hubo un error al intentar limpiar los registros.', 'error');
        }
    });
};

if (formEfectivo) {
    formEfectivo.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('nombre').value.trim();
        const legajo = document.getElementById('legajo').value.trim();
        const cargo = document.getElementById('cargo').value.trim();
        const escalafon = document.getElementById('escalafon').value;

        try {
            await addDoc(collection(db, "efectivos"), { 
                nombre, 
                legajo, 
                cargo, 
                escalafon
            });
            formEfectivo.reset();
            cargarDatosDashboard();
            mostrarNotificacion('Efectivo guardado con éxito');
        } catch (error) {
            console.error("Error al guardar efectivo: ", error);
            mostrarNotificacion('Hubo un error al guardar.', 'error');
        }
    });
}

function generarOpcionesHoras(seleccionada = '') {
    let html = '';
    for (let i = 0; i <= 24; i++) {
        let horaStr = i < 10 ? `0${i}:00` : `${i}:00`;
        let selected = (horaStr === seleccionada) ? 'selected' : '';
        html += `<option value="${horaStr}" ${selected}>${horaStr} hs</option>`;
    }
    return html;
}

window.agregarBloque = function(dia, tipo = 'Servicio', entrada = '08:00', salida = '16:00') {
    const contenedor = document.getElementById(`lista-${dia}`);
    if (!contenedor) return;

    const div = document.createElement('div');
    div.className = 'bloque-horario';

    div.innerHTML = `
        <select class="tipo-hora">
            <option value="Servicio" ${tipo === 'Servicio' ? 'selected' : ''}>Servicio</option>
            <option value="CORES" ${tipo === 'CORES' ? 'selected' : ''}>CORES</option>
            <option value="Cátedra" ${tipo === 'Cátedra' ? 'selected' : ''}>Cátedra</option>
        </select>
        <select class="hora-entrada">
            ${generarOpcionesHoras(entrada)}
        </select>
        <select class="hora-salida">
            ${generarOpcionesHoras(salida)}
        </select>
        <button type="button" onclick="this.parentElement.remove()">✕</button>
    `;

    contenedor.appendChild(div);
};

function limpiarContenedoresDias() {
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    dias.forEach(d => {
        const cont = document.getElementById(`lista-${d}`);
        if (cont) cont.innerHTML = '';
    });
}

if (selectEfectivo) {
    selectEfectivo.addEventListener('change', (e) => {
        const efectivoId = e.target.value;
        limpiarContenedoresDias();
        const semanaInput = document.getElementById('semana');
        if (semanaInput) semanaInput.value = '';

        if (!efectivoId) return;

        const horarioExistente = horariosMapGlobal[efectivoId];
        if (horarioExistente) {
            if (horarioExistente.fechaInicio && semanaInput) {
                semanaInput.value = horarioExistente.fechaInicio;
            }
            if (horarioExistente.bloques && Array.isArray(horarioExistente.bloques)) {
                horarioExistente.bloques.forEach(b => {
                    window.agregarBloque(b.dia, b.tipo, b.entrada, b.salida);
                });
            }
        }
    });
}

function validarSuperposicion(bloques) {
    const convertirAHora = (str) => parseInt(str.split(':')[0]);

    for (let i = 0; i < bloques.length; i++) {
        for (let j = i + 1; j < bloques.length; j++) {
            const b1 = bloques[i];
            const b2 = bloques[j];

            if (b1.dia === b2.dia) {
                const ent1 = convertirAHora(b1.entrada);
                const sal1 = convertirAHora(b1.salida);
                const ent2 = convertirAHora(b2.entrada);
                const sal2 = convertirAHora(b2.salida);

                if (Math.max(ent1, ent2) < Math.min(sal1, sal2)) {
                    return `Conflicto el día ${b1.dia.toUpperCase()}: El bloque ${b1.tipo} (${b1.entrada} a ${b1.salida}) se superpone con ${b2.tipo} (${b2.entrada} a ${b2.salida}).`;
                }
            }
        }
    }
    return null;
}

if (formHorario) {
    formHorario.addEventListener('submit', async (e) => {
        e.preventDefault();
        const efectivoId = selectEfectivo.value;
        const fechaInput = document.getElementById('semana').value;

        if (!efectivoId) {
            mostrarNotificacion('Por favor seleccione un efectivo.', 'error');
            return;
        }

        const [anio, mes, dia] = fechaInput.split('-');
        const fInicio = new Date(anio, mes - 1, dia);

        if (fInicio.getDay() !== 0) {
            mostrarNotificacion('La fecha de inicio de semana debe ser un DÍA DOMINGO.', 'error');
            return;
        }

        const fFin = new Date(fInicio);
        fFin.setDate(fInicio.getDate() + 6);

        const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        let listaBloquesGuardar = [];

        dias.forEach(diaKey => {
            const contenedor = document.getElementById(`lista-${diaKey}`);
            if (!contenedor) return;
            const bloquesDOM = contenedor.querySelectorAll('.bloque-horario');

            bloquesDOM.forEach(b => {
                listaBloquesGuardar.push({
                    dia: diaKey,
                    tipo: b.querySelector('.tipo-hora').value,
                    entrada: b.querySelector('.hora-entrada').value,
                    salida: b.querySelector('.hora-salida').value
                });
            });
        });

        const errorSuperposicion = validarSuperposicion(listaBloquesGuardar);
        if (errorSuperposicion) {
            mostrarNotificacion(errorSuperposicion, 'error');
            return;
        }

        const efectivoInfo = efectivosMapGlobal[efectivoId];
        if (efectivoInfo) {
            const escalafon = efectivoInfo.escalafon;
            
            let horasCoresSemanaEfectivo = 0;
            listaBloquesGuardar.forEach(b => {
                if (b.tipo === 'CORES') {
                    const ent = parseInt(b.entrada.split(':')[0]);
                    const sal = parseInt(b.salida.split(':')[0]);
                    let diff = sal - ent;
                    if (diff < 0) diff += 24;
                    horasCoresSemanaEfectivo += diff;
                }
            });

            if (horasCoresSemanaEfectivo > 0) {
                if (escalafon !== 'Comando' && escalafon !== 'Administrativo') {
                    mostrarNotificacion(`⚠️ El escalafón "${escalafon}" no tiene permitido realizar horas CORES.`, 'error');
                    return;
                }

                const limiteMaxIndividual = escalafon === 'Comando' ? 80 : 60;
                if (horasCoresSemanaEfectivo > limiteMaxIndividual) {
                    mostrarNotificacion(`⚠️ Excede el límite de ${limiteMaxIndividual} hs CORES para el escalafón ${escalafon}.`, 'error');
                    return;
                }
            }
        }

        let horasCoresNuevaAsignacion = 0;
        listaBloquesGuardar.forEach(b => {
            if (b.tipo === 'CORES') {
                const ent = parseInt(b.entrada.split(':')[0]);
                const sal = parseInt(b.salida.split(':')[0]);
                let diff = sal - ent;
                if (diff < 0) diff += 24;
                horasCoresNuevaAsignacion += diff;
            }
        });

        let totalCoresYaAsignadasGlobales = 0;
        Object.entries(horariosMapGlobal).forEach(([idEf, hData]) => {
            if (idEf === efectivoId) return; 
            let bloquesAContar = hData.bloques || [];
            bloquesAContar.forEach(b => {
                if (b.tipo === 'CORES') {
                    const ent = parseInt(b.entrada.split(':')[0]);
                    const sal = parseInt(b.salida.split(':')[0]);
                    let diff = sal - ent;
                    if (diff < 0) diff += 24;
                    totalCoresYaAsignadasGlobales += diff;
                }
            });
        });

        const coresRestantesGlobales = bancoCoresMensualTotal - totalCoresYaAsignadasGlobales;

        if (horasCoresNuevaAsignacion > coresRestantesGlobales) {
            mostrarNotificacion(`⚠️ No hay suficiente Banco CORES mensual. Solicitadas: ${horasCoresNuevaAsignacion} hs, Disponibles: ${coresRestantesGlobales} hs.`, 'error');
            return;
        }

        const formatoFechaStr = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
        const formatoVisual = (f) => `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}`;
        
        const semanaFormateada = `Semana del ${formatoVisual(fInicio)} al ${formatoVisual(fFin)}`;

        try {
            const horarioAnterior = horariosMapGlobal[efectivoId];
            const datosAguardar = {
                efectivoId,
                fechaInicio: formatoFechaStr(fInicio),
                fechaFin: formatoFechaStr(fFin),
                semana: semanaFormateada,
                bloques: listaBloquesGuardar
            };

            if (horarioAnterior && horarioAnterior.docId) {
                await setDoc(doc(db, "horarios", horarioAnterior.docId), datosAguardar);
                mostrarNotificacion('Horarios actualizados y banco CORES descontado con éxito');
            } else {
                await addDoc(collection(db, "horarios"), datosAguardar);
                mostrarNotificacion('Horarios guardados y banco CORES descontado con éxito');
            }

            formHorario.reset();
            limpiarContenedoresDias();
            cargarDatosDashboard();
        } catch (error) {
            console.error("Error al guardar:", error);
            mostrarNotificacion('Hubo un error al guardar los horarios.', 'error');
        }
    });
}

async function cargarDatosDashboard() {
    try {
        const snapEfectivos = await getDocs(collection(db, "efectivos"));
        const snapHorarios = await getDocs(collection(db, "horarios"));

        if (selectEfectivo) {
            selectEfectivo.innerHTML = "<option value=''>Seleccione un efectivo</option>";
        }
        
        efectivosMapGlobal = {};
        snapEfectivos.forEach(docSnap => {
            efectivosMapGlobal[docSnap.id] = docSnap.data();
            if (selectEfectivo) {
                const opt = document.createElement('option');
                opt.value = docSnap.id;
                opt.textContent = `${docSnap.data().nombre} (Legajo: ${docSnap.data().legajo})`;
                selectEfectivo.appendChild(opt);
            }
        });

        horariosMapGlobal = {};
        snapHorarios.forEach(docSnap => {
            const h = docSnap.data();
            horariosMapGlobal[h.efectivoId] = { docId: docSnap.id, ...h };
        });

        let totalCoresConsumidasGlobal = 0;
        Object.values(horariosMapGlobal).forEach(hor => {
            if (hor.bloques && Array.isArray(hor.bloques)) {
                hor.bloques.forEach(b => {
                    if (b.tipo === 'CORES') {
                        const ent = parseInt(b.entrada.split(':')[0]);
                        const sal = parseInt(b.salida.split(':')[0]);
                        let diff = sal - ent;
                        if (diff < 0) diff += 24;
                        totalCoresConsumidasGlobal += diff;
                    }
                });
            }
        });

        const coresRestantesGlobal = bancoCoresMensualTotal - totalCoresConsumidasGlobal;

        actualizarVistaTabBancoCores(bancoCoresMensualTotal, totalCoresConsumidasGlobal, coresRestantesGlobal);

        actualizarMetricasDashboard(snapEfectivos);

        if (tablaGeneral) {
            tablaGeneral.innerHTML = "";

            if (snapEfectivos.empty) {
                tablaGeneral.innerHTML = "<tr><td colspan='13' style='text-align: center;'>No hay efectivos cargados.</td></tr>";
                cargarPresentismoDiario();
                return;
            }

            snapEfectivos.forEach(docSnap => {
                const ef = docSnap.data();
                const id = docSnap.id;
                const hor = horariosMapGlobal[id] || { semana: 'No asignada', bloques: [] };

                let horasPorTipo = { 'Servicio': 0, 'CORES': 0, 'Cátedra': 0 };

                (hor.bloques || []).forEach(b => {
                    const ent = parseInt(b.entrada.split(':')[0]);
                    const sal = parseInt(b.salida.split(':')[0]);
                    let diff = sal - ent;
                    if (diff < 0) diff += 24;

                    if (horasPorTipo[b.tipo] !== undefined) {
                        horasPorTipo[b.tipo] += diff;
                    } else {
                        horasPorTipo['Servicio'] += diff;
                    }
                });

                const totalHoras = horasPorTipo['Servicio'] + horasPorTipo['CORES'] + horasPorTipo['Cátedra'];
                
                const obtenerHTMLDia = (diaNombre) => {
                    const bloquesDia = (hor.bloques || []).filter(b => b.dia === diaNombre);
                    if (bloquesDia.length === 0) return '<span style="color: #64748b; font-size: 12px;">Franco</span>';

                    return bloquesDia.map(b => {
                        let colorBg = '#0284c7'; let colorText = '#ffffff';
                        if (b.tipo === 'CORES') { colorBg = '#ea580c'; colorText = '#ffffff'; }
                        if (b.tipo === 'Cátedra') { colorBg = '#16a34a'; colorText = '#ffffff'; }

                        return `<div style="background: ${colorBg}; color: ${colorText}; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 3px; white-space: nowrap;">
                            ${b.tipo}: ${b.entrada}-${b.salida}
                        </div>`;
                    }).join('');
                };

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${ef.nombre}</strong></td>
                    <td>${ef.legajo}</td>
                    <td>${ef.cargo}</td>
                    <td><span style="background: #334155; color: #38bdf8; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">${ef.escalafon || '-'}</span></td>
                    <td>${obtenerHTMLDia('domingo')}</td>
                    <td>${obtenerHTMLDia('lunes')}</td>
                    <td>${obtenerHTMLDia('martes')}</td>
                    <td>${obtenerHTMLDia('miercoles')}</td>
                    <td>${obtenerHTMLDia('jueves')}</td>
                    <td>${obtenerHTMLDia('viernes')}</td>
                    <td>${obtenerHTMLDia('sabado')}</td>
                    <td><strong style="color: #38bdf8;">${totalHoras} hs</strong></td>
                    <td>
                        <button class="btn-danger" onclick="window.eliminarEfectivo('${id}')">Eliminar</button>
                    </td>
                `;
                tablaGeneral.appendChild(tr);
            });
        }

        cargarPresentismoDiario();

    } catch (error) {
        console.error("Error al cargar datos: ", error);
        if (tablaGeneral) {
            tablaGeneral.innerHTML = "<tr><td colspan='13' style='color: red; text-align: center;'>Error al cargar datos.</td></tr>";
        }
    }
}

function actualizarVistaTabBancoCores(total, consumidas, restantes) {
    const elTotal = document.getElementById('card-total-cores');
    const elConsumidas = document.getElementById('card-consumidas-cores');
    const elRestantes = document.getElementById('card-restantes-cores');
    const inputTotal = document.getElementById('input-banco-cores-total');
    const tablaDetalle = document.getElementById('tabla-detalle-cores');

    if (elTotal) elTotal.textContent = `${total} hs`;
    if (elConsumidas) elConsumidas.textContent = `${consumidas} hs`;
    if (elRestantes) {
        elRestantes.textContent = `${restantes} hs`;
        elRestantes.style.color = restantes < 0 ? '#ef4444' : '#16a34a';
    }
    if (inputTotal && document.activeElement !== inputTotal) {
        inputTotal.value = total;
    }

    if (tablaDetalle) {
        tablaDetalle.innerHTML = '';
        let registrosEncontrados = false;

        Object.entries(horariosMapGlobal).forEach(([idEf, hor]) => {
            const ef = efectivosMapGlobal[idEf];
            if (!hor.bloques) return;

            const bloquesCores = hor.bloques.filter(b => b.tipo === 'CORES');
            if (bloquesCores.length === 0) return;

            registrosEncontrados = true;

            bloquesCores.forEach(b => {
                const ent = parseInt(b.entrada.split(':')[0]);
                const sal = parseInt(b.salida.split(':')[0]);
                let diff = sal - ent;
                if (diff < 0) diff += 24;

                const nombreEfectivo = ef ? ef.nombre : `Efectivo ID (Sin registro: ${idEf.substring(0,6)}...)`;
                const legajoEfectivo = ef ? ef.legajo : 'S/D';
                const escalafonEfectivo = ef ? (ef.escalafon || '-') : 'S/D';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${nombreEfectivo}</strong></td>
                    <td>${legajoEfectivo}</td>
                    <td><span style="background: #334155; color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${escalafonEfectivo}</span></td>
                    <td>${hor.semana || 'Sin especificar'}</td>
                    <td><span style="text-transform: capitalize;">${b.dia}</span> (${b.entrada} a ${b.salida})</td>
                    <td><strong style="color: #ea580c;">${diff} hs</strong></td>
                `;
                tablaDetalle.appendChild(tr);
            });
        });

        if (!registrosEncontrados) {
            tablaDetalle.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 15px;">No hay horas CORES asignadas actualmente a ningún efectivo.</td></tr>`;
        }
    }
}

function actualizarMetricasDashboard(snapEfectivos) {
    const totalEfectivos = snapEfectivos.size;
    const elTotal = document.getElementById('stat-total-efectivos');
    const elVacaciones = document.getElementById('stat-vacaciones');
    const elActivosHoy = document.getElementById('stat-activos-hoy');
    const badgeFecha = document.getElementById('fecha-hoy-badge');

    if (elTotal) elTotal.textContent = totalEfectivos;

    let totalVacaciones = 0;
    snapEfectivos.forEach(docSnap => {
        const data = docSnap.data();
        if (data.estado === 'Vacaciones') totalVacaciones++;
    });
    if (elVacaciones) elVacaciones.textContent = totalVacaciones;

    const diasSemanaMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaHoyKey = diasSemanaMap[new Date().getDay()];
    
    let activosHoy = 0;
    snapEfectivos.forEach(docSnap => {
        const id = docSnap.id;
        const hor = horariosMapGlobal[id];
        if (hor && hor.bloques) {
            const tieneTurno = hor.bloques.some(b => b.dia === diaHoyKey);
            if (tieneTurno) activosHoy++;
        }
    });
    if (elActivosHoy) elActivosHoy.textContent = activosHoy;

    if (badgeFecha) {
        badgeFecha.textContent = `Fecha: ${new Date().toLocaleDateString()}`;
    }
}

async function cargarPresentismoDiario() {
    if (!inputFechaPresentismo || !tablaPresentismo || !theadPresentismo) return;

    const fechaSeleccionada = inputFechaPresentismo.value;
    if (!fechaSeleccionada) return;

    const diasSemanaMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const [anio, mes, dia] = fechaSeleccionada.split('-');
    const fechaObj = new Date(anio, mes - 1, dia);
    const nombreDiaKey = diasSemanaMap[fechaObj.getDay()];

    let headerHTML = `
        <tr>
            <th>Efectivo</th>
            <th>Legajo</th>
            <th>Cargo</th>
            <th>Escalafón</th>`;
    
    for (let h = 0; h < 24; h++) {
        let horaStr = h < 10 ? `0${h}:00` : `${h}:00`;
        headerHTML += `<th style="text-align: center; min-width: 55px;">${horaStr}</th>`;
    }
    headerHTML += `<th>Estado</th></tr>`;
    theadPresentismo.innerHTML = headerHTML;

    try {
        const snapEfectivos = await getDocs(collection(db, "efectivos"));
        
        let horariosMap = {};
        for (const [efId, hData] of Object.entries(horariosMapGlobal)) {
            if (hData.fechaInicio && hData.fechaFin) {
                if (fechaSeleccionada >= hData.fechaInicio && fechaSeleccionada <= hData.fechaFin) {
                    horariosMap[efId] = hData;
                }
            } else {
                horariosMap[efId] = hData;
            }
        }

        tablaPresentismo.innerHTML = "";

        if (snapEfectivos.empty) {
            tablaPresentismo.innerHTML = "<tr><td colspan='29' style='text-align: center; padding: 20px;'>No hay efectivos cargados.</td></tr>";
            return;
        }

        snapEfectivos.forEach(docSnap => {
            const ef = docSnap.data();
            const id = docSnap.id;
            const hor = horariosMap[id];

            let horasArray = new Array(24).fill('');
            let tieneTurnoHoy = false;

            if (hor && hor.bloques) {
                const bloquesHoy = hor.bloques.filter(b => b.dia === nombreDiaKey);
                bloquesHoy.forEach(b => {
                    tieneTurnoHoy = true;
                    const ent = parseInt(b.entrada.split(':')[0]);
                    const sal = parseInt(b.salida.split(':')[0]);
                    
                    for (let h = ent; h < sal; h++) {
                        if (h >= 0 && h < 24) {
                            horasArray[h] = b.tipo;
                        }
                    }
                });
            }

            let badgeEstado = tieneTurnoHoy 
                ? `<span style="background: #16a34a; color: #ffffff; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">Activo</span>` 
                : `<span style="background: #334155; color: #94a3b8; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">Franco</span>`;

            let celdasHorasHTML = '';
            for (let h = 0; h < 24; h++) {
                const tipo = horasArray[h];
                if (tipo) {
                    let bg = '#0284c7', color = '#ffffff', etiqueta = 'Serv.';
                    if (tipo === 'CORES') { bg = '#ea580c'; color = '#ffffff'; etiqueta = 'Core'; }
                    if (tipo === 'Cátedra') { bg = '#16a34a'; color = '#ffffff'; etiqueta = 'Cat.'; }
                    
                    celdasHorasHTML += `<td style="background: ${bg}; color: ${color}; text-align: center; font-size: 10px; font-weight: bold;" title="${tipo} (${h}:00 hs)">${etiqueta}</td>`;
                } else {
                    celdasHorasHTML += `<td style="color: #475569; text-align: center; font-size: 10px;">-</td>`;
                }
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${ef.nombre}</strong></td>
                <td>${ef.legajo}</td>
                <td>${ef.cargo}</td>
                <td><span style="background: #334155; color: #38bdf8; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">${ef.escalafon || '-'}</span></td>
                ${celdasHorasHTML}
                <td>${badgeEstado}</td>
            `;
            tablaPresentismo.appendChild(tr);
        });

    } catch (error) {
        console.error("Error al cargar presentismo:", error);
        tablaPresentismo.innerHTML = "<tr><td colspan='29' style='color: red; text-align: center;'>Error al cargar el presentismo diario.</td></tr>";
    }
}

window.exportarPresentismoExcel = function() {
    const fechaInputVal = inputFechaPresentismo ? inputFechaPresentismo.value : new Date().toISOString().split('T')[0];
    const [anio, mes, dia] = fechaInputVal.split('-');
    
    const diasSemanaMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const fechaObj = new Date(anio, mes - 1, dia);
    const nombreDiaKey = diasSemanaMap[fechaObj.getDay()];

    const snapEfectivosList = Object.keys(efectivosMapGlobal);

    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head><meta charset="utf-8">';
    html += '<!--[if gte mso 9]><xml>';
    html += '<x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>';
    html += '<x:Name>Planilla Presentismo</x:Name>';
    html += '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>';
    html += '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>';
    html += '</xml><![endif]-->';
    html += '<style>';
    html += 'table { border-collapse: collapse; margin: 0 auto; }';
    html += 'td { padding: 5px; text-align: center; vertical-align: middle; height: 24px; font-family: Arial, sans-serif; font-size: 9pt; }';
    html += '.text-left { text-align: left; }';
    html += '.bold { font-weight: bold; }';
    html += '.header-azul { background-color: #1e3a8a; color: #ffffff; font-weight: bold; font-size: 11pt; border-bottom: 2px solid #1d4ed8; }';
    html += '</style></head><body>';
    
    html += '<table>';
    html += '<tr style="height: 28px;">';
    html += `<td colspan="6" class="text-left header-azul">ESCUELA JUAN VUCETICH SEDE MAR DEL PLATA</td>`;
    html += `<td colspan="4" class="bold">FECHA: ${dia}</td>`;
    html += `<td colspan="3" class="bold">MES: ${mes}</td>`;
    html += `<td colspan="2" class="bold">AÑO: ${anio}</td>`;
    html += `<td style="background-color: #1e3a8a;"><button onclick="window.enviarCorreoPresentismo('${fechaInputVal}')" style="background:#3b82f6; color:white; border:none; padding:4px 8px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:8pt;">📧 Enviar</button></td>`;
    html += '</tr>';

    html += '<tr style="height: 24px;">';
    html += '<td rowspan="2" class="bold">Nro.<br>de<br>Orden</td>';
    html += '<td rowspan="2" class="bold">Libro de<br>Guardia<br>Folio</td>';
    html += '<td colspan="4" class="bold" style="font-size: 10pt;">PLANILLA DE PRESENTISMO</td>';
    html += '<td colspan="4" class="bold" style="font-size: 10pt;">SERVICIO ORDINARIO</td>';
    html += '<td rowspan="2" class="bold">Total Hs.<br>Ordinaria</td>';
    html += '<td colspan="5" class="bold" style="font-size: 10pt;">HORARIO DE CORES</td>';
    html += '</tr>';

    html += '<tr style="height: 24px;">';
    html += '<td class="bold">JERARQUIA</td>';
    html += '<td class="bold">SUBESCALAFÓN</td>';
    html += '<td class="bold">LEGAJO</td>';
    html += '<td class="bold">APELLIDO Y NOMBRE</td>';
    html += '<td class="bold">HORARIO<br>ENTRADA</td>';
    html += '<td class="bold">FIRMA</td>';
    html += '<td class="bold">HORARIO<br>SALIDA</td>';
    html += '<td class="bold">FIRMA</td>';
    html += '<td class="bold">HORARIO<br>INICIA</td>';
    html += '<td class="bold">FIRMA</td>';
    html += '<td class="bold">HORARIO<br>FINALIZA</td>';
    html += '<td class="bold">FIRMA</td>';
    html += '<td class="bold">Total Hs.<br>Co.Re.S.</td>';
    html += '</tr>';

    let rowIndex = 1;
    if (snapEfectivosList && snapEfectivosList.length > 0) {
        snapEfectivosList.forEach((id) => {
            const ef = efectivosMapGlobal[id];
            const hor = horariosMapGlobal[id];

            let entradaOrd = "-";
            let salidaOrd = "-";
            let totalHsOrd = 0;

            let iniciaCores = "-";
            let finalizaCores = "-";
            let totalHsCores = 0;

            if (hor && hor.bloques) {
                const bloquesHoy = hor.bloques.filter(b => b.dia === nombreDiaKey);
                
                const bloquesOrd = bloquesHoy.filter(b => b.tipo === 'Servicio' || b.tipo === 'Cátedra');
                if (bloquesOrd.length > 0) {
                    const entradas = bloquesOrd.map(b => b.entrada);
                    const salidas = bloquesOrd.map(b => b.salida);
                    
                    entradaOrd = entradas.sort()[0];
                    salidaOrd = salidas.sort().reverse()[0];

                    bloquesOrd.forEach(b => {
                        const ent = parseInt(b.entrada.split(':')[0]);
                        const sal = parseInt(b.salida.split(':')[0]);
                        let diff = sal - ent;
                        if (diff < 0) diff += 24;
                        totalHsOrd += diff;
                    });
                }

                const bloquesCores = bloquesHoy.filter(b => b.tipo === 'CORES');
                if (bloquesCores.length > 0) {
                    const entradasC = bloquesCores.map(b => b.entrada);
                    const salidasC = bloquesCores.map(b => b.salida);

                    iniciaCores = entradasC.sort()[0];
                    finalizaCores = salidasC.sort().reverse()[0];

                    bloquesCores.forEach(b => {
                        const ent = parseInt(b.entrada.split(':')[0]);
                        const sal = parseInt(b.salida.split(':')[0]);
                        let diff = sal - ent;
                        if (diff < 0) diff += 24;
                        totalHsCores += diff;
                    });
                }
            }

            html += '<tr style="height: 24px;">';
            html += `<td>${rowIndex++}</td>`;
            html += `<td>&nbsp;</td>`;
            html += `<td>${ef.cargo || '&nbsp;'}</td>`;
            html += `<td>${ef.escalafon || '&nbsp;'}</td>`;
            html += `<td>${ef.legajo || '&nbsp;'}</td>`;
            html += `<td class="text-left bold">${ef.nombre || '&nbsp;'}</td>`;
            
            html += `<td>${entradaOrd !== '-' ? entradaOrd : '&nbsp;'}</td>`;
            html += `<td>&nbsp;</td>`;
            html += `<td>${salidaOrd !== '-' ? salidaOrd : '&nbsp;'}</td>`;
            html += `<td>&nbsp;</td>`;
            html += `<td class="bold">${totalHsOrd > 0 ? totalHsOrd + ' hs' : '&nbsp;'}</td>`;

            html += `<td>${iniciaCores !== '-' ? iniciaCores : '&nbsp;'}</td>`;
            html += `<td>&nbsp;</td>`;
            html += `<td>${finalizaCores !== '-' ? finalizaCores : '&nbsp;'}</td>`;
            html += `<td>&nbsp;</td>`;
            html += `<td class="bold">${totalHsCores > 0 ? totalHsCores + ' hs' : '&nbsp;'}</td>`;
            html += '</tr>';
        });
    }

    while (rowIndex <= 20) {
        html += '<tr style="height: 24px;">';
        html += `<td>${rowIndex++}</td>`;
        for (let c = 1; c < 16; c++) {
            html += `<td>&nbsp;</td>`;
        }
        html += '</tr>';
    }

    html += '</table></body></html>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `PLANILLA_PRESENTISMO_${fechaInputVal}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.enviarCorreoPresentismo = function(fecha) {
    const asunto = encodeURIComponent(`Planilla de Presentismo - Escuela Juan Vucetich (${fecha})`);
    const cuerpo = encodeURIComponent(`Estimados,\n\nAdjunto/Se remite la planilla de presentismo correspondiente a la fecha ${fecha}.\n\nSaludos institucionales.`);
    window.location.href = `mailto:?subject=${asunto}&body=${cuerpo}`;
};

window.eliminarEfectivo = async function(id) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const confirmToast = document.createElement('div');
    confirmToast.className = 'toast';
    confirmToast.style.backgroundColor = '#1e293b';
    confirmToast.style.border = '1px solid #475569';
    confirmToast.style.flexDirection = 'column';
    confirmToast.style.alignItems = 'flex-start';
    confirmToast.style.gap = '8px';

    confirmToast.innerHTML = `
        <span style="font-weight: 600; color: #f8fafc;">¿Estás seguro de eliminar este efectivo?</span>
        <div style="display: flex; gap: 8px; width: 100%; justify-content: flex-end;">
            <button id="btn-cancel-del" style="background: #334155; color: #cbd5e1; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">Cancelar</button>
            <button id="btn-confirm-del" style="background: #dc2626; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">Eliminar</button>
        </div>
    `;

    container.appendChild(confirmToast);

    document.getElementById('btn-cancel-del').addEventListener('click', () => {
        confirmToast.remove();
    });

    document.getElementById('btn-confirm-del').addEventListener('click', async () => {
        confirmToast.remove();
        try {
            await deleteDoc(doc(db, "efectivos", id));
            cargarDatosDashboard();
            mostrarNotificacion('Efectivo eliminado correctamente');
        } catch (error) {
            console.error("Error al eliminar: ", error);
            mostrarNotificacion('No se pudo eliminar el registro.', 'error');
        }
    });
};