const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.sequence.findMany().then(console.log).finally(() => prisma.$disconnect());
