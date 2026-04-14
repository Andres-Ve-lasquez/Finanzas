// ============================================================
// GMAIL.JS — Sincronización con Gmail API
// ============================================================

let gToken       = null;
let gmailLabels  = [];
let pendingImport = [];

// ── Autenticación ──────────────────────────────────────────

function loadGmailSDK(onReady) {
  if (window._gapiReady) { onReady(); return; }

  // Cargar gapi
  const s1 = document.createElement('script');
  s1.src   = 'https://apis.google.com/js/api.js';
  s1.onload = () => {
    gapi.load('client', () => {
      gapi.client.init({
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest']
      }).then(() => {
        window._gapiReady = true;
        // Cargar GSI
        const s2  = document.createElement('script');
        s2.src    = 'https://accounts.google.com/gsi/client';
        s2.onload = onReady;
        document.head.appendChild(s2);
      });
    });
  };
  document.head.appendChild(s1);
}

function gmailLogin() {
  if (!D.config.clientId) {
    toast('Primero guarda tu Client ID en ⚙️ Config', 'error'); return;
  }
  try {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: D.config.clientId,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      callback: resp => {
        if (resp.error) { toast('Error: ' + resp.error, 'error'); return; }
        gToken = resp.access_token;
        gapi.client.setToken({ access_token: gToken });
        fetchGmailLabels();
        showGmailConnected();
        toast('Gmail conectado ✓');
      }
    });
    client.requestAccessToken();
  } catch(e) {
    toast('Verifica que el Client ID sea correcto y que estés en localhost:8080', 'error');
  }
}

function gmailLogout() {
  gToken = null;
  renderGmail();
  q('syncDot').className  = 'sync-dot';
  q('syncLabel').textContent = 'Sin sincronizar';
  toast('Desconectado de Gmail');
}

async function fetchGmailLabels() {
  try {
    const r = await gapi.client.gmail.users.labels.list({ userId: 'me' });
    gmailLabels = r.result.labels || [];
    renderLabelsGrid();
  } catch(e) { console.error('Error labels:', e); }
}

// ── Extracción de monto ────────────────────────────────────

// Convierte string chileno a número: "1.234.567" → 1234567
function parseMontoCLP(raw) {
  if (!raw) return 0;
  const s = raw.trim();
  // 1.234.567  →  quitar puntos
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseInt(s.replace(/\./g, ''), 10);
  // 1.234,56   →  quitar puntos, reemplazar coma
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s))
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  // Solo dígitos
  return parseInt(s.replace(/[^\d]/g, ''), 10) || 0;
}

// Extrae el monto del texto del correo
// Prioriza patrones específicos de Banco de Chile y otros bancos chilenos
function extraerMonto(texto) {
  const patrones = [
    // "compra por $1.000" / "compra por $11.480"
    /compra\s+por\s+\$\s*([\d]{1,3}(?:\.[\d]{3})*(?:,\d{1,2})?)/i,
    // "por $30.096"
    /por\s+\$\s*([\d]{1,3}(?:\.[\d]{3})*(?:,\d{1,2})?)/i,
    // "monto: $1.234.567" o "monto $1.234"
    /monto[:\s]+\$?\s*([\d]{1,3}(?:\.[\d]{3})*(?:,\d{1,2})?)/i,
    // "de $1.234.567"
    /de\s+\$\s*([\d]{1,3}(?:\.[\d]{3})*(?:,\d{1,2})?)/i,
    // "$1.234.567" (genérico)
    /\$\s*([\d]{1,3}(?:\.[\d]{3})+(?:,\d{1,2})?)/i,
    // "CLP 1.234.567"
    /CLP\$?\s*([\d]{1,3}(?:\.[\d]{3})*)/i,
    // Número grande sin símbolo (último recurso): 1.234.567
    /([\d]{1,3}(?:\.[\d]{3}){1,4})/,
  ];

  for (const pat of patrones) {
    const m = texto.match(pat);
    if (m && m[1]) {
      const monto = parseMontoCLP(m[1]);
      if (monto >= 100 && monto < 500_000_000) return monto;
    }
  }
  return 0;
}

// Extrae el comercio del cuerpo del correo Banco de Chile
// Ej: "compra por $11.480 con cargo a Cuenta ****2220 en PREUNIC PLAZA EGA el 30/03/2026"
function extraerComercio(texto) {
  // Banco de Chile: "en NOMBRE_COMERCIO el DD/MM/YYYY"
  const m1 = texto.match(/en\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s\.&,'-]{2,40})\s+el\s+\d{2}\/\d{2}/i);
  if (m1) return m1[1].trim();
  // Genérico: "en COMERCIO"
  const m2 = texto.match(/en\s+([A-Z][A-Z\s]{3,30})(?:\s+el|\s+con|\.|$)/i);
  if (m2) return m2[1].trim();
  return null;
}

// Decodifica base64url a texto
function decodeBase64(data) {
  try {
    return decodeURIComponent(
      escape(atob(data.replace(/-/g, '+').replace(/_/g, '/')))
    );
  } catch(e) {
    try { return atob(data.replace(/-/g, '+').replace(/_/g, '/')); }
    catch(e2) { return ''; }
  }
}

// Extrae el texto plano del payload del mensaje
function getEmailText(payload) {
  if (!payload) return '';

  // Texto directo en el body
  if (payload.body?.data) return decodeBase64(payload.body.data);

  // Multipart: buscar text/plain primero, luego text/html
  if (payload.parts) {
    let htmlFallback = '';
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data)
        return decodeBase64(part.body.data);
      if (part.mimeType === 'text/html' && part.body?.data)
        htmlFallback = decodeBase64(part.body.data).replace(/<[^>]+>/g, ' ');
      // Recurse multipart/alternative
      if (part.mimeType?.startsWith('multipart')) {
        const sub = getEmailText(part);
        if (sub) return sub;
      }
    }
    if (htmlFallback) return htmlFallback;
  }
  return '';
}

function parseEmailDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return today();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  } catch(e) { return today(); }
}

// Convierte un mensaje crudo de Gmail en un objeto de movimiento
function parsearMensaje(msg) {
  const headers = msg.payload?.headers || [];
  const subject = headers.find(h => h.name === 'Subject')?.value || '';
  const from    = headers.find(h => h.name === 'From')?.value    || '';
  const date    = headers.find(h => h.name === 'Date')?.value    || '';

  // Texto completo = asunto + cuerpo
  const body     = getEmailText(msg.payload);
  const fullText = subject + '\n' + body;

  // Extraer monto
  const monto = extraerMonto(fullText);
  if (!monto) return null;

  // Clasificar tipo y categoría por asunto
  const { tipo, cat: catAsunto } = clasificarPorAsunto(subject);

  // Intentar mejorar la categoría con el comercio
  const comercio = extraerComercio(body);
  const catComercio = comercio ? autoCat(comercio) : null;
  const cat  = catComercio || catAsunto;

  // Descripción: comercio si lo hay, si no el asunto limpio
  const desc = comercio
    ? comercio.charAt(0) + comercio.slice(1).toLowerCase()
    : subject.slice(0, 60);

  return {
    subject, from,
    banco : detectBanco(from),
    monto, tipo, cat, desc,
    fecha : parseEmailDate(date),
    msgId : msg.id,
    checked: true,
  };
}

// ── Sincronización principal ───────────────────────────────

async function syncGmail() {
  if (!gToken) { toast('Conecta Gmail primero', 'error'); return; }

  const reglas   = getReglasAsunto();
  const keywords = [...new Set(reglas.map(r => r.keyword))];
  const dias     = parseInt(D.config.syncDays) || 90;
  const period   = `newer_than:${dias}d`;

  // Labels seleccionados (IDs reales de Gmail)
  const selectedLabels = D.config.gmailLabels || [];
  const labelIds = gmailLabels
    .filter(l => selectedLabels.includes(l.name))
    .map(l => l.id);

  // Si el usuario tiene labels seleccionados → usarlos SIN filtro de asunto
  // (más rápido y captura TODOS los correos de esa etiqueta)
  // Si no hay labels → buscar por asunto en grupos de 3
  const queries = [];

  if (labelIds.length) {
    // Una query por cada label seleccionado
    labelIds.forEach(lid => queries.push(`label:${lid} ${period}`));
  } else if (keywords.length) {
    // Grupos de 3 asuntos por query (límite de Gmail)
    const GRUPO = 3;
    for (let i = 0; i < keywords.length; i += GRUPO) {
      const kw = keywords.slice(i, i + GRUPO);
      queries.push(`(${kw.map(k => `subject:"${k}"`).join(' OR ')}) ${period}`);
    }
  } else {
    toast('Selecciona una etiqueta o agrega reglas de asunto', 'warn'); return;
  }

  toast(`Buscando en ${queries.length} consulta(s)...`, 'warn');

  // IDs ya importados (evitar duplicados)
  const importedIds = new Set(D.movimientos.map(m => m.msgId).filter(Boolean));
  const seenIds     = new Set();
  let   allMsgIds   = [];

  // Paso 1: recolectar IDs de mensajes (usando threads para capturar hilos completos)
  for (const q_str of queries) {
    let pageToken = null;
    let pagina    = 0;
    try {
      do {
        // Usamos threads.list para capturar hilos completos
        const params = { userId: 'me', maxResults: 100, q: q_str };
        if (pageToken) params.pageToken = pageToken;

        const r = await gapi.client.gmail.users.threads.list(params);
        const threads = r.result.threads || [];

        // Por cada thread, traer todos sus mensajes
        for (const thread of threads) {
          try {
            const tr = await gapi.client.gmail.users.threads.get({
              userId: 'me', id: thread.id, format: 'metadata',
              metadataHeaders: ['Subject','From','Date']
            });
            for (const msg of (tr.result.messages || [])) {
              if (!seenIds.has(msg.id)) {
                seenIds.add(msg.id);
                allMsgIds.push(msg.id);
              }
            }
          } catch(e) { console.warn('Error thread:', thread.id, e.message); }
        }

        pageToken = r.result.nextPageToken || null;
        pagina++;
        toast(`Encontrados ${allMsgIds.length} mensajes...`, 'warn');
      } while (pageToken && pagina < 10); // hasta 1000 mensajes por query
    } catch(e) { console.warn('Query falló:', q_str, e.message); }
  }

  const nuevosIds = allMsgIds.filter(id => !importedIds.has(id));

  if (!allMsgIds.length) {
    toast('No se encontraron correos. Verifica la etiqueta o las reglas de asunto.', 'warn');
    // Mostrar debug
    console.log('Queries usadas:', queries);
    return;
  }
  if (!nuevosIds.length) {
    toast(`${allMsgIds.length} correos encontrados, todos ya importados ✓`, 'warn'); return;
  }

  toast(`Procesando ${nuevosIds.length} mensajes nuevos...`, 'warn');

  // Paso 2: traer contenido completo en lotes de 10
  const parsed = [];
  const LOTE   = 10;
  const limite = Math.min(nuevosIds.length, 500);

  for (let i = 0; i < limite; i += LOTE) {
    const lote    = nuevosIds.slice(i, i + LOTE);
    const results = await Promise.all(
      lote.map(id =>
        gapi.client.gmail.users.messages.get({ userId:'me', id, format:'full' })
          .then(r  => parsearMensaje(r.result))
          .catch(e => { console.warn('Error msg:', id, e.message); return null; })
      )
    );
    results.forEach(p => { if (p) parsed.push(p); });
    toast(`Procesando... ${Math.min(i + LOTE, limite)} / ${limite}`, 'warn');
  }

  if (!parsed.length) {
    toast(`${nuevosIds.length} correos encontrados pero sin montos detectables.\nRevisa en la consola (F12) qué texto tienen.`, 'warn');
    console.log('Primer mensaje sin monto — revisa el texto:');
    // Mostrar debug del primer mensaje
    try {
      const debug = await gapi.client.gmail.users.messages.get({ userId:'me', id:nuevosIds[0], format:'full' });
      console.log('Subject:', debug.result.payload?.headers?.find(h=>h.name==='Subject')?.value);
      console.log('Body:', getEmailText(debug.result.payload).slice(0, 500));
    } catch(e) {}
    return;
  }

  // Ordenar por fecha descendente
  parsed.sort((a, b) => b.fecha.localeCompare(a.fecha));

  pendingImport = parsed;
  renderImportModal();
  openModal('modalImport');

  D.syncHistory.unshift({
    date  : new Date().toLocaleString('es-CL'),
    count : parsed.length,
    total : nuevosIds.length,
    labels: selectedLabels.join(', ') || 'Por reglas',
  });
  D.syncHistory = D.syncHistory.slice(0, 20);
  saveData(); renderSyncHistory();
  q('gmailBadge').style.display = 'block';
  toast(`${parsed.length} movimientos detectados ✓`);
}

function importarSeleccionados() {
  const sel = pendingImport.filter(p => p.checked);
  if (!sel.length) { toast('Selecciona al menos uno', 'warn'); return; }
  sel.forEach(p => {
    D.movimientos.push({
      id      : uid(),
      tipo    : p.tipo,
      desc    : p.desc || p.subject.slice(0, 60),
      monto   : p.monto,
      cat     : p.cat,
      cuentaId: p.cuentaId || '',
      fecha   : p.fecha,
      banco   : p.banco || '',
      msgId   : p.msgId,
    });
  });
  saveData();
  closeModal('modalImport');
  q('gmailBadge').style.display = 'none';
  toast(`${sel.length} movimiento(s) importado(s) ✓`);
  renderMovs();
  renderResumen();
}
