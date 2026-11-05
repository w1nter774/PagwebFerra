const exportButton = document.getElementById('btn-exportar-presentismo');

if (exportButton) {
    exportButton.addEventListener('click', () => {
        const sheetJs = window.XLSX;
        const attendanceTable = document.querySelector('#content-presentismo table');
        const dateInput = document.getElementById('fecha-presentismo');
        const date = dateInput?.value || new Date().toISOString().slice(0, 10);

        if (!sheetJs) {
            window.alert('No se pudo cargar la biblioteca de Excel. Comprueba tu conexión e inténtalo de nuevo.');
            return;
        }

        if (!attendanceTable || !attendanceTable.querySelector('thead tr')) {
            window.alert('Todavía no hay una tabla de presentismo para exportar.');
            return;
        }

        try {
            const worksheet = sheetJs.utils.table_to_sheet(attendanceTable, { raw: true });
            worksheet['!cols'] = [
                { wch: 28 },
                { wch: 14 },
                { wch: 22 },
                { wch: 18 },
                ...Array.from({ length: 24 }, () => ({ wch: 9 })),
                { wch: 14 }
            ];
            worksheet['!autofilter'] = { ref: sheetJs.utils.encode_range(worksheet['!ref']) };
            worksheet['!freeze'] = { xSplit: 4, ySplit: 1, topLeftCell: 'E2', activePane: 'bottomRight', state: 'frozen' };

            const workbook = sheetJs.utils.book_new();
            sheetJs.utils.book_append_sheet(workbook, worksheet, 'Presentismo');
            sheetJs.writeFile(workbook, `presentismo-${date}.xlsx`, { bookType: 'xlsx' });
        } catch (error) {
            console.error('Error al generar el archivo XLSX:', error);
            window.alert('No se pudo generar el archivo Excel. Inténtalo nuevamente.');
        }
    });
}
