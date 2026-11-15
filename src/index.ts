import express from 'express';
import { PrismaClient } from '@prisma/client';
import routes from './routes';

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

// Seed roles
async function seedRoles() {
  const roles = [
    { name: 'SuperAdmin' },
    { name: 'Admin' },
    { name: 'Agent' },
    { name: 'User' }
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role
    });
  }
}

seedRoles().catch(console.error);

// Routes
app.use(routes);

// Start server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✅ Auth API running on http://localhost:${PORT}`);
});

export default app;
