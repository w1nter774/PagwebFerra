const exportButton = document.getElementById('btn-exportar-presentismo');
const TEMPLATE_URL = new URL('../PRESENTISMO BLANCO.xlsx', import.meta.url);
const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
const TEMPLATE_FIRST_DATA_ROW = 6;
const TEMPLATE_LAST_DATA_ROW = 31;

// The columns follow the original blank form from left to right.
const TEMPLATE_COLUMNS = {
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
};

if (exportButton) {
    exportButton.addEventListener('click', exportarPresentismoPlantilla);
}

async function exportarPresentismoPlantilla() {
    const table = document.querySelector('#content-presentismo table');
    const date = document.getElementById('fecha-presentismo')?.value || new Date().toISOString().slice(0, 10);

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
        const ExcelJS = await cargarExcelJS();
        const response = await fetch(TEMPLATE_URL.href, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`No se pudo descargar la plantilla (${response.status}). Ruta: ${TEMPLATE_URL.pathname}`);
        }

        const templateBytes = await response.arrayBuffer();
        if (!templateBytes.byteLength) throw new Error('El archivo de plantilla está vacío.');

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(templateBytes);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) throw new Error('La plantilla no contiene una primera hoja válida.');

        completarFechaEncabezado(worksheet, date);
        records.forEach((record, index) => {
            const row = TEMPLATE_FIRST_DATA_ROW + index;
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.order, index + 1);
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.rank, record.cargo);
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.escalafon, record.escalafon);
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.legajo, record.legajo);
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.nombre, record.nombre);
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.ordinaryEntry, record.ordinaryEntry);
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.ordinaryExit, record.ordinaryExit);
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.ordinaryHours, record.ordinaryHours || '');
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.coresEntry, record.coresEntry);
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.coresExit, record.coresExit);
            setCellValue(worksheet, row, TEMPLATE_COLUMNS.coresHours, record.coresHours || '');
        });

        // ExcelJS reads and writes the existing workbook, so its original borders,
        // merged header cells, column widths, print setup and other formatting remain.
        const output = await workbook.xlsx.writeBuffer();
        const blob = new Blob([output], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        descargarBlob(blob, `PLANILLA_PRESENTISMO_${date}.xlsx`);
    } catch (error) {
        console.error('Error al generar la planilla XLSX:', error);
        window.alert(`No se pudo generar el archivo Excel. ${error?.message || 'Error inesperado.'}`);
    } finally {
        exportButton.disabled = false;
        exportButton.textContent = originalText;
    }
}

function cargarExcelJS() {
    if (window.ExcelJS?.Workbook) return Promise.resolve(window.ExcelJS);

    return new Promise((resolve, reject) => {
        const existingScript = document.querySelector(`script[src="${EXCELJS_URL}"]`);
        if (existingScript) {
            existingScript.addEventListener('load', () => {
                if (window.ExcelJS?.Workbook) resolve(window.ExcelJS);
                else reject(new Error('ExcelJS se cargó, pero su API no está disponible.'));
            }, { once: true });
            existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar ExcelJS. Comprueba tu conexión.')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = EXCELJS_URL;
        script.onload = () => {
            if (window.ExcelJS?.Workbook) resolve(window.ExcelJS);
            else reject(new Error('ExcelJS se cargó, pero su API no está disponible.'));
        };
        script.onerror = () => reject(new Error('No se pudo cargar ExcelJS. Comprueba tu conexión.'));
        document.head.appendChild(script);
    });
}

function convertirFilaPresentismo(row) {
    const cells = Array.from(row.cells);
    // The attendance display contains 4 personnel columns, 24 hourly cells and status.
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

function setCellValue(worksheet, rowNumber, columnNumber, value) {
    // Assign only the value. Do not replace cell styles; this keeps the template grid lines.
    worksheet.getRow(rowNumber).getCell(columnNumber).value = value;
}

function completarFechaEncabezado(worksheet, date) {
    const [year, month, day] = date.split('-');
    if (!year || !month || !day) return;

    const dateText = `${day}/${month}/${year}`;
    const monthText = new Date(Number(year), Number(month) - 1, 1)
        .toLocaleDateString('es-AR', { month: 'long' });

    worksheet.eachRow({ includeEmpty: false }, (row) => {
        if (row.number > 5) return;
        row.eachCell({ includeEmpty: false }, (cell) => {
            if (typeof cell.value !== 'string') return;
            const normalized = cell.value.trim().toUpperCase();
            if (/^FECHA\s*:?$/.test(normalized)) cell.value = `FECHA: ${dateText}`;
            if (/^MES\s*:?$/.test(normalized)) cell.value = `MES: ${monthText}`;
            if (/^AÑO\s*:?$|^ANO\s*:?$/.test(normalized)) cell.value = `AÑO: ${year}`;
        });
    });
}

function descargarBlob(blob, filename) {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}
