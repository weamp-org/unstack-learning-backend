// Idempotent seed for the launch subject catalogue (official NaCCA names;
// familiar pre-reform names kept in descriptions for findability).
// Run with: pnpm prisma db seed
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: '.env.local' });
config({ path: '.env' });

const SUBJECTS = [
  {
    name: 'Biology',
    slug: 'biology',
    description: 'The study of living organisms, offered as an SHS elective.',
  },
  {
    name: 'Chemistry',
    slug: 'chemistry',
    description:
      'The study of matter and its interactions, offered as an SHS elective.',
  },
  {
    name: 'Physics',
    slug: 'physics',
    description:
      'The study of matter, energy, and their interactions, offered as an SHS elective.',
  },
  {
    name: 'Additional Mathematics',
    slug: 'additional-mathematics',
    description:
      'Elective mathematics for SHS (formerly Elective Mathematics).',
  },
  {
    name: 'Mathematics',
    slug: 'mathematics',
    description: 'Core mathematics for SHS (formerly Core Mathematics).',
  },
  {
    name: 'General Science',
    slug: 'general-science',
    description:
      'Core science for SHS under the new curriculum (formerly Integrated Science).',
  },
];

async function main() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  try {
    for (const subject of SUBJECTS) {
      await prisma.subject.upsert({
        where: { slug: subject.slug },
        update: { name: subject.name, description: subject.description },
        create: subject,
      });
    }
    console.log(`Seeded ${SUBJECTS.length} subjects`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
