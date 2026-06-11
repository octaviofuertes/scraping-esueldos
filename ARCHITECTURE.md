# 🏗️ Arquitectura del Sistema

Guía técnica para entender cómo funciona el sistema a nivel de arquitectura.

## 📐 Diagrama de Alto Nivel

```
┌─────────────────────────────────────────────────────────────┐
│                    NAVEGADOR USUARIO                         │
│  [React SPA] → http://localhost:4300                        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  BACKEND API (Node.js)                      │
│   Express Server → http://localhost:4100/api                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Routes                                               │  │
│  │ ├─ /auth/login          → JWT Token                  │  │
│  │ ├─ /admin/scale-candidates  → Listar/Revisar        │  │
│  │ ├─ /admin/scale-sources     → Gestionar fuentes     │  │
│  │ └─ /admin/scale-monitor     → Ejecutar scraping     │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │ Services & Business Logic                           │   │
│  │ ├─ scale-monitor.service.ts   → Scraping/IA        │   │
│  │ ├─ scale-extraction.service.ts → Parsing PDF       │   │
│  │ ├─ auth.service.ts             → JWT               │   │
│  │ └─ scale-helpers.ts            → Utilidades        │   │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │ Data Access (Prisma ORM)                            │   │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬─────────────────────────────────┬──┘
                         │                                  │
        ┌────────────────▼──────────────────┐       ┌──────▼──────────┐
        │   PostgreSQL Database             │       │ Google Gemini   │
        │  (Escalas salariales)             │       │ API (IA)        │
        │                                   │       │                 │
        │ Tables:                           │       │ Extrae datos    │
        │ • User                            │       │ de PDFs         │
        │ • SalaryScaleSource               │       └─────────────────┘
        │ • SalaryScaleCandidate            │
        │ • SalaryScaleVersion              │       ┌──────────────────┐
        │ • SalaryScaleItem                 │       │ URLs Web         │
        │ • AuditLog                        │       │ (CEC, Sindicatos)│
        │                                   │       └──────────────────┘
        └───────────────────────────────────┘
```

## 🔄 Flujo de Scraping (Detallado)

```
┌─ SCHEDULER (cada 6 horas)
│
├─→ runAllMonitors()
│   └─ Para cada fuente habilitada:
│      └─ runSourceMonitor(source)
│         │
│         ├─ DETECTAR PDFS
│         │  ├─ Descargar HTML de URL
│         │  ├─ Parsear <a href> tags
│         │  ├─ Detectar período desde nombre
│         │  └─ Crear lista de documentos
│         │
│         ├─ DESCARGAR Y DEDUPLICAR
│         │  ├─ Descargar archivo PDF
│         │  ├─ Calcular SHA256 del contenido
│         │  └─ ¿Hash existe? → SKIP : PROCESAR
│         │
│         ├─ EXTRACCIÓN CON IA (Gemini)
│         │  ├─ Enviar texto del PDF a Gemini
│         │  ├─ IA extrae períodos + categorías
│         │  ├─ Valida número de CCT
│         │  └─ Devuelve array de períodos
│         │
│         ├─ FILTRO DE PERÍODOS
│         │  ├─ selectRelevantPeriods()
│         │  │  ├─ Preferir mes actual en adelante
│         │  │  └─ Si no hay, devolver el más reciente
│         │  │
│         │  └─ Para cada período:
│         │     └─ ¿Ya aprobado? → SKIP : CREAR CANDIDATO
│         │
│         └─ GUARDAR CANDIDATOS
│            ├─ Crear SalaryScaleCandidate
│            ├─ Status = PENDING_REVIEW
│            └─ Enviar notificación al admin
```

## 🗂️ Estructura de Datos (BD)

### Relaciones Principales

```
User (1) ──────→ (N) AuditLog
                      ↑ registra cambios de

SalaryScaleSource (1) ──────→ (N) SalaryScaleCandidate
                               ↓
                          SalaryScaleVersion (después de aprobar)
                               │
                               ↓
                          (N) SalaryScaleItem
                              ├─ baseSalary
                              ├─ nonRemunerativeAmount
                              └─ hourlyRate
```

### Flujo de Estados

```
┌─────────────────────────────────────────────────────────────┐
│ SalaryScaleCandidate                                        │
│                                                              │
│ DETECTED                ← PDF detectado, texto extraído     │
│   │                                                          │
│   ├→ IA no puede procesar → IGNORED                         │
│   │                                                          │
│   ├→ Gemini arroja error → IGNORED                          │
│   │                                                          │
│   └→ IA extrae datos → PENDING_REVIEW                       │
│        │                                                     │
│        ├→ Admin rechaza → REJECTED                          │
│        │                                                    │
│        └→ Admin aprueba → APPROVED                          │
│             │                                               │
│             └→ Crear SalaryScaleVersion                     │
│                └─ Status = APROBADA                         │
│                   └─ Ahora es "activo" en el sistema        │
│                                                              │
│ Si período ya estaba activo → IGNORED                       │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Componentes Principales

### Backend

#### 1. **scale-scheduler.ts**
```
Responsabilidad: Dispara monitoreo automático
┌────────────────────────────────────┐
│ startScaleScheduler()              │
│ • Configura cron: '0 */6 * * *'    │
│ • Llama runAllMonitors() cada 6h   │
└────────────────────────────────────┘
```

#### 2. **scale-monitor.service.ts**
```
Responsabilidad: Orquesta todo el pipeline
┌────────────────────────────────────┐
│ Funciones principales:             │
│ • runSourceMonitor()               │
│ • triggerAiExtraction()            │
│ • approveCandidate()               │
│ • rejectCandidate()                │
│ • periodAlreadyActive()            │
└────────────────────────────────────┘
```

#### 3. **scale-extraction.service.ts**
```
Responsabilidad: Descarga y extrae contenido
┌────────────────────────────────────┐
│ Funciones principales:             │
│ • downloadAndExtractText()         │
│ • detectDocumentsFromPage()        │
│ • extractScalePeriods() ← GEMINI   │
│ • extractFallbacks()               │
└────────────────────────────────────┘
```

#### 4. **auth.routes.ts**
```
Responsabilidad: Autenticación JWT
┌────────────────────────────────────┐
│ POST   /auth/login      → Token    │
│ GET    /auth/me         → User     │
│ POST   /auth/logout     → Clear    │
└────────────────────────────────────┘
```

### Frontend

#### 1. **App.tsx**
```
Responsabilidad: Router principal
┌─────────────────────────────────────┐
│ <BrowserRouter>                     │
│   <AuthProvider>                    │
│     <Routes>                        │
│       /login    → LoginPage         │
│       /admin    → CandidatesPage    │
│       /admin/*  → Otras páginas     │
│     </Routes>                       │
│   </AuthProvider>                   │
│ </BrowserRouter>                    │
└─────────────────────────────────────┘
```

#### 2. **AuthContext.tsx**
```
Responsabilidad: Estado global de autenticación
┌─────────────────────────────────────┐
│ useAuthContext()                    │
│   ├─ user: User | null              │
│   ├─ isAuthenticated: boolean       │
│   ├─ login(email, password)         │
│   └─ logout()                       │
└─────────────────────────────────────┘
```

#### 3. **useAsync.ts**
```
Responsabilidad: Manejo de operaciones async
┌─────────────────────────────────────┐
│ useAsync(asyncFn, immediate, deps)  │
│   ├─ data: T | null                 │
│   ├─ loading: boolean               │
│   ├─ error: Error | null            │
│   ├─ execute()  → retry con reintento│
│   └─ retry()                        │
└─────────────────────────────────────┘
```

#### 4. **api.ts (services)**
```
Responsabilidad: Cliente HTTP centralizado
┌─────────────────────────────────────┐
│ const apiClient = axios.create()    │
│   • BaseURL: /api                   │
│   • Interceptors: auth + errors     │
│                                     │
│ Servicios exportados:               │
│   • authService                     │
│   • scaleService                    │
└─────────────────────────────────────┘
```

## 🔐 Flujo de Autenticación

```
Usuario tipea email/password
        │
        ├─ LoginPage captura datos
        │
        ├─ Llama authService.login()
        │
        ├─ POST /auth/login → Backend
        │
        ├─ Backend valida contra BD
        │
        ├─ Devuelve { token: "...", user: {...} }
        │
        ├─ Frontend guarda token en localStorage
        │
        ├─ AuthContext.login() actualiza estado
        │
        └─ Redirige a /admin

Cada request HTTP:
  ├─ axios interceptor agrega header
  │  Authorization: Bearer <token>
  │
  └─ Backend valida token con JWT
```

## 🛡️ Validaciones de Seguridad

```
Request HTTP
    │
    ├─ Middleware: CORS check
    │
    ├─ Middleware: JWT validation
    │  └─ Si token inválido/expirado → 401
    │
    ├─ Ruta handler
    │  ├─ Validar request body (Zod)
    │  ├─ Ejecutar lógica
    │  └─ Enviar respuesta
    │
    └─ Error handler
       └─ Log + JSON response
```

## 📊 Manejo de Errores

```
En Backend:
  ├─ HttpError (custom)
  │  ├─ statusCode
  │  ├─ message
  │  └─ details
  │
  ├─ Middleware catch
  │  ├─ Log con contexto
  │  └─ Enviar JSON al cliente
  │
  └─ Axios rechaza promise → Frontend captura

En Frontend:
  ├─ API error → axios rechaza
  │
  ├─ useAsync captura
  │  ├─ setState({ error })
  │  └─ Llamar onError callback
  │
  └─ Componente muestra al usuario
     └─ <div className={styles.error}>{error}</div>
```

## 🎨 Patrón de Componentes React

```typescript
// Típico: Componente funcional + Hooks

const MiComponente: React.FC<Props> = ({ prop1, prop2 }) => {
  // 1. Estados locales
  const [state, setState] = useState<Type>(initial)
  
  // 2. Contexto global
  const { user, logout } = useAuthContext()
  
  // 3. Async data loading
  const { data, loading, error, execute } = useAsync(
    () => apiCall(),
    true,  // immediate
    [dep1, dep2]  // dependencies
  )
  
  // 4. Effects
  useEffect(() => {
    // Setup
    return () => { /* cleanup */ }
  }, [deps])
  
  // 5. Handlers
  const handleClick = useCallback(() => {
    // action
  }, [deps])
  
  // 6. JSX
  return (
    <div className={styles.container}>
      {loading && <div>Cargando...</div>}
      {error && <div className={styles.error}>{error}</div>}
      {data && <ItemList items={data} />}
    </div>
  )
}
```

## 🔄 Data Flow (Redux-like pero sin Redux)

```
Usuario interactúa con componente
        │
        ├─ Componente call handler
        │
        ├─ Handler llama apiService.method()
        │
        ├─ axios hace request
        │
        ├─ Backend procesa + responde
        │
        ├─ Front recibe response/error
        │
        ├─ setState() actualiza componente
        │
        └─ Componente re-renderiza
           └─ Mostrar nuevo estado al usuario
```

## 📈 Performance

### Frontend
- **Code splitting**: Lazy load de rutas con React.lazy
- **Memoization**: useMemo, useCallback para evitar re-renders innecesarios
- **CSS Modules**: Evita bloat global CSS

### Backend
- **Caching**: Resultados de Gemini se guardan en BD
- **Rate limiting**: 15 RPM para Gemini (limits de API)
- **Connection pooling**: Prisma maneja automáticamente

## 🚀 Deployment Considerations

```
Frontend:
  • npm run build → carpeta dist/
  • Servir con nginx / Vercel / GitHub Pages
  • Set VITE_API_URL=https://api.tu-dominio.com

Backend:
  • npm run build → carpeta dist/
  • Deployar con Node process manager (PM2)
  • DATABASE_URL → conexión remota
  • GEMINI_API_KEY → secret environment variable
```

---

**Siguiente lectura**: Ver README específicos de `backend/` y `frontend/`
