const exportButton = document.getElementById('btn-exportar-presentismo');

if (exportButton) {
    exportButton.addEventListener('click', () => {
        const sheetJs = window.XLSX;
        const attendanceTable = document.querySelector('#content-presentismo table');
        const dateInput = document.getElementById('fecha-presentismo');
        const date = dateInput?.value || new Date().toISOString().slice(0, 10);

        if (!sheetJs?.utils?.aoa_to_sheet || !sheetJs?.writeFile) {
            window.alert('No se pudo cargar la biblioteca de Excel. Comprueba tu conexión e inténtalo de nuevo.');
            return;
        }

        if (!attendanceTable) {
            window.alert('No se encontró la tabla de presentismo.');
            return;
        }

        try {
            // Convert visible cell text into a plain array instead of relying on
            // SheetJS DOM table parsing, which can fail across browsers.
            const rows = Array.from(attendanceTable.rows, (row) =>
                Array.from(row.cells, (cell) => cell.innerText.trim())
            ).filter((row) => row.length > 0);

            if (rows.length < 2 || rows[0].length === 0) {
                window.alert('Todavía no hay datos de presentismo para exportar.');
                return;
            }

            const worksheet = sheetJs.utils.aoa_to_sheet(rows);
            worksheet['!cols'] = [
                { wch: 28 },
                { wch: 14 },
                { wch: 22 },
                { wch: 18 },
                ...Array.from({ length: 24 }, () => ({ wch: 9 })),
                { wch: 14 }
            ];

            if (worksheet['!ref']) {
                worksheet['!autofilter'] = { ref: worksheet['!ref'] };
            }

            const workbook = sheetJs.utils.book_new();
            sheetJs.utils.book_append_sheet(workbook, worksheet, 'Presentismo');
            sheetJs.writeFile(workbook, `presentismo-${date}.xlsx`, { bookType: 'xlsx' });
        } catch (error) {
            console.error('Error al generar el archivo XLSX:', error);
            window.alert(`No se pudo generar el archivo Excel: ${error?.message || 'error inesperado'}`);
        }
    });
}
