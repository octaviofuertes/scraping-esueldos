import bcrypt from 'bcryptjs';
import { env } from './config/env';
import { prisma } from './database/prisma';

// Fuentes de ejemplo verificadas que funcionan con el scraper (demo)
const DEMO_SOURCES = [
  {
    conventionId: 'farmacia_mendoza',
    calculatorKey: 'farmacia',
    name: 'ADEF Mendoza — Escalas salariales',
    url: 'https://www.adefmendoza.com/gremio-adefm/escalas-salariales/',
    sourceType: 'SINDICATO' as const,
  },
  {
    conventionId: 'camioneros_cct_40_89',
    calculatorKey: 'camioneros',
    name: 'FEDCAM — Planillas de sueldos',
    url: 'https://www.fedcam.org.ar/index.php/gremiales/planillas-de-sueldos/planillas-de-sueldos',
    sourceType: 'FEDERATION' as const,
  },
  {
    conventionId: 'comercio_cct_130_75',
    calculatorKey: 'comercio',
    name: 'CEC Mendoza — Escala salarial',
    url: 'https://cecmendoza.com.ar/inicio/secretarias/gremiales/escala-salarial/',
    sourceType: 'SINDICATO' as const,
  },
];

async function main() {
  // Superadmin demo
  const email = env.superadminEmail.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(env.superadminPassword, 10);
    await prisma.user.create({ data: { name: 'Administrador Demo', email, passwordHash, role: 'SUPERADMIN' } });
    console.log(`✓ Superadmin creado: ${email} / ${env.superadminPassword}`);
  } else {
    console.log(`• Superadmin ya existe: ${email}`);
  }

  // Fuentes de ejemplo
  for (const s of DEMO_SOURCES) {
    const already = await prisma.salaryScaleSource.findFirst({ where: { url: s.url } });
    if (!already) {
      await prisma.salaryScaleSource.create({ data: { ...s, enabled: true, checkFrequency: 24 } });
      console.log(`✓ Fuente demo creada: ${s.name}`);
    }
  }

  console.log('\nSeed completado.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
