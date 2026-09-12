require('ts-node/register'); require('tsconfig-paths/register'); const { SEQUENCES } = require('./prisma/seed.ts'); console.log('SEQUENCES length:', SEQUENCES?.length);
