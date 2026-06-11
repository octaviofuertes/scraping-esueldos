# 🚀 Guía de Setup Completo

Instrucciones paso a paso para levantar el sistema completo en tu máquina.

## 📋 Pre-requisitos

Instalar primero (si no los tienes):

```bash
# Node.js 20+ (incluye npm)
node --version  # debe ser v20+

# PostgreSQL 14+
psql --version

# Git
git --version
```

## ⚙️ Configuración Inicial

### 1. Clonar Repositorio

```bash
git clone https://github.com/octaviofuertes/scraping-esueldos.git
cd scraping-esueldos
```

### 2. Crear Base de Datos

**Opción A: Línea de comando**

```bash
# Conectarse como usuario postgres
psql -U postgres

# Dentro de psql:
CREATE DATABASE esueldos;
CREATE USER esueldos_user WITH PASSWORD 'tu_contraseña_segura';
ALTER ROLE esueldos_user SET client_encoding TO 'utf8';
ALTER ROLE esueldos_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE esueldos_user SET default_transaction_deferrable TO on;
ALTER ROLE esueldos_user SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE esueldos TO esueldos_user;
\q
```

**Opción B: pgAdmin (GUI)**
- Abrir pgAdmin
- Right-click en "Databases" → "Create Database"
- Nombre: `esueldos`
- Crear usuario en "Login/Group Roles"

### 3. Backend Setup

```bash
cd backend

# Copiar variables de entorno
cp .env.example .env
```

**Editar `.env` con tus valores:**

```env
NODE_ENV=development
PORT=4100

# 🔴 IMPORTANTE: reemplazar con tus datos
DATABASE_URL="postgresql://esueldos_user:tu_contraseña_segura@localhost:5432/esueldos"
JWT_SECRET="tu_secret_super_seguro_cambiar_en_produccion_12345"
GEMINI_API_KEY="tu_api_key_de_google"
GEMINI_MODEL="gemini-1.5-flash"

CORS_ORIGIN=http://localhost:4300
UPLOAD_DIR=uploads
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASSWORD=change_me
```

**Obtener GEMINI_API_KEY:**

1. Ir a [Google AI Studio](https://aistudio.google.com/app/apikeys)
2. Click en "Get API Key"
3. Crear nueva key y copiar
4. Pegarla en `.env` como `GEMINI_API_KEY`

**Instalar dependencias y setup BD:**

```bash
npm install

# Ejecutar migraciones (crea tablas)
npm run prisma:migrate

# Poblar datos iniciales (opcional)
npm run seed

# Verificar que funcionó
npm run prisma:studio  # abre UI de Prisma
```

**Iniciar servidor:**

```bash
npm run dev
```

✅ Deberías ver:
```
[Server] Escuchando en puerto 4100
[ScaleScheduler] Monitoreo automático iniciado
```

### 4. Frontend Setup

**En otra terminal:**

```bash
cd frontend

npm install

npm run dev
```

✅ Deberías ver:
```
VITE v5.0.0  ready in XXX ms

➜  Local:   http://localhost:4300/
```

## ✅ Verificación

### Checklist

- [ ] Backend corriendo en `http://localhost:4100`
- [ ] Frontend corriendo en `http://localhost:4300`
- [ ] Database conectada (sin errores en terminal)
- [ ] Scheduler iniciado (mensaje en consola)

### Probar Login

1. Abrir [http://localhost:4300](http://localhost:4300)
2. Email: `admin@example.com`
3. Password: `change_me`
4. Deberías ver el dashboard de candidatos

## 🔧 Troubleshooting

### Error: "connect ECONNREFUSED 127.0.0.1:5432"

**Causa:** PostgreSQL no está corriendo

**Solución (Windows):**
```powershell
# Iniciar servicio
net start PostgreSQL14

# O usar pgAdmin para verificar
```

**Solución (Mac):**
```bash
# Con Homebrew
brew services start postgresql

# Verificar
psql -U postgres
```

---

### Error: "ERROR: permission denied for schema public"

**Causa:** Usuario sin permisos

**Solución:**
```bash
psql -U postgres -d esueldos

GRANT ALL ON SCHEMA public TO esueldos_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO esueldos_user;
\q
```

---

### Error: "listen EADDRINUSE: address already in use :::4100"

**Causa:** Otro proceso en el puerto 4100

**Solución (Windows PowerShell):**
```powershell
# Encontrar proceso
netstat -ano | findstr :4100

# Matar proceso (reemplazar PID)
taskkill /PID 1234 /F
```

---

### Error: "GEMINI_API_KEY is not configured"

**Causa:** API key faltante o mal configurada

**Solución:**
1. Verificar que `.env` tenga `GEMINI_API_KEY`
2. No debe tener espacios o saltos de línea
3. Debe ser válida desde [AI Studio](https://aistudio.google.com/app/apikeys)
4. Reiniciar el servidor después de cambiar

---

### Error: "Cannot find module '@services/api'"

**Causa:** Frontend no compiló correctamente

**Solución:**
```bash
cd frontend

# Limpiar caché
rm -r node_modules package-lock.json

# Reinstalar
npm install

# Reiniciar dev server
npm run dev
```

## 📊 Estructura del Proyecto

```
scraping-esueldos/
│
├── backend/                  ← Node.js + Express
│   ├── src/
│   │   ├── modules/
│   │   │   ├── scale-monitor/    ← Lógica de scraping
│   │   │   └── auth/             ← Autenticación JWT
│   │   ├── server.ts             ← Entry point
│   │   └── ...
│   ├── prisma/
│   │   └── schema.prisma         ← Definición de BD
│   ├── .env                      ← Variables (NO commitear)
│   ├── .env.example              ← Template
│   └── package.json
│
├── frontend/                 ← React 18 + TypeScript
│   ├── src/
│   │   ├── components/       ← UI components
│   │   ├── pages/            ← Páginas
│   │   ├── hooks/            ← Custom hooks
│   │   ├── services/         ← API client
│   │   ├── App.tsx           ← Entry point
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── README.md                 ← Documentación general
├── SETUP.md                  ← Este archivo
└── .gitignore
```

## 🎯 Próximos Pasos

Después de que todo funciona:

1. **Cambiar credenciales** en `.env`
2. **Configurar fuentes** en el panel → Fuentes
3. **Ejecutar monitoreo manual** desde el panel
4. **Ver candidatos** en el listado principal

## 🚀 Deploy (próximamente)

Instrucciones para llevar a producción en Vercel / Railway / AWS.

## ✨ Características Iniciales

- ✅ Login con JWT
- ✅ Listado de candidatos (con paginación)
- ✅ Modal de detalles
- ✅ Aprobar/Rechazar candidatos
- ⏳ Gestión de fuentes (en desarrollo)
- ⏳ Historial de escalas (en desarrollo)
- ⏳ Upload manual de PDFs (en desarrollo)

## 💡 Tips de Desarrollo

```bash
# Backend: ver logs de base de datos
npm run prisma:studio

# Frontend: verificar tipos
npm run type-check

# Frontend: limpiar caché de Vite
rm -r .vite

# Ambos: actualizar paquetes
npm update
```

---

**¿Dudas?** Revisar los README individuales:
- `backend/README.md`
- `frontend/README.md`
