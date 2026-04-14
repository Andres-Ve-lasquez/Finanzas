# ControlFinanciero Pro

Aplicación local para control financiero personal con movimientos, cuentas, deudas, ahorros, sincronización Gmail, importación de cartolas y proyección mensual.

## Desarrollo local

```bash
python -m http.server 8080
```

Abrir:

```txt
http://localhost:8080/ControlFinancieroPro.html
```

## Deploy en Vercel

Este proyecto es estático. En Vercel usa:

- Framework Preset: `Other`
- Build Command: vacío
- Output Directory: vacío o `.`

Después del deploy, agrega el dominio de Vercel en Google Cloud OAuth:

- Orígenes autorizados de JavaScript: `https://tu-proyecto.vercel.app`
- URIs de redireccionamiento autorizados: `https://tu-proyecto.vercel.app`
