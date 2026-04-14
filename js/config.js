// ============================================================
// CONFIG.JS — Constantes y valores por defecto
// ============================================================

const STORAGE_KEY = 'cfpro_v3';

const CATS_DEFAULT = [
  'Sueldo','Freelance','Transferencia','Alimentación','Transporte',
  'Vivienda','Salud','Educación','Entretención','Ropa','Servicios',
  'Tecnología','Deuda','Ahorro','Otro'
];

// Reglas: asunto contiene keyword → tipo + categoría automática
// IMPORTANTE: usar el asunto EXACTO de tus correos bancarios
const REGLAS_DEFAULT = [
  // Banco de Chile
  { id:'r1',  keyword:'cargo en cuenta',                  tipo:'gasto',   cat:'Otro' },
  { id:'r2',  keyword:'transferencia a terceros',          tipo:'gasto',   cat:'Transferencia' },
  { id:'r3',  keyword:'aviso de transferencia de fondos',  tipo:'ingreso', cat:'Transferencia' },
  { id:'r4',  keyword:'transferencia recibida',            tipo:'ingreso', cat:'Transferencia' },
  { id:'r5',  keyword:'pago de cuenta',                    tipo:'gasto',   cat:'Servicios' },
  { id:'r6',  keyword:'cobro automático',                  tipo:'gasto',   cat:'Servicios' },
  { id:'r7',  keyword:'cobro automatico',                  tipo:'gasto',   cat:'Servicios' },
  { id:'r8',  keyword:'cargo de cuenta',                   tipo:'gasto',   cat:'Servicios' },
  { id:'r9',  keyword:'compra con tarjeta',                tipo:'gasto',   cat:'Otro' },
  { id:'r10', keyword:'retiro cajero',                     tipo:'gasto',   cat:'Otro' },
  { id:'r11', keyword:'depósito en cuenta',                tipo:'ingreso', cat:'Transferencia' },
  { id:'r12', keyword:'deposito en cuenta',                tipo:'ingreso', cat:'Transferencia' },
  { id:'r13', keyword:'abono en cuenta',                   tipo:'ingreso', cat:'Transferencia' },
  { id:'r14', keyword:'transferencia enviada',             tipo:'gasto',   cat:'Transferencia' },
  { id:'r15', keyword:'sueldo',                            tipo:'ingreso', cat:'Sueldo' },
  { id:'r16', keyword:'remuneración',                      tipo:'ingreso', cat:'Sueldo' },
  { id:'r17', keyword:'aviso de pago',                     tipo:'gasto',   cat:'Servicios' },
  { id:'r18', keyword:'aviso de cobro',                    tipo:'gasto',   cat:'Servicios' },
  { id:'r19', keyword:'pago recibido',                     tipo:'ingreso', cat:'Otro' },
];

// Reglas de auto-categorización por descripción (para el comercio detectado)
const REGLAS_CAT_DEFAULT = [
  { id:'c1', keyword:'supermercado',  cat:'Alimentación' },
  { id:'c2', keyword:'lider',         cat:'Alimentación' },
  { id:'c3', keyword:'jumbo',         cat:'Alimentación' },
  { id:'c4', keyword:'unimarc',       cat:'Alimentación' },
  { id:'c5', keyword:'farmacia',      cat:'Salud' },
  { id:'c6', keyword:'cruz verde',    cat:'Salud' },
  { id:'c7', keyword:'salcobrand',    cat:'Salud' },
  { id:'c8', keyword:'uber',          cat:'Transporte' },
  { id:'c9', keyword:'cabify',        cat:'Transporte' },
  { id:'c10',keyword:'netflix',       cat:'Entretención' },
  { id:'c11',keyword:'spotify',       cat:'Entretención' },
  { id:'c12',keyword:'steam',         cat:'Entretención' },
  { id:'c13',keyword:'copec',         cat:'Transporte' },
  { id:'c14',keyword:'shell',         cat:'Transporte' },
  { id:'c15',keyword:'falabella',     cat:'Ropa' },
  { id:'c16',keyword:'ripley',        cat:'Ropa' },
  { id:'c17',keyword:'paris',         cat:'Ropa' },
  { id:'c18',keyword:'amazon',        cat:'Tecnología' },
];

// Detecta el banco por el remitente del correo
function detectBanco(from) {
  const f = from.toLowerCase();
  if (f.includes('bancochile') || f.includes('banchile')) return 'Banco de Chile';
  if (f.includes('bancoestado') || f.includes('banco estado')) return 'BancoEstado';
  if (f.includes('santander')) return 'Santander';
  if (f.includes('bci'))       return 'BCI';
  if (f.includes('scotiabank')) return 'Scotiabank';
  if (f.includes('itau') || f.includes('itaú')) return 'Itaú';
  if (f.includes('falabella'))  return 'Banco Falabella';
  if (f.includes('ripley'))     return 'Banco Ripley';
  if (f.includes('security'))   return 'Banco Security';
  if (f.includes('bice'))       return 'Banco BICE';
  return '';
}

// Formatea monto en pesos chilenos
const fmt = n => '$' + Math.abs(Math.round(n)).toLocaleString('es-CL');
const today = () => new Date().toISOString().split('T')[0];
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const q     = id => document.getElementById(id);
