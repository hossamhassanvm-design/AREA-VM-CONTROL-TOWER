/* ============================================================
   AREA VM CONTROL TOWER V1 — Export (CSV + Print/PDF)
   Structure ready for future PDF library integration.
   ============================================================ */

const Exporter = {
  downloadCSV(kind, filename) {
    const csv = Store.exportCSV(kind);
    if (!csv) { toast('—'); return; }
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'vm_' + kind + '_' + todayISO() + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  },
  printPDF() {
    window.print();
  },
  exportAll() {
    ['daily', 'moneyMap', 'visits', 'videos', 'weekly', 'issues', 'alerts'].forEach(k => this.downloadCSV(k, 'vm_' + k + '_' + todayISO() + '.csv'));
    toast(t('exportCsv'));
  },
  downloadCSVAll(kind, customRows) {
    const csv = customRows.join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vm_' + kind + '_' + todayISO() + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }
};