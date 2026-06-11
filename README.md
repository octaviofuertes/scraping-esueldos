# 📊 Sistema de Scraping de Escalas Salariales

Sistema profesional e integral para monitorear, extraer y gestionar escalas salariales de convenios. **Backend en Node.js/Express + PostgreSQL**, **Frontend en React + TypeScript**.

## 🎯 Características

### Backend
- ✅ **Scraping automático** cada 6 horas de fuentes configurables
- ✅ **Extracción con IA** usando Google Gemini para detectar múltiples períodos
- ✅ **Deduplicación** mediante SHA256 hash
- ✅ **Revisión humana** antes de aprobar escalas
- ✅ **Control de cambios** con diff automático
- ✅ **Auditoría completa** de todas las acciones

### Frontend
- ✅ **Interfaz moderna** con React 18
- ✅ **TypeScript** para type safety
- ✅ **Componentes reutilizables** y bien documentados
- ✅ **Responsive design** mobile-first
- ✅ **Autenticación** con JWT
- ✅ **Real-time updates** de candidatos

## 🛠️ Tech Stack

| Componente | Tecnología |
|-----------|-----------|
| **Backend** | Node.js 20+ + Express.js + TypeScript |
| **Frontend** | React 18 + TypeScript + Vite |
| **BD** | PostgreSQL 14+ + Prisma ORM |
| **Auth** | JWT |
| **IA** | Google Gemini API |
| **HTTP** | Axios (client), Express (server) |

## 📋 Requisitos

- **Node.js** 20+ y npm
- **PostgreSQL** 14+
- **Google Gemini API Key**
- **Git**

## 🚀 Instalación Rápida

### 1. Clonar el repositorio

```bash
git clone https://github.com/octaviofuertes/scraping-esueldos.git
cd scraping-esueldos
```

### 2. Backend

```bash
cd backend

# Instalar dependencias
npm install

# Crear archivo .env (copiar de .env.example)
cp .env.example .env

# Completar variables en .env:
# - DATABASE_URL=postgresql://user:password@localhost:5432/esueldos
# - GEMINI_API_KEY=tu_api_key
# - JWT_SECRET=tu_secret_super_seguro
```

**Configurar Base de Datos:**

```bash
# Crear DB (si no existe)
createdb esueldos

# Ejecutar migraciones
npm run prisma:migrate

# (Opcional) Seed con datos iniciales
npm run seed
```

**Iniciar servidor:**

```bash
npm run dev
```

✅ Backend corriendo en `http://localhost:4100`

### 3. Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar dev server
npm run dev
```

✅ Frontend corriendo en `http://localhost:4300`

### 4. Usar la aplicación

Abre [http://localhost:4300](http://localhost:4300)

**Credenciales por defecto:**
- Email: `admin@example.com`
- Password: `change_me`

> ⚠️ Cambiar credenciales en producción

## 📁 Estructura del Proyecto

```
scraping-esueldos/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── scale-monitor/        # Monitoreo y extracción
│   │   │   ├── auth/                 # Autenticación
│   │   │   ├── salary-scales/        # Lógica de escalas
│   │   │   └── audit/                # Auditoría
│   │   ├── database/                 # Conexión Prisma
│   │   ├── middlewares/              # Auth, errores, etc.
│   │   └── server.ts                 # Entry point
│   ├── prisma/
│   │   ├── schema.prisma             # Definición de BD
│   │   └── migrations/               # Versionado de BD
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/               # Componentes React
│   │   ├── contexts/                 # React Contexts
│   │   ├── hooks/                    # Custom hooks
│   │   ├── pages/                    # Páginas
│   │   ├── services/                 # API client
│   │   ├── types/                    # TypeScript types
│   │   └── App.tsx                   # Entry point
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
└── README.md (este archivo)
```

## 🔄 Flujo de Scraping Explicado

```
1. SCHEDULER (cada 6 horas)
   └─ Revisa fuentes habilitadas con checkFrequency

2. DESCARGA
   └─ Busca PDFs en URLs, calcula SHA256

3. DEDUPLICACIÓN
   └─ ¿Hash ya existe? → Ignorar : Procesar

4. EXTRACCIÓN CON IA (Gemini)
   └─ Lee texto del PDF → Detecta múltiples períodos

5. FILTRO DE MESES
   └─ ¿Período ya aprobado? → Ignorar : Crear candidato

6. REVISIÓN HUMANA
   └─ Admin aprueba/rechaza desde el panel

7. ALMACENAMIENTO
   └─ Crea SalaryScaleVersion + Items
```

Ejemplo: Un PDF de Farmacia con Oct-25, Nov-25, Dic-25:
- Si Oct-25 ya está aprobado → solo crea candidatos para Nov y Dic
- Si ninguno está aprobado → crea 3 candidatos

## 🔐 Seguridad

- JWT para autenticación
- Tokens guardados en localStorage
- Interceptor de axios agrega token en cada request
- 401 → logout automático
- SQL Injection: Prisma ORM previene
- CORS configurado en backend
- .env con secretos NO se commitea (está en .gitignore)

## 📊 Base de Datos

Schemas principales:

- `User` - Usuarios del sistema
- `SalaryScaleSource` - Fuentes a monitorear
- `SalaryScaleCandidate` - PDFs detectados en espera
- `SalaryScaleVersion` - Escalas aprobadas
- `SalaryScaleItem` - Categorías dentro de una versión
- `AuditLog` - Registro de cambios

Ver estructura completa en `backend/prisma/schema.prisma`

## 🧪 Desarrollo

### Backend

```bash
# Type checking
npm run type-check

# Lint
npm run lint

# Tests (próximamente)
npm run test
```

### Frontend

```bash
# Type checking
npm run type-check

# Lint
npm run lint

# Build
npm run build
```

## 📚 Documentación

- **Backend**: Ver `backend/README.md`
- **Frontend**: Ver `frontend/README.md`

## 🐛 Solución de Problemas

### Error: "listen EADDRINUSE"
```bash
# Puerto 4100/4300 ya en uso. Matar proceso:
# Windows:
netstat -ano | findstr :4100
taskkill /PID <PID> /F

# Mac/Linux:
lsof -i :4100
kill -9 <PID>
```

### Error: "DATABASE_URL not found"
- Copiar `.env.example` a `.env`
- Actualizar valores en `.env`

### Error: "GEMINI_API_KEY is required"
- Crear API key en [AI Studio](https://aistudio.google.com/app/apikeys)
- Agregarla en `.env`

## 🚢 Deployment

### Heroku / Railway

```bash
# Backend
npm run build
npm run start

# Frontend
npm run build
# Servir la carpeta dist con nginx/express static
```

### Docker (próximamente)

## 📝 Licencia

MIT

## 👤 Autor

**Octavio Fuertes**
- Email: octaviofuertes21@gmail.com
- GitHub: [@octaviofuertes](https://github.com/octaviofuertes)

---

**Rama actual**: `refactor/react-clean-architecture`

Construido con ❤️ para simplificar la gestión de escalas salariales.
