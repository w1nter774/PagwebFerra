const exportButton = document.getElementById('btn-exportar-presentismo');
const TEMPLATE_URL = 'https://raw.githubusercontent.com/w1nter774/PagwebFerra/main/w1nter1.2/PRESENTISMO%20BLANCO.xlsx';
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

    if (!sheetJs?.read || !sheetJs?.writeFile || !sheetJs?.utils) {
        window.alert('No se pudo cargar la biblioteca Excel. Recarga la página y comprueba tu conexión.');
        return;
    }

    if (!table || !table.tHead?.rows.length) {
        window.alert('La tabla de presentismo aún no está lista. Espera a que carguen los datos.');
        return;
    }

    const visibleRows = Array.from(table.tBodies[0]?.rows || []);
    const records = visibleRows.map((row) => convertirFilaPresentismo(row)).filter(Boolean);
    const capacity = TEMPLATE_LAST_DATA_ROW - TEMPLATE_FIRST_DATA_ROW + 1;

    if (records.length > capacity) {
        window.alert(`La plantilla tiene espacio para ${capacity} efectivos, pero hay ${records.length}. No se exportó para evitar omitir datos.`);
        return;
    }

    exportButton.disabled = true;
    const originalText = exportButton.textContent;
    exportButton.textContent = 'Preparando archivo…';

    try {
        const response = await fetch(TEMPLATE_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`No se pudo descargar la plantilla (${response.status}).`);

        const templateBytes = await response.arrayBuffer();
        const workbook = sheetJs.read(templateBytes, { type: 'array', cellStyles: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) throw new Error('La plantilla no contiene una hoja válida.');

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

        sheetJs.writeFile(workbook, `PLANILLA_PRESENTISMO_${date}.xlsx`, { bookType: 'xlsx' });
    } catch (error) {
        console.error('Error al generar la planilla XLSX:', error);
        window.alert(`No se pudo generar el archivo Excel. ${error?.message || 'Revisa la conexión y vuelve a intentar.'}`);
    } finally {
        exportButton.disabled = false;
        exportButton.textContent = originalText;
    }
}

function convertirFilaPresentismo(row) {
    const cells = Array.from(row.cells);
    // Columns 0-3 are personnel; 4-27 are 24 hourly cells; 28 is status.
    if (cells.length < 29) return null;

    const hours = cells.slice(4, 28).map((cell) => cell.innerText.trim());
    const ordinaryHours = hours.reduce((sum, label) => sum + (label === 'Serv' || label === 'Cat' ? 1 : 0), 0);
    const coresHours = hours.reduce((sum, label) => sum + (label === 'Core' ? 1 : 0), 0);

    const ordinaryRange = getTimeRange(hours, (label) => label === 'Serv' || label === 'Cat');
    const coresRange = getTimeRange(hours, (label) => label === 'Core');

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
    if (hour === 24) return '24:00';
    return `${String(hour).padStart(2, '0')}:00`;
}

function writeCell(sheet, row, column, value, sheetJs) {
    const address = sheetJs.utils.encode_cell({ r: row, c: column });
    const cell = sheet[address] || {};
    cell.v = value;
    cell.t = typeof value === 'number' ? 'n' : 's';
    sheet[address] = cell;
}

function completarFechaEncabezado(sheet, date, sheetJs) {
    const [year, month, day] = date.split('-');
    const dateText = `${day}/${month}/${year}`;
    const monthText = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('es-AR', { month: 'long' });
    const values = Object.values(sheet).filter((cell) => cell && typeof cell.v === 'string');

    const labelCells = [];
    const range = sheet['!ref'] ? sheetJs.utils.decode_range(sheet['!ref']) : { s: { r: 0, c: 0 }, e: { r: 40, c: 15 } };
    for (let row = range.s.r; row <= Math.min(range.e.r, 40); row += 1) {
        for (let column = range.s.c; column <= Math.min(range.e.c, 15); column += 1) {
            const address = sheetJs.utils.encode_cell({ r: row, c: column });
            const cell = sheet[address];
            if (!cell || typeof cell.v !== 'string') continue;
            const normalized = cell.v.trim().toUpperCase();
            if (/^FECHA\s*:?$/.test(normalized)) labelCells.push({ cell, text: `FECHA: ${dateText}` });
            if (/^MES\s*:?$/.test(normalized)) labelCells.push({ cell, text: `MES: ${monthText}` });
            if (/^AÑO\s*:?$|^ANO\s*:?$/.test(normalized)) labelCells.push({ cell, text: `AÑO: ${year}` });
        }
    }

    labelCells.forEach(({ cell, text }) => { cell.v = text; });
    // Keep the variable reference explicit for older SheetJS builds that expect
    // the worksheet range to remain untouched while updating styled cells.
    void values;
}
