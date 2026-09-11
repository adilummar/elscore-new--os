const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findUnique({ 
  where: { email: 'admin@elscore.internal' }, 
  select: { email: true, status: true, passwordHash: true } 
}).then(u => {
  console.log(JSON.stringify({ 
    email: u?.email, 
    status: u?.status, 
    hashStart: u?.passwordHash?.substring(0, 30) 
  }));
}).catch(e => console.error(e)).finally(() => p.$disconnect());
