/* ============================================================
   AREA VM CONTROL TOWER V1 — Chart helpers (Chart.js)
   Auto-destroys previous charts to prevent leaks on re-render.
   ============================================================ */

const ChartKit = {
  _registry: [],
  destroyAll() {
    this._registry.forEach(c => { try { c.destroy(); } catch (e) {} });
    this._registry = [];
  },
  _mk(canvasId, config) {
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return null;
    const ctx = el.getContext('2d');
    const chart = new Chart(ctx, config);
    this._registry.push(chart);
    return chart;
  },
  bar(canvasId, labels, datasets, opts) {
    return this._mk(canvasId, {
      type: 'bar',
      data: { labels, datasets },
      options: Object.assign({
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: (opts && opts.legend) !== false, labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => (c.dataset.label || '') + ': ' + c.parsed.y + (opts && opts.suffix || '') } }
        },
        scales: {
          y: { beginAtZero: true, max: opts && opts.max || 100, grid: { color: '#eef2f7' }, ticks: { font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }, opts && opts.extra || {})
    });
  },
  line(canvasId, labels, datasets, opts) {
    return this._mk(canvasId, {
      type: 'line',
      data: { labels, datasets },
      options: Object.assign({
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: (opts && opts.legend) !== false, labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, max: 100, grid: { color: '#eef2f7' }, ticks: { font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        },
        elements: { line: { tension: 0.35, borderWidth: 2.5 }, point: { radius: 2 } },
        interaction: { mode: 'index', intersect: false }
      }, opts && opts.extra || {})
    });
  },
  doughnut(canvasId, labels, data, colors) {
    return this._mk(canvasId, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '66%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }
      }
    });
  }
};