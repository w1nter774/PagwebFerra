function actualizarDiaEnPantalla(lista) {
    const tarjeta = lista.closest('.day-card');
    if (!tarjeta) return;

    const bloques = [...lista.querySelectorAll('.block-item')];
    const entradas = bloques.map((bloque) => {
        const tipo = bloque.querySelector('.tipo-hora').value;
        const entrada = bloque.querySelector('.hora-entrada').value;
        const salida = bloque.querySelector('.hora-salida').value;
        const inicio = Number.parseInt(entrada.split(':')[0], 10);
        const fin = Number.parseInt(salida.split(':')[0], 10);

        bloque.classList.toggle('type-cores', tipo === 'CORES');
        bloque.classList.toggle('type-catedra', tipo === 'Cátedra');

        return { tipo, entrada, salida, inicio, fin };
    });

    const horas = entradas.reduce((total, bloque) => {
        const duracion = bloque.fin - bloque.inicio;
        return total + (duracion < 0 ? duracion + 24 : duracion);
    }, 0);
    const resumen = tarjeta.querySelector('.day-summary');
    const vacio = tarjeta.querySelector('.day-empty');
    const conflicto = tarjeta.querySelector('.day-conflict');

    if (resumen) {
        resumen.textContent = entradas.length
            ? `${entradas.length} ${entradas.length === 1 ? 'bloque' : 'bloques'} · ${horas} h`
            : 'Sin bloques';
    }
    if (vacio) vacio.hidden = entradas.length > 0;

    let mensajeConflicto = '';
    for (let i = 0; i < entradas.length && !mensajeConflicto; i += 1) {
        for (let j = i + 1; j < entradas.length; j += 1) {
            const primero = entradas[i];
            const segundo = entradas[j];
            if (Math.max(primero.inicio, segundo.inicio) < Math.min(primero.fin, segundo.fin)) {
                mensajeConflicto = `Hay superposición: ${primero.tipo} (${primero.entrada} a ${primero.salida}) con ${segundo.tipo} (${segundo.entrada} a ${segundo.salida}).`;
                break;
            }
        }
    }

    if (conflicto) {
        conflicto.textContent = mensajeConflicto;
        conflicto.hidden = !mensajeConflicto;
    }
}

document.querySelectorAll('.day-list').forEach((lista) => {
    const observarBloques = new MutationObserver(() => actualizarDiaEnPantalla(lista));
    observarBloques.observe(lista, { childList: true });
    actualizarDiaEnPantalla(lista);
});

document.addEventListener('change', (event) => {
    if (!(event.target instanceof Element)) return;
    const lista = event.target.closest('.day-list');
    if (lista) actualizarDiaEnPantalla(lista);
});