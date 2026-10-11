import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env["SEED_ADMIN_EMAIL"] ?? "admin@carelens.ai";
  const password = process.env["SEED_ADMIN_PASSWORD"] ?? "admin1234";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed: admin already present (${email})`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, passwordHash, name: "CareLens Admin", role: "ADMIN" },
  });
  console.log(`Seed: created admin (${email})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());