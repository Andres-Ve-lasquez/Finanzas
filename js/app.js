// ============================================================
// APP.JS — Lógica principal y renderizado
// ============================================================

// ── Utilidades UI ──────────────────────────────────────────

function toast(msg, type = 'success') {
  const t = q('toast');
  t.textContent = msg;
  t.className   = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function openModal(id)  { q(id).classList.add('open'); }
function closeModal(id) { q(id).classList.remove('open'); }

// ── Navegación ─────────────────────────────────────────────

function nav(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  q('section-' + id).classList.add('active');
  el.classList.add('active');
  closeAlerts();

  const render = {
    resumen:     renderResumen,
    cuentas:     renderCuentas,
    movimientos: () => { populateSelects(); renderMovs(); },
    recurrentes: () => { populateSelects(); renderRec(); },
    deudas:      renderDeudas,
    ahorros:     renderAhorros,
    gmail:       renderGmail,
    config:      renderConfig,
  };
  render[id]?.();
}

// ── Alertas ────────────────────────────────────────────────

function getAlerts() {
  const alerts = [];
  const now    = new Date();
  const days   = parseInt(D.config.alertDays) || 7;

  D.deudas.forEach(d => {
    if (!d.vence || (d.total - d.pagado) <= 0) return;
    const diff = Math.ceil((new Date(d.vence) - now) / 86400000);
    if (diff < 0)
      alerts.push({ type:'danger', icon:'⚠️', title:`Vencida hace ${Math.abs(diff)} días`, text:`${d.desc} — ${fmt(d.total - d.pagado)} pendiente` });
    else if (diff <= days)
      alerts.push({ type:'warn', icon:'💳', title:`Vence en ${diff} días`, text:`${d.desc} — ${fmt(d.total - d.pagado)} pendiente` });
  });

  D.recurrentes.filter(r => r.activo).forEach(r => {
    if (isPendiente(r))
      alerts.push({ type:'info', icon:'🔄', title:`Recurrente pendiente`, text:`${r.nombre} — ${fmt(r.monto)}` });
  });

  return alerts;
}

function renderAlertCount() {
  const n  = getAlerts().length;
  const el = q('alertCount');
  el.style.display = n > 0 ? 'block' : 'none';
  el.textContent   = n;
}

function toggleAlerts() {
  const p = q('alertsPanel');
  if (p.classList.contains('open')) { p.classList.remove('open'); return; }
  const alerts = getAlerts();
  q('alertsList').innerHTML = alerts.length
    ? alerts.map(a => `<div class="alert-item ${a.type}">
        <div class="alert-item-icon">${a.icon}</div>
        <div class="alert-item-text"><b>${a.title}</b><span>${a.text}</span></div>
      </div>`).join('')
    : '<div style="padding:20px;text-align:center;color:var(--muted);font-size:.85rem">✅ Sin alertas pendientes</div>';
  p.classList.add('open');
}
function closeAlerts() { q('alertsPanel').classList.remove('open'); }

// ── Cuentas ────────────────────────────────────────────────

function addCuenta() {
  const n = q('c-n').value.trim();
  const b = q('c-b').value.trim();
  const t = q('c-t').value;
  const s = parseFloat(q('c-s').value) || 0;
  if (!n) { toast('Ingresa un nombre', 'error'); return; }
  D.cuentas.push({ id: uid(), nombre: n, banco: b, tipo: t, saldoInicial: s });
  saveData(); renderCuentas(); populateSelects();
  ['c-n','c-b','c-s'].forEach(id => q(id).value = '');
  toast('Cuenta agregada ✓');
}

function renderCuentas() {
  const el = q('cuentasList');
  if (!D.cuentas.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🏦</div><p>Sin cuentas. ¡Agrega tu primera cuenta!</p></div>';
    return;
  }
  el.innerHTML = `<div class="tw"><table>
    <thead><tr><th>Nombre</th><th>Banco</th><th>Tipo</th><th>Saldo Inicial</th><th>Saldo Actual</th><th></th></tr></thead>
    <tbody>${D.cuentas.map(c => {
      const sal = getSaldo(c.id);
      return `<tr>
        <td><b>${c.nombre}</b></td><td>${c.banco||'—'}</td><td>${c.tipo}</td>
        <td>${fmt(c.saldoInicial)}</td>
        <td class="${sal>=0?'ap':'an'}">${fmt(sal)}</td>
        <td><button class="btn btn-danger" onclick="delCuenta('${c.id}')">✕</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function delCuenta(id) {
  if (!confirm('¿Eliminar cuenta y sus movimientos asociados?')) return;
  D.cuentas      = D.cuentas.filter(c => c.id !== id);
  D.movimientos  = D.movimientos.filter(m => m.cuentaId !== id);
  saveData(); renderCuentas(); populateSelects(); toast('Cuenta eliminada');
}

// ── Movimientos ────────────────────────────────────────────

function addMov(data) {
  const tipo    = data?.tipo    || q('m-t').value;
  const desc    = data?.desc    || q('m-d').value.trim();
  const monto   = data?.monto   || parseFloat(q('m-m').value);
  const cat     = data?.cat     || q('m-c').value;
  const cuentaId= data?.cuentaId|| q('m-ct').value;
  const fecha   = data?.fecha   || q('m-f').value || today();
  if (!desc || !monto || isNaN(monto)) { toast('Completa descripción y monto', 'error'); return; }
  D.movimientos.push({ id: uid(), tipo, desc, monto, cat, cuentaId, fecha });
  saveData(); renderMovs(); renderAlertCount();
  if (!data) { q('m-d').value=''; q('m-m').value=''; toast('Movimiento registrado ✓'); }
}

function renderMovs() {
  const mes  = q('filtMes').value;
  const tipo = q('filtTipo').value;
  const cat  = q('filtCat').value;
  let movs   = [...D.movimientos].sort((a,b) => b.fecha.localeCompare(a.fecha));
  if (mes !== 'all') movs = movs.filter(m => m.fecha.startsWith(mes));
  if (tipo)          movs = movs.filter(m => m.tipo === tipo);
  if (cat)           movs = movs.filter(m => m.cat  === cat);

  const tb  = q('movBody');
  const emp = q('movEmpty');
  if (!movs.length) { tb.innerHTML=''; emp.style.display='block'; return; }
  emp.style.display = 'none';
  tb.innerHTML = movs.map(m => {
    const c = D.cuentas.find(x => x.id === m.cuentaId);
    return `<tr>
      <td>${m.fecha}</td>
      <td>${m.desc}${m.banco?`<span class="tag" style="margin-left:6px">${m.banco}</span>`:''}</td>
      <td><span class="tag">${m.cat}</span></td>
      <td>${c ? c.nombre : '—'}</td>
      <td><span class="badge ${m.tipo==='ingreso'?'b-ing':'b-gas'}">${m.tipo}</span></td>
      <td class="${m.tipo==='ingreso'?'ap':'an'}">${m.tipo==='ingreso'?'+':'-'}${fmt(m.monto)}</td>
      <td><button class="btn btn-danger" onclick="delMov('${m.id}')">✕</button></td>
    </tr>`;
  }).join('');
}

function delMov(id) {
  D.movimientos = D.movimientos.filter(m => m.id !== id);
  saveData(); renderMovs();
}

// ── Recurrentes ────────────────────────────────────────────

function addRec() {
  const t  = q('r-t').value;
  const n  = q('r-n').value.trim();
  const m  = parseFloat(q('r-m').value) || 0;
  const c  = q('r-c').value;
  const ct = q('r-ct').value;
  const f  = q('r-f').value;
  const d  = parseInt(q('r-d').value) || 1;
  if (!n || !m) { toast('Nombre y monto requeridos', 'error'); return; }
  D.recurrentes.push({ id:uid(), tipo:t, nombre:n, monto:m, cat:c, cuentaId:ct, frecuencia:f, dia:d, activo:true, ultimaEjecucion:null });
  saveData(); renderRec(); toast('Recurrente creado ✓');
  ['r-n','r-m','r-d'].forEach(id => q(id).value='');
}

function getNextRecDate(r) {
  const now = new Date();
  if (r.frecuencia === 'mensual')    return new Date(now.getFullYear(), now.getMonth() + (new Date(now.getFullYear(), now.getMonth(), r.dia||1) <= now ? 1 : 0), r.dia||1);
  if (r.frecuencia === 'quincenal') { const dias=[1,15]; for (const d of dias) { const x=new Date(now.getFullYear(),now.getMonth(),d); if(x>now) return x; } return new Date(now.getFullYear(),now.getMonth()+1,1); }
  if (r.frecuencia === 'semanal')    { const d=new Date(now); d.setDate(d.getDate()+7); return d; }
  return null;
}

function isPendiente(r) {
  if (!r.activo) return false;
  const now = new Date();
  if (!r.ultimaEjecucion) return true;
  const last = new Date(r.ultimaEjecucion);
  if (r.frecuencia === 'mensual')   { const mes=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; return !r.ultimaEjecucion.startsWith(mes); }
  if (r.frecuencia === 'quincenal') return (now - last) > 12*24*3600000;
  if (r.frecuencia === 'semanal')   return (now - last) > 6*24*3600000;
  return false;
}

function aplicarRecurrentes() {
  let count = 0;
  D.recurrentes.filter(r => r.activo && isPendiente(r)).forEach(r => {
    addMov({ tipo:r.tipo, desc:r.nombre, monto:r.monto, cat:r.cat, cuentaId:r.cuentaId, fecha:today() });
    r.ultimaEjecucion = today();
    count++;
  });
  saveData(); renderRec();
  toast(count > 0 ? `${count} movimiento(s) aplicado(s) ✓` : 'Todo al día ✓', count>0?'success':'warn');
}

function aplicarUno(id) {
  const r = D.recurrentes.find(x => x.id === id);
  if (!r) return;
  addMov({ tipo:r.tipo, desc:r.nombre, monto:r.monto, cat:r.cat, cuentaId:r.cuentaId, fecha:today() });
  r.ultimaEjecucion = today();
  saveData(); renderRec(); toast('Aplicado ✓');
}

function toggleRec(id) {
  const r = D.recurrentes.find(x => x.id === id);
  if (r) { r.activo = !r.activo; saveData(); renderRec(); }
}

function delRec(id) {
  if (!confirm('¿Eliminar?')) return;
  D.recurrentes = D.recurrentes.filter(r => r.id !== id);
  saveData(); renderRec();
}

function renderRec() {
  const el = q('recList');
  if (!D.recurrentes.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🔄</div><p>Sin movimientos recurrentes.</p></div>';
    return;
  }
  el.innerHTML = D.recurrentes.map(r => {
    const next    = getNextRecDate(r);
    const pending = isPendiente(r);
    const nextStr = next ? next.toLocaleDateString('es-CL',{day:'numeric',month:'short'}) : '—';
    return `<div class="rec-card">
      <div class="rec-icon">${r.tipo==='ingreso'?'📈':'📉'}</div>
      <div class="rec-info">
        <div class="rec-nombre">${r.nombre} <span style="font-size:.72rem;color:var(--muted)">${r.cat}</span></div>
        <div class="rec-meta">${r.frecuencia} · Próximo: ${nextStr}
          ${pending?'<span class="badge b-warn" style="margin-left:8px">Pendiente</span>':'<span class="badge b-ok" style="margin-left:8px">Al día</span>'}
        </div>
      </div>
      <div class="rec-monto ${r.tipo==='ingreso'?'ap':'an'}">${r.tipo==='ingreso'?'+':'-'}${fmt(r.monto)}</div>
      <div class="rec-actions">
        ${pending?`<button class="btn btn-warn btn-sm" onclick="aplicarUno('${r.id}')">▶</button>`:''}
        <button class="toggle-btn ${r.activo?'on':'off'}" onclick="toggleRec('${r.id}')"></button>
        <button class="btn btn-danger" onclick="delRec('${r.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Deudas ─────────────────────────────────────────────────

let abonoTarget = null;

function addDeuda() {
  const d=q('d-d').value.trim(), a=q('d-a').value.trim();
  const t=parseFloat(q('d-t').value)||0, p=parseFloat(q('d-p').value)||0;
  const c=parseFloat(q('d-c').value)||0, v=q('d-v').value;
  if (!d||!t) { toast('Descripción y total requeridos','error'); return; }
  D.deudas.push({ id:uid(), desc:d, acreedor:a, total:t, pagado:p, cuota:c, vence:v, historial:[], expanded:false });
  saveData(); renderDeudas(); renderAlertCount(); toast('Deuda agregada ✓');
  ['d-d','d-a','d-t','d-p','d-c','d-v'].forEach(id => q(id).value='');
}

function abrirAbono(id) {
  abonoTarget = id;
  q('ab-monto').value=''; q('ab-fecha').value=today(); q('ab-nota').value='';
  openModal('modalAbono');
}

function confirmarAbono() {
  const monto = parseFloat(q('ab-monto').value)||0;
  const fecha = q('ab-fecha').value||today();
  const nota  = q('ab-nota').value.trim();
  if (!monto) { toast('Ingresa un monto','error'); return; }
  const d = D.deudas.find(x => x.id === abonoTarget);
  if (!d) return;
  d.pagado  = Math.min(d.total, d.pagado + monto);
  d.historial = d.historial||[];
  d.historial.push({ fecha, monto, nota });
  saveData(); closeModal('modalAbono'); renderDeudas(); toast(`Abono de ${fmt(monto)} registrado ✓`);
}

function verHistorial(id) {
  const d = D.deudas.find(x => x.id === id);
  if (!d) return;
  q('modalHistorialTitle').textContent = `Historial — ${d.desc}`;
  q('historialList').innerHTML = d.historial?.length
    ? [...d.historial].reverse().map(h => `<div class="historial-item">
        <div><b class="ap">${fmt(h.monto)}</b><span style="display:block;font-size:.75rem;color:var(--muted)">${h.nota||''}</span></div>
        <div style="color:var(--muted);font-size:.8rem">${h.fecha}</div>
      </div>`).join('')
    : '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.83rem">Sin abonos registrados.</div>';
  openModal('modalHistorial');
}

function toggleDeuda(id) {
  const d = D.deudas.find(x => x.id === id);
  if (d) { d.expanded = !d.expanded; renderDeudas(); }
}

function delDeuda(id) {
  if (!confirm('¿Eliminar deuda?')) return;
  D.deudas = D.deudas.filter(d => d.id !== id);
  saveData(); renderDeudas();
}

function renderDeudas() {
  const el = q('deudasList');
  if (!D.deudas.length) { el.innerHTML='<div class="empty"><div class="empty-icon">💳</div><p>¡Sin deudas! 🎉</p></div>'; return; }
  const now = new Date();
  el.innerHTML = D.deudas.map(d => {
    const pend   = Math.max(0, d.total - d.pagado);
    const pct    = d.total>0 ? Math.min(100,Math.round(d.pagado/d.total*100)) : 0;
    const fill   = pct>=75?'ok':pct>=40?'warn':'danger';
    const cuotas = d.cuota>0 ? Math.ceil(pend/d.cuota) : '—';
    let venceStr = '—';
    if (d.vence) {
      const diff = Math.ceil((new Date(d.vence)-now)/86400000);
      venceStr = diff<0 ? `<span class="an">Vencida hace ${Math.abs(diff)}d</span>`
               : diff<=7 ? `<span class="aw">En ${diff} días</span>`
               : `<span style="color:var(--muted)">En ${diff} días</span>`;
    }
    return `<div class="deuda-card">
      <div class="deuda-header" onclick="toggleDeuda('${d.id}')">
        <div class="deuda-toggle ${d.expanded?'open':''}">▶</div>
        <div class="deuda-main"><div class="deuda-nombre">${d.desc}</div>
          <div class="deuda-meta">${d.acreedor||'—'} ${d.cuota?'· Cuota: '+fmt(d.cuota):''}</div></div>
        <div class="deuda-bar-wrap"><div class="deuda-pct">${pct}%</div>
          <div class="pb"><div class="pf ${fill}" style="width:${pct}%"></div></div></div>
        <div class="deuda-amount an">${fmt(pend)}</div>
        <div style="display:flex;gap:6px;margin-left:10px">
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();abrirAbono('${d.id}')">+Abono</button>
          <button class="btn btn-danger" onclick="event.stopPropagation();delDeuda('${d.id}')">✕</button>
        </div>
      </div>
      <div class="deuda-body ${d.expanded?'open':''}">
        <div class="deuda-stats">
          <div class="dstat"><div class="dstat-label">Total</div><div class="dstat-value an">${fmt(d.total)}</div></div>
          <div class="dstat"><div class="dstat-label">Pagado</div><div class="dstat-value ap">${fmt(d.pagado)}</div></div>
          <div class="dstat"><div class="dstat-label">Pendiente</div><div class="dstat-value an">${fmt(pend)}</div></div>
          <div class="dstat"><div class="dstat-label">Cuota mensual</div><div class="dstat-value">${d.cuota?fmt(d.cuota):'—'}</div></div>
          <div class="dstat"><div class="dstat-label">Cuotas restantes</div><div class="dstat-value">${cuotas}</div></div>
          <div class="dstat"><div class="dstat-label">Vencimiento</div><div class="dstat-value" style="font-size:.85rem">${venceStr}</div></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <b style="font-size:.85rem">Historial de abonos (${d.historial?.length||0})</b>
          <button class="btn btn-secondary btn-sm" onclick="verHistorial('${d.id}')">Ver todo</button>
        </div>
        ${(d.historial?.slice(-3)||[]).reverse().map(h=>`<div class="historial-item">
          <div><b class="ap">${fmt(h.monto)}</b><span style="display:block;font-size:.75rem;color:var(--muted)">${h.nota||''}</span></div>
          <div style="color:var(--muted);font-size:.8rem">${h.fecha}</div></div>`).join('') || '<div style="color:var(--muted);font-size:.82rem;padding:6px 0">Sin abonos aún.</div>'}
      </div>
    </div>`;
  }).join('');
}

// ── Ahorros ────────────────────────────────────────────────

function addAhorro() {
  const n=q('a-n').value.trim(), o=parseFloat(q('a-o').value)||0;
  const a=parseFloat(q('a-a').value)||0, m=parseFloat(q('a-m').value)||0;
  const f=q('a-f').value;
  if (!n||!o) { toast('Nombre y objetivo requeridos','error'); return; }
  D.ahorros.push({ id:uid(), nombre:n, objetivo:o, actual:a, aporteMensual:m, fecha:f });
  saveData(); renderAhorros(); toast('Meta agregada ✓');
  ['a-n','a-o','a-a','a-m','a-f'].forEach(id => q(id).value='');
}

function aportarAhorro(id) {
  const val = parseFloat(prompt('¿Cuánto vas a aportar?'));
  if (!val||isNaN(val)) return;
  const a = D.ahorros.find(x => x.id === id);
  a.actual = Math.min(a.objetivo, a.actual + val);
  saveData(); renderAhorros(); toast(`Aporte de ${fmt(val)} registrado ✓`);
}

function delAhorro(id) {
  if (!confirm('¿Eliminar meta?')) return;
  D.ahorros = D.ahorros.filter(a => a.id !== id);
  saveData(); renderAhorros();
}

function renderAhorros() {
  const el = q('ahorrosList');
  if (!D.ahorros.length) { el.innerHTML='<div class="empty"><div class="empty-icon">🎯</div><p>Sin metas de ahorro.</p></div>'; return; }
  el.innerHTML = D.ahorros.map(a => {
    const pct  = Math.min(100, Math.round(a.actual/a.objetivo*100));
    const rest = Math.max(0, a.objetivo - a.actual);
    const meses= a.aporteMensual>0 && rest>0 ? Math.ceil(rest/a.aporteMensual)+' meses' : rest===0?'¡Logrado!':'—';
    return `<div class="ahorro-card">
      <div class="ahorro-header">
        <div><div class="ahorro-nombre">🎯 ${a.nombre}</div>
          <div class="ahorro-fecha">${a.fecha?'Meta: '+a.fecha:''} ${a.aporteMensual?'· '+fmt(a.aporteMensual)+'/mes':''}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="aportarAhorro('${a.id}')">+Aporte</button>
          <button class="btn btn-danger" onclick="delAhorro('${a.id}')">✕</button>
        </div>
      </div>
      <div class="ahorro-amounts">
        <div class="ahorro-stat"><span>Actual</span><b class="ap">${fmt(a.actual)}</b></div>
        <div class="ahorro-stat"><span>Objetivo</span><b>${fmt(a.objetivo)}</b></div>
        <div class="ahorro-stat"><span>Restante</span><b class="${rest>0?'an':'ap'}">${fmt(rest)}</b></div>
        <div class="ahorro-stat"><span>Estimado</span><b style="color:var(--accent4)">${meses}</b></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="pb" style="flex:1;height:10px"><div class="pf ok" style="width:${pct}%;background:var(--accent4)"></div></div>
        <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:.9rem;color:var(--accent4);min-width:36px;text-align:right">${pct}%</span>
      </div>
    </div>`;
  }).join('');
}

// ── Resumen ────────────────────────────────────────────────

function renderResumen() {
  const now  = new Date();
  const mes  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const sal  = D.cuentas.reduce((s,c) => s+getSaldo(c.id), 0);
  const mm   = D.movimientos.filter(m => m.fecha.startsWith(mes));
  const ing  = mm.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+m.monto,0);
  const gas  = mm.filter(m=>m.tipo==='gasto').reduce((s,m)=>s+m.monto,0);
  const deu  = D.deudas.reduce((s,d)=>s+Math.max(0,d.total-d.pagado),0);
  const aho  = D.ahorros.reduce((s,a)=>s+a.actual,0);
  const al   = getAlerts();

  q('resCards').innerHTML = `
    <div class="card g"><div class="card-icon">💰</div><div class="card-label">Saldo Total</div>
      <div class="card-value ${sal>=0?'ap':'an'}">${fmt(sal)}</div><div class="card-sub">${D.cuentas.length} cuenta(s)</div></div>
    <div class="card b"><div class="card-icon">📈</div><div class="card-label">Ingresos del Mes</div>
      <div class="card-value ap">${fmt(ing)}</div><div class="card-sub">Este mes</div></div>
    <div class="card o"><div class="card-icon">📉</div><div class="card-label">Gastos del Mes</div>
      <div class="card-value an">${fmt(gas)}</div><div class="card-sub">Balance: <b class="${ing-gas>=0?'ap':'an'}">${fmt(ing-gas)}</b></div></div>
    <div class="card c"><div class="card-icon">🎯</div><div class="card-label">Ahorros</div>
      <div class="card-value" style="color:var(--accent4)">${fmt(aho)}</div><div class="card-sub">Deuda: ${fmt(deu)}</div></div>
    ${al.length?`<div class="card y"><div class="card-icon">🔔</div><div class="card-label">Alertas</div>
      <div class="card-value aw">${al.length}</div><div class="card-sub">pendiente(s)</div></div>`:''}
  `;

  // Gráfico últimos 6 meses
  const meses=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const ms=D.movimientos.filter(m=>m.fecha.startsWith(k));
    meses.push({ label:d.toLocaleDateString('es-CL',{month:'short'}),
      ing:ms.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+m.monto,0),
      gas:ms.filter(m=>m.tipo==='gasto').reduce((s,m)=>s+m.monto,0) });
  }
  const maxV=Math.max(...meses.map(m=>Math.max(m.ing,m.gas)),1);
  q('barChart').innerHTML=meses.map(m=>`<div class="bc-col">
    <div class="bc-bars">
      <div class="bc-bar ing" style="height:${Math.round(m.ing/maxV*90)}%" data-v="${fmt(m.ing)}"></div>
      <div class="bc-bar gas" style="height:${Math.round(m.gas/maxV*90)}%" data-v="${fmt(m.gas)}"></div>
    </div><div class="bc-label">${m.label}</div></div>`).join('');

  // Vencimientos
  q('resVencimientos').innerHTML = D.deudas.filter(d=>d.vence&&(d.total-d.pagado)>0)
    .sort((a,b)=>a.vence.localeCompare(b.vence)).slice(0,5)
    .map(d=>{const diff=Math.ceil((new Date(d.vence)-now)/86400000);
      return `<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.82rem">
        <span>${d.desc}</span><span class="${diff<0?'an':diff<=7?'aw':''}">${diff<0?`Vencida hace ${Math.abs(diff)}d`:`en ${diff}d`}</span></div>`;
    }).join('') || '<span style="color:var(--muted)">Sin vencimientos próximos 🎉</span>';

  // Ahorros
  q('resAhorros').innerHTML = D.ahorros.map(a=>{
    const pct=Math.min(100,Math.round(a.actual/a.objetivo*100));
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:4px">
        <span>${a.nombre}</span><span style="color:var(--accent4)">${pct}%</span></div>
      <div class="pb"><div class="pf ok" style="width:${pct}%;background:var(--accent4)"></div></div>
    </div>`;
  }).join('') || '<span style="color:var(--muted)">Sin metas de ahorro.</span>';
}

// ── Gmail UI ───────────────────────────────────────────────

function renderGmail() {
  if (!D.config.clientId) {
    q('gmailSetupPanel').style.display = 'block';
    q('gmailConnected').style.display  = 'none';
    renderGmailSetup();
    return;
  }
  loadGmailSDK(() => {
    if (gToken) { showGmailConnected(); }
    else { renderGmailLoginBtn(); }
  });
}

function renderGmailSetup() {
  q('gmailSetupPanel').innerHTML = `
    <div class="gmail-setup">
      <h3>📧 Conectar con Gmail</h3>
      <p>Necesitas un Client ID de Google Cloud (gratis). Primero guárdalo en ⚙️ Config.</p>
      <button class="btn btn-secondary" onclick="nav('config', document.querySelectorAll('.tab')[7])">Ir a Configuración →</button>
    </div>`;
}

function renderGmailLoginBtn() {
  q('gmailSetupPanel').innerHTML = `
    <div class="gmail-setup">
      <h3>📧 Iniciar sesión</h3>
      <p>Haz clic para autorizar acceso de solo lectura a Gmail.</p>
      <button class="btn btn-primary" onclick="gmailLogin()">🔑 Conectar con Google</button>
    </div>`;
  q('gmailSetupPanel').style.display = 'block';
  q('gmailConnected').style.display  = 'none';
}

function showGmailConnected() {
  q('gmailSetupPanel').style.display = 'none';
  q('gmailConnected').style.display  = 'block';
  q('syncDot').className   = 'sync-dot online';
  q('syncLabel').textContent = 'Gmail conectado';
  renderLabelsGrid();
  renderReglasAsunto();
  const sel = q('syncDaysSelect');
  if (sel) sel.value = D.config.syncDays || 90;
  renderSyncHistory();
}

function renderLabelsGrid() {
  const grid     = q('labelsGrid');
  if (!grid) return;
  const selected = D.config.gmailLabels || [];
  const names    = [...new Set([...gmailLabels.map(l=>l.name), ...selected])]
    .filter(n => !['CHAT','SENT','SPAM','TRASH','UNREAD','STARRED','IMPORTANT',
      'CATEGORY_SOCIAL','CATEGORY_UPDATES','CATEGORY_FORUMS','CATEGORY_PROMOTIONS'].includes(n));
  grid.innerHTML = (names.length ? names : ['INBOX']).map(name =>
    `<div class="label-chip ${selected.includes(name)?'selected':''}" onclick="toggleLabel('${name}')">${name}</div>`
  ).join('');
}

function toggleLabel(name) {
  const arr = D.config.gmailLabels || [];
  const idx = arr.indexOf(name);
  if (idx>-1) arr.splice(idx,1); else arr.push(name);
  D.config.gmailLabels = arr;
  saveData(); renderLabelsGrid();
}

function addLabelManual() {
  const n = q('newLabel').value.trim();
  if (!n) return;
  if (!D.config.gmailLabels.includes(n)) { D.config.gmailLabels.push(n); saveData(); renderLabelsGrid(); }
  q('newLabel').value = '';
}

function renderReglasAsunto() {
  const el   = q('reglasAsuntoList');
  if (!el) return;
  const cats  = D.config.categorias || CATS_DEFAULT;
  const reglas = getReglasAsunto();

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 110px 150px 70px;gap:8px;padding:0 2px;margin-bottom:6px">
      <span style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px">El asunto contiene…</span>
      <span style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px">Tipo</span>
      <span style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px">Categoría</span>
      <span></span>
    </div>
    ${reglas.map(r => `
      <div style="display:grid;grid-template-columns:1fr 110px 150px 70px;gap:8px;margin-bottom:6px;align-items:center">
        <input value="${r.keyword}" placeholder="ej: cargo en cuenta"
          onchange="updateReglaAsunto('${r.id}','keyword',this.value)"
          style="font-size:.82rem;padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);outline:none">
        <select onchange="updateReglaAsunto('${r.id}','tipo',this.value)"
          style="font-size:.82rem;padding:7px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);outline:none">
          <option value="gasto"   ${r.tipo==='gasto'  ?'selected':''}>📉 Gasto</option>
          <option value="ingreso" ${r.tipo==='ingreso'?'selected':''}>📈 Ingreso</option>
        </select>
        <select onchange="updateReglaAsunto('${r.id}','cat',this.value)"
          style="font-size:.82rem;padding:7px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);outline:none">
          ${cats.map(c=>`<option ${c===r.cat?'selected':''}>${c}</option>`).join('')}
        </select>
        <button class="btn btn-danger" onclick="delReglaAsunto('${r.id}')">✕</button>
      </div>`).join('')}
  `;
}

function updateReglaAsunto(id, campo, valor) {
  D.config.reglasAsunto = D.config.reglasAsunto || [];
  let rule = D.config.reglasAsunto.find(r => r.id === id);
  if (!rule) {
    const def = REGLAS_DEFAULT.find(r => r.id === id);
    rule = def ? { ...def } : null;
    if (rule) D.config.reglasAsunto.push(rule);
  }
  if (rule) { rule[campo] = valor; saveData(); }
}

function delReglaAsunto(id) {
  D.config.reglasAsunto = D.config.reglasAsunto || [];
  const isDefault = REGLAS_DEFAULT.find(r => r.id === id);
  if (isDefault) {
    const existing = D.config.reglasAsunto.find(r => r.id === id);
    if (existing) existing.keyword = '__disabled__';
    else D.config.reglasAsunto.push({ ...isDefault, keyword: '__disabled__' });
  } else {
    D.config.reglasAsunto = D.config.reglasAsunto.filter(r => r.id !== id);
  }
  saveData(); renderReglasAsunto();
}

function addReglaAsunto() {
  D.config.reglasAsunto = D.config.reglasAsunto || [];
  D.config.reglasAsunto.push({ id: uid(), keyword: '', tipo: 'gasto', cat: 'Otro' });
  saveData(); renderReglasAsunto();
}

function renderReglasAsunto() {
  const el = q('reglasAsuntoList');
  if (!el) return;

  const cats = (D.config.categorias && D.config.categorias.length) ? D.config.categorias : CATS_DEFAULT;
  const reglas = getEditableReglasAsunto();
  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  el.innerHTML = `
    <div class="rules-head">
      <span>El asunto contiene...</span>
      <span>Tipo</span>
      <span>Categoria</span>
      <span></span>
    </div>
    ${reglas.length ? reglas.map(r => `
      <div class="rule-row">
        <div class="rule-field">
          <span class="rule-label">Asunto</span>
          <input class="rule-input regla-asunto-keyword" value="${escapeHtml(r.keyword)}" placeholder="ej: cargo en cuenta"
            oninput="updateReglaAsunto('${r.id}','keyword',this.value)">
        </div>
        <div class="rule-field">
          <span class="rule-label">Tipo</span>
          <select class="rule-input" onchange="updateReglaAsunto('${r.id}','tipo',this.value)">
            <option value="gasto" ${r.tipo === 'gasto' ? 'selected' : ''}>Gasto</option>
            <option value="ingreso" ${r.tipo === 'ingreso' ? 'selected' : ''}>Ingreso</option>
          </select>
        </div>
        <div class="rule-field">
          <span class="rule-label">Categoria</span>
          <select class="rule-input" onchange="updateReglaAsunto('${r.id}','cat',this.value)">
            ${cats.map(c => `<option ${c === r.cat ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div class="rule-actions">
          <button class="btn btn-danger btn-rule-delete" onclick="delReglaAsunto('${r.id}')" aria-label="Eliminar regla">Eliminar</button>
        </div>
      </div>
    `).join('') : '<div class="rule-empty">No hay reglas activas. Crea una nueva para empezar.</div>'}
  `;
}

function addReglaAsunto() {
  D.config.reglasAsunto = D.config.reglasAsunto || [];
  const cats = (D.config.categorias && D.config.categorias.length) ? D.config.categorias : CATS_DEFAULT;
  const defaultCat = cats.includes('Otro') ? 'Otro' : cats[0];
  D.config.reglasAsunto.push({ id: uid(), keyword: '', tipo: 'gasto', cat: defaultCat });
  saveData();
  renderReglasAsunto();
  requestAnimationFrame(() => {
    const inputs = q('reglasAsuntoList')?.querySelectorAll('.regla-asunto-keyword');
    const lastInput = inputs && inputs[inputs.length - 1];
    if (lastInput) {
      lastInput.focus();
      lastInput.select();
    }
  });
}

function renderImportModal() {
  const cats    = D.config.categorias || CATS_DEFAULT;
  const cuentas = D.cuentas;
  q('importList').innerHTML = pendingImport.map((p, i) => `
    <div class="import-row">
      <input type="checkbox" ${p.checked?'checked':''} onchange="pendingImport[${i}].checked=this.checked">
      <div class="import-row-data">
        <b>${p.desc || p.subject.slice(0,50)}</b>
        <span>${p.banco||p.from.slice(0,30)} · ${p.fecha}</span>
      </div>
      <select onchange="pendingImport[${i}].tipo=this.value" style="max-width:100px;font-size:.8rem">
        <option value="gasto"   ${p.tipo==='gasto'  ?'selected':''}>📉 Gasto</option>
        <option value="ingreso" ${p.tipo==='ingreso'?'selected':''}>📈 Ingreso</option>
      </select>
      <select onchange="pendingImport[${i}].cat=this.value" style="max-width:130px;font-size:.8rem">
        ${cats.map(c=>`<option ${c===p.cat?'selected':''}>${c}</option>`).join('')}
      </select>
      <select onchange="pendingImport[${i}].cuentaId=this.value" style="max-width:130px;font-size:.8rem">
        <option value="">Sin cuenta</option>
        ${cuentas.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')}
      </select>
      <b class="${p.tipo==='ingreso'?'ap':'an'}" style="min-width:90px;text-align:right;white-space:nowrap">
        ${p.tipo==='ingreso'?'+':'-'}${fmt(p.monto)}
      </b>
    </div>`).join('')
  + `<div style="margin-top:10px;padding:10px 12px;background:var(--surface2);border-radius:8px;font-size:.78rem;color:var(--muted);display:flex;justify-content:space-between;align-items:center">
      <b style="color:var(--text)">${pendingImport.filter(p=>p.checked).length}</b> de ${pendingImport.length} seleccionados
      <span style="cursor:pointer;color:var(--accent)" onclick="pendingImport.forEach(p=>p.checked=true);renderImportModal()">Seleccionar todos</span>
    </div>`;
}

function renderSyncHistory() {
  const el = q('syncHistory');
  if (!el) return;
  el.innerHTML = D.syncHistory.length
    ? D.syncHistory.map(s => `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;font-size:.82rem">
          <span>${s.date}</span>
          <span><b style="color:var(--accent)">${s.count}</b> detectados${s.total?' de '+s.total:''}</span>
        </div>
        <div style="font-size:.74rem;color:var(--muted);margin-top:2px">${s.labels||''}</div>
      </div>`).join('')
    : '<span style="color:var(--muted)">Sin sincronizaciones recientes.</span>';
}

// ── Config ─────────────────────────────────────────────────

function renderConfig() {
  q('cfg-clientId').value  = D.config.clientId || '';
  q('cfg-alertDays').value = D.config.alertDays || 7;
  renderReglasCat();
  renderCategorias();
}

function saveConfig() {
  D.config.clientId  = q('cfg-clientId').value.trim();
  D.config.alertDays = parseInt(q('cfg-alertDays').value) || 7;
  saveData(); renderAlertCount();
  toast('Configuración guardada ✓');
}

function renderReglasCat() {
  const el   = q('reglasCatList');
  const cats = D.config.categorias || CATS_DEFAULT;
  el.innerHTML = (D.config.reglasCat || REGLAS_CAT_DEFAULT).map((r,i) => `
    <div class="fr" style="margin-bottom:8px;align-items:center">
      <div class="fg"><input value="${r.keyword}" onchange="D.config.reglasCat[${i}].keyword=this.value" placeholder="Palabra clave del comercio"></div>
      <div class="fg"><select onchange="D.config.reglasCat[${i}].cat=this.value">
        ${cats.map(c=>`<option ${c===r.cat?'selected':''}>${c}</option>`).join('')}
      </select></div>
      <button class="btn btn-danger" onclick="D.config.reglasCat.splice(${i},1);saveData();renderReglasCat()">✕</button>
    </div>`).join('');
}

function addReglaCat() {
  D.config.reglasCat = D.config.reglasCat || [...REGLAS_CAT_DEFAULT];
  D.config.reglasCat.push({ id:uid(), keyword:'', cat:'Otro' });
  renderReglasCat();
}

function renderCategorias() {
  const el   = q('catsList');
  const cats = D.config.categorias || CATS_DEFAULT;
  el.innerHTML = cats.map((c,i) => `
    <div class="label-chip" style="cursor:default;display:flex;align-items:center;gap:6px">
      ${c}
      <span onclick="D.config.categorias.splice(${i},1);saveData();renderCategorias();populateSelects()"
        style="cursor:pointer;color:var(--neg);font-size:.8rem">✕</span>
    </div>`).join('');
}

function addCategoria() {
  const n = prompt('Nueva categoría:');
  if (!n?.trim()) return;
  D.config.categorias = D.config.categorias || [...CATS_DEFAULT];
  if (!D.config.categorias.includes(n.trim())) {
    D.config.categorias.push(n.trim()); saveData(); renderCategorias(); populateSelects();
  }
}

// ── Selects y filtros ──────────────────────────────────────

function populateSelects() {
  const cats    = D.config.categorias || CATS_DEFAULT;
  const cuentas = D.cuentas;
  ['m-c','r-c'].forEach(id => {
    const el = q(id); if (!el) return;
    el.innerHTML = cats.map(c => `<option>${c}</option>`).join('');
  });
  ['m-ct','r-ct'].forEach(id => {
    const el = q(id); if (!el) return;
    el.innerHTML = '<option value="">Sin cuenta</option>' + cuentas.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
  });
  const fc = q('filtCat');
  if (fc) fc.innerHTML = '<option value="">Todas cat.</option>' + cats.map(c=>`<option>${c}</option>`).join('');
}

function initFilters() {
  const sel = q('filtMes');
  const now = new Date();
  let opts  = '';
  for (let i=11;i>=0;i--) {
    const d   = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    opts += `<option value="${val}">${d.toLocaleDateString('es-CL',{month:'long',year:'numeric'})}</option>`;
  }
  sel.innerHTML = opts + '<option value="all">Todos</option>';
  sel.value     = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  q('m-f').value = today();
}

function checkPendingRec() {
  const n = D.recurrentes.filter(r => r.activo && isPendiente(r)).length;
  if (n > 0) {
    const t = document.querySelectorAll('.tab')[3];
    if (t && !t.querySelector('.tab-badge'))
      t.innerHTML += `<span class="tab-badge">${n}</span>`;
  }
}
