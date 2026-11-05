const exportButton = document.getElementById('btn-exportar-presentismo');
const TEMPLATE_URL = new URL('../PRESENTISMO BLANCO.xlsx', import.meta.url);
const TEMPLATE_FIRST_DATA_ROW = 6;
const TEMPLATE_LAST_DATA_ROW = 31;
const TEMPLATE_COLUMNS = {
    order: 0,
    rank: 2,
    escalafon: 3,
    legajo: 4,
    nombre: 5,
    ordinaryEntry: 6,
    ordinaryExit: 8,
    ordinaryHours: 10,
    coresEntry: 11,
    coresExit: 13,
    coresHours: 15
};

if (exportButton) {
    exportButton.addEventListener('click', exportarPresentismoPlantilla);
}

async function exportarPresentismoPlantilla() {
    const sheetJs = window.XLSX;
    const table = document.querySelector('#content-presentismo table');
    const date = document.getElementById('fecha-presentismo')?.value || new Date().toISOString().slice(0, 10);

    if (!sheetJs?.read || !sheetJs?.write || !sheetJs?.utils) {
        window.alert('No se pudo cargar SheetJS. Comprueba tu conexión y recarga la página.');
        return;
    }

    if (!table || !table.tHead?.rows.length) {
        window.alert('La tabla de presentismo aún no está lista. Espera a que carguen los datos.');
        return;
    }

    const records = Array.from(table.tBodies[0]?.rows || [])
        .map(convertirFilaPresentismo)
        .filter(Boolean);
    const capacity = TEMPLATE_LAST_DATA_ROW - TEMPLATE_FIRST_DATA_ROW + 1;

    if (records.length > capacity) {
        window.alert(`La plantilla tiene espacio para ${capacity} efectivos, pero hay ${records.length}. No se exportó para evitar omitir datos.`);
        return;
    }

    exportButton.disabled = true;
    const originalText = exportButton.textContent;
    exportButton.textContent = 'Preparando archivo…';

    try {
        const response = await fetch(TEMPLATE_URL.href, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`No se pudo descargar la plantilla (${response.status}). Ruta: ${TEMPLATE_URL.pathname}`);
        }

        const templateBytes = await response.arrayBuffer();
        if (!templateBytes.byteLength) throw new Error('El archivo de plantilla está vacío.');

        let workbook;
        try {
            workbook = sheetJs.read(templateBytes, { type: 'array' });
        } catch (error) {
            throw new Error(`SheetJS no pudo abrir la plantilla: ${error.message}`);
        }

        const sheetName = workbook.SheetNames?.[0];
        const sheet = sheetName ? workbook.Sheets[sheetName] : null;
        if (!sheet) throw new Error('La plantilla no contiene una primera hoja válida.');

        completarFechaEncabezado(sheet, date, sheetJs);
        records.forEach((record, index) => {
            const row = TEMPLATE_FIRST_DATA_ROW - 1 + index;
            writeCell(sheet, row, TEMPLATE_COLUMNS.order, index + 1, sheetJs);
            writeCell(sheet, row, TEMPLATE_COLUMNS.rank, record.cargo, sheetJs);
            writeCell(sheet, row, TEMPLATE_COLUMNS.escalafon, record.escalafon, sheetJs);
            writeCell(sheet, row, TEMPLATE_COLUMNS.legajo, record.legajo, sheetJs);
            writeCell(sheet, row, TEMPLATE_COLUMNS.nombre, record.nombre, sheetJs);
            writeCell(sheet, row, TEMPLATE_COLUMNS.ordinaryEntry, record.ordinaryEntry, sheetJs);
            writeCell(sheet, row, TEMPLATE_COLUMNS.ordinaryExit, record.ordinaryExit, sheetJs);
            writeCell(sheet, row, TEMPLATE_COLUMNS.ordinaryHours, record.ordinaryHours || '', sheetJs);
            writeCell(sheet, row, TEMPLATE_COLUMNS.coresEntry, record.coresEntry, sheetJs);
            writeCell(sheet, row, TEMPLATE_COLUMNS.coresExit, record.coresExit, sheetJs);
            writeCell(sheet, row, TEMPLATE_COLUMNS.coresHours, record.coresHours || '', sheetJs);
        });

        // Serialize first, then create the download explicitly. This avoids
        // browser-specific failures in XLSX.writeFile's download helper.
        const output = sheetJs.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([output], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `PLANILLA_PRESENTISMO_${date}.xlsx`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
        console.error('Error al generar la planilla XLSX:', error);
        window.alert(`No se pudo generar el archivo Excel. ${error?.message || 'Error inesperado.'}`);
    } finally {
        exportButton.disabled = false;
        exportButton.textContent = originalText;
    }
}

function convertirFilaPresentismo(row) {
    const cells = Array.from(row.cells);
    if (cells.length < 29 || row.querySelector('[colspan]')) return null;

    const hours = cells.slice(4, 28).map((cell) => cell.innerText.trim().toLowerCase());
    const esServicio = (label) => label === 'serv' || label === 'serv.';
    const esCatedra = (label) => label === 'cat' || label === 'cat.';
    const esCores = (label) => label === 'core' || label === 'cores';
    const ordinaryHours = hours.reduce((sum, label) => sum + (esServicio(label) || esCatedra(label) ? 1 : 0), 0);
    const coresHours = hours.reduce((sum, label) => sum + (esCores(label) ? 1 : 0), 0);
    const ordinaryRange = getTimeRange(hours, (label) => esServicio(label) || esCatedra(label));
    const coresRange = getTimeRange(hours, esCores);

    return {
        nombre: cells[0].innerText.trim(),
        legajo: cells[1].innerText.trim(),
        cargo: cells[2].innerText.trim(),
        escalafon: cells[3].innerText.trim(),
        ordinaryEntry: ordinaryRange.start,
        ordinaryExit: ordinaryRange.end,
        ordinaryHours,
        coresEntry: coresRange.start,
        coresExit: coresRange.end,
        coresHours
    };
}

function getTimeRange(hours, matches) {
    const indexes = [];
    hours.forEach((label, index) => {
        if (matches(label)) indexes.push(index);
    });

    if (!indexes.length) return { start: '', end: '' };
    return {
        start: formatHour(indexes[0]),
        end: formatHour(indexes[indexes.length - 1] + 1)
    };
}

function formatHour(hour) {
    return `${String(hour).padStart(2, '0')}:00`;
}

function writeCell(sheet, row, column, value, sheetJs) {
    const address = sheetJs.utils.encode_cell({ r: row, c: column });
    const existingCell = sheet[address] || {};
    existingCell.v = value;
    existingCell.t = typeof value === 'number' ? 'n' : 's';
    sheet[address] = existingCell;
}

function completarFechaEncabezado(sheet, date, sheetJs) {
    const [year, month, day] = date.split('-');
    if (!year || !month || !day) return;

    const dateText = `${day}/${month}/${year}`;
    const monthText = new Date(Number(year), Number(month) - 1, 1)
        .toLocaleDateString('es-AR', { month: 'long' });
    const range = sheet['!ref']
        ? sheetJs.utils.decode_range(sheet['!ref'])
        : { s: { r: 0, c: 0 }, e: { r: 40, c: 15 } };

    for (let row = range.s.r; row <= Math.min(range.e.r, 40); row += 1) {
        for (let column = range.s.c; column <= Math.min(range.e.c, 15); column += 1) {
            const cell = sheet[sheetJs.utils.encode_cell({ r: row, c: column })];
            if (!cell || typeof cell.v !== 'string') continue;

            const normalized = cell.v.trim().toUpperCase();
            if (/^FECHA\s*:?$/.test(normalized)) cell.v = `FECHA: ${dateText}`;
            if (/^MES\s*:?$/.test(normalized)) cell.v = `MES: ${monthText}`;
            if (/^AÑO\s*:?$|^ANO\s*:?$/.test(normalized)) cell.v = `AÑO: ${year}`;
        }
    }
}
