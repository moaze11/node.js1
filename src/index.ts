import 'dotenv/config';
import app from './app';
import { prisma } from './types/config';

// Seed roles
async function seedRoles() {
  const roles = ['SuperAdmin', 'Admin', 'Agent', 'User'];
  for (const name of roles) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
}

seedRoles().catch(console.error);

// Start server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✅ Auth API running on http://localhost:${PORT}`);
  console.log(`📚 Swagger docs: http://localhost:${PORT}/api-docs`);
});

export default app;
