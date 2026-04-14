// ============================================================
// DATA.JS — Gestión de datos en localStorage
// ============================================================

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const d   = raw ? JSON.parse(raw) : {};
    return {
      cuentas:     d.cuentas     || [],
      movimientos: d.movimientos || [],
      recurrentes: d.recurrentes || [],
      deudas:      d.deudas      || [],
      ahorros:     d.ahorros     || [],
      syncHistory: d.syncHistory || [],
      config: {
        clientId:     d.config?.clientId    || '',
        alertDays:    d.config?.alertDays   || 7,
        syncDays:     d.config?.syncDays    || 90,
        gmailLabels:  d.config?.gmailLabels || [],
        categorias:   d.config?.categorias  || [...CATS_DEFAULT],
        reglasAsunto: d.config?.reglasAsunto|| [],
        reglasCat:    d.config?.reglasCat   || [...REGLAS_CAT_DEFAULT],
      }
    };
  } catch(e) {
    console.error('Error cargando datos:', e);
    return emptyData();
  }
}

function emptyData() {
  return {
    cuentas:[], movimientos:[], recurrentes:[], deudas:[], ahorros:[],
    syncHistory:[],
    config:{
      clientId:'', alertDays:7, syncDays:90, gmailLabels:[],
      categorias:[...CATS_DEFAULT],
      reglasAsunto:[], reglasCat:[...REGLAS_CAT_DEFAULT],
    }
  };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(D));
}

// Reglas de asunto = defaults + overrides del usuario
function getReglasAsunto() {
  const user    = D.config.reglasAsunto || [];
  const merged  = REGLAS_DEFAULT.map(def => {
    const override = user.find(u => u.id === def.id);
    return override || def;
  });
  // Reglas nuevas del usuario (sin id default)
  const extras = user.filter(u => !REGLAS_DEFAULT.find(d => d.id === u.id));
  return [...merged, ...extras].filter(r => r.keyword && r.keyword !== '__disabled__');
}

function getEditableReglasAsunto() {
  const userRules = D.config.reglasAsunto || [];
  const visibleUserRules = userRules.filter(r => r.keyword !== '__disabled__');
  const defaultsNoOverridden = REGLAS_DEFAULT.filter(def => !userRules.find(rule => rule.id === def.id));
  return [...defaultsNoOverridden, ...visibleUserRules];
}

// Clasifica un correo por su asunto
function clasificarPorAsunto(subject) {
  const sl = subject.toLowerCase();
  for (const r of getReglasAsunto()) {
    if (sl.includes(r.keyword.toLowerCase()))
      return { tipo: r.tipo, cat: r.cat };
  }
  return { tipo: 'gasto', cat: 'Otro' };
}

// Auto-categoriza por texto del comercio/descripción
function autoCat(texto) {
  const tl = texto.toLowerCase();
  for (const r of (D.config.reglasCat || REGLAS_CAT_DEFAULT)) {
    if (tl.includes(r.keyword.toLowerCase())) return r.cat;
  }
  return null; // no match
}

// Saldo actual de una cuenta (saldo inicial + movimientos)
function getSaldo(cuentaId) {
  const c = D.cuentas.find(x => x.id === cuentaId);
  if (!c) return 0;
  return D.movimientos
    .filter(m => m.cuentaId === cuentaId)
    .reduce((s, m) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), c.saldoInicial);
}

// Exportar todo como JSON
function exportJSON() {
  const blob = new Blob([JSON.stringify(D, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `finanzas_backup_${today()}.json`;
  a.click();
  toast('Backup descargado ✓');
}

// Exportar movimientos como CSV
function exportCSV() {
  const headers = ['Fecha','Descripción','Tipo','Categoría','Monto','Cuenta','Banco'];
  const rows = D.movimientos.map(m => {
    const c = D.cuentas.find(x => x.id === m.cuentaId);
    return [m.fecha, `"${m.desc}"`, m.tipo, m.cat, m.monto, c ? c.nombre : '', m.banco || ''].join(',');
  });
  const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `movimientos_${today()}.csv`;
  a.click();
  toast('CSV descargado ✓');
}

// Importar backup JSON o CSV
function importFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      if (file.name.endsWith('.json')) {
        const imported = JSON.parse(e.target.result);
        if (!confirm(`Importar ${imported.movimientos?.length || 0} movimientos, ${imported.cuentas?.length || 0} cuentas?\nEsto reemplaza los datos actuales.`)) return;
        Object.assign(D, imported);
        saveData(); renderResumen(); toast('Datos restaurados ✓');
      } else if (file.name.endsWith('.csv')) {
        const lines = e.target.result.split('\n').slice(1);
        let count = 0;
        lines.forEach(line => {
          const cols = line.split(',');
          if (cols.length >= 5 && cols[0]) {
            D.movimientos.push({
              id: uid(), fecha: cols[0], desc: cols[1]?.replace(/"/g, ''),
              tipo: cols[2] || 'gasto', cat: cols[3] || 'Otro',
              monto: parseFloat(cols[4]) || 0, cuentaId: ''
            });
            count++;
          }
        });
        saveData(); renderMovs(); toast(`${count} movimientos importados ✓`);
      }
    } catch(err) { toast('Error al importar: ' + err.message, 'error'); }
  };
  reader.readAsText(file);
  input.value = '';
}

function resetAll() {
  if (!confirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer.')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}
