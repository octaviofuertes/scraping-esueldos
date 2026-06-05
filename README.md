# Scraping eSueldos — Demo de monitoreo de escalas salariales

Sistema que demuestra el scraping y monitoreo automático de escalas
salariales de convenios colectivos argentinos (CCT). Detecta documentos en sitios oficiales,
extrae los datos con IA (Gemini), valida el convenio y deja todo listo para revisión humana.

## Requisitos
- Node.js 18+
- PostgreSQL corriendo en `localhost:5432` (la base `scraping_esueldos` ya fue creada)

## Arrancar el backend (puerto 4100)
```bash
cd backend
npm install            # ya ejecutado
npx prisma migrate dev # ya ejecutado (crea tablas)
npm run seed           # crea el superadmin demo + fuentes de ejemplo (ya ejecutado)
npm run dev
```

## Arrancar el frontend (puerto 4300)
```bash
cd frontend
npm install            # ya ejecutado
npm start
```
Abrir http://localhost:4300

## Acceso demo
- **Email:** admin@demo.com
- **Contraseña:** admin123

## Qué incluye (módulo de scraping, sin soporte ni usuarios)
1. **Sitios monitoreados** — configurar fuentes (sindicatos, federaciones), ejecutar scraping manual, diagnóstico en vivo.
2. **Escalas para revisar** — documentos detectados, extracción con IA, carga manual de PDF, aprobación/rechazo.
3. **Escalas aprobadas** — historial por convenio y período (lo que consumiría una calculadora).
4. **Cambios de convenio** — actas/acuerdos normativos detectados.

## Fuentes de ejemplo precargadas (seed)
- Farmacia Mendoza (ADEF) — PDFs directos
- Camioneros (FEDCAM) — sub-páginas Joomla por mes
- Comercio (CEC Mendoza) — página multi-convenio (filtra Comercio 130/75)

## Notas técnicas
- La extracción de datos usa Gemini (`GEMINI_API_KEY` en `backend/.env`). Si no hay cuota,
  el documento queda detectado y se puede re-analizar luego.
- Tres capas protegen contra el convenio equivocado: filtrado por título/URL, validación de CCT por regex, y validación por IA.
- El scheduler corre cada 6 horas; también se puede ejecutar manualmente desde la UI.
