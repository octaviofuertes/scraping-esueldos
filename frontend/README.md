# Frontend - React + TypeScript + Vite

Frontend moderno y limpio para el sistema de scraping de escalas salariales.

## Stack Tecnológico

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool ultra rápido
- **React Router** - Navigation
- **Axios** - HTTP client
- **CSS Modules** - Estilos scoped

## Estructura de Carpetas

```
src/
├── components/        # Componentes reutilizables
│   ├── Layout/       # Header, Footer, etc.
│   ├── Table/        # Tabla genérica
│   └── ProtectedRoute.tsx
├── contexts/         # React Contexts (Auth, etc.)
├── hooks/            # Custom hooks
│   ├── useAuth.ts
│   └── useAsync.ts
├── pages/            # Páginas completas
│   ├── LoginPage.tsx
│   └── CandidatesPage.tsx
├── services/         # API client y lógica
│   └── api.ts
├── types/            # TypeScript types globales
└── utils/            # Utilidades
```

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

Abre [http://localhost:4300](http://localhost:4300)

El servidor levanta con proxy a `http://localhost:4100/api`

## Build para producción

```bash
npm run build
```

## Características Principales

### Autenticación
- Login con email/password
- Token JWT guardado en localStorage
- Restauración de sesión automática
- Redirección a login para usuarios no autenticados

### Componentes
- **Header** - Navegación y user menu
- **Table** - Tabla genérica y reutilizable
- **ProtectedRoute** - Wrapper para rutas privadas

### Hooks Custom
- `useAuth` - Estado de autenticación
- `useAsync` - Operaciones asincrónicas con retry automático

### Servicios API
- Endpoints completamente tipados con TypeScript
- Interceptores para agregar token en requests
- Manejo de errores global (401 → logout)

## Estilos

Usamos **CSS Modules** para evitar conflictos de nombres. Cada componente tiene su `.module.css`:

```tsx
import styles from './Button.module.css'

<button className={styles.primary}>Click</button>
```

## Tipado TypeScript

Todos los tipos están en `src/types/index.ts`. Interfaces para:
- `User` - Usuario autenticado
- `SalaryScaleCandidate` - Escala detectada
- `SalaryCategory` - Categoría salarial
- `DiffData` - Cambios entre versiones

## Próximas Páginas (placeholders)

- `/admin/sources` - Gestión de fuentes
- `/admin/history` - Historial de escalas
- `/admin/upload` - Carga manual de PDFs

## Code Quality

```bash
# Verificar tipos
npm run type-check

# Lint
npm run lint
```

## Notas para Desarrolladores

1. **Imports con alias** - Usar `@` para importar desde `src`:
   ```tsx
   import { useAuth } from '@hooks/useAuth'
   import type { User } from '@types/index'
   ```

2. **Componentes funcionales** - Solo usamos functional components con hooks

3. **Manejo de estados** - `useState` para local, `Context` para global

4. **API calls** - Siempre a través de `services/api.ts`

5. **Errores** - Mostrar al usuario con mensajes claros
