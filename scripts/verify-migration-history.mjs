import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(root, "prisma", "schema.prisma");
const migrationsPath = join(root, "prisma", "migrations");
const baselineName = "0_init";
const baselinePath = join(migrationsPath, baselineName, "migration.sql");

function fail(messages) {
  for (const message of messages) console.error(`- ${message}`);
  process.exitCode = 1;
}

function modelNames(schema) {
  return [...schema.matchAll(/^model\s+([A-Za-z][A-Za-z0-9_]*)\s+\{/gm)].map(
    (match) => match[1],
  );
}

function migrationNames() {
  return readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function verifyStaticHistory() {
  const schema = readFileSync(schemaPath, "utf8");
  const baseline = readFileSync(baselinePath, "utf8");
  const models = modelNames(schema);
  const migrations = migrationNames();
  const failures = [];

  if (models.length === 0) failures.push("No Prisma models were discovered.");
  if (migrations[0] !== baselineName) {
    failures.push(`Baseline must be the first migration; found ${migrations[0] ?? "none"}.`);
  }

  for (const migration of migrations) {
    const sqlPath = join(migrationsPath, migration, "migration.sql");
    try {
      readFileSync(sqlPath, "utf8");
    } catch {
      failures.push(`Migration ${migration} has no readable migration.sql.`);
    }
  }

  for (const model of models) {
    if (!baseline.includes(`CREATE TABLE "${model}"`)) {
      failures.push(`Baseline does not create model table ${model}.`);
    }
    if (!baseline.includes(`ALTER TABLE "${model}" ENABLE ROW LEVEL SECURITY;`)) {
      failures.push(`Baseline does not enable RLS on ${model}.`);
    }
  }

  const systemConfigBlock = schema.match(
    /model\s+SystemConfig\s+\{[\s\S]*?\n\}/,
  )?.[0];
  const systemConfigBaseline = baseline.match(
    /CREATE TABLE "SystemConfig" \([\s\S]*?\n\);/,
  )?.[0];
  if (!systemConfigBlock?.includes("updatedAt DateTime @default(now()) @updatedAt")) {
    failures.push(
      "SystemConfig.updatedAt must retain its production default and Prisma update behavior.",
    );
  }
  if (
    !systemConfigBaseline?.includes(
      '"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    )
  ) {
    failures.push("Baseline must preserve the production SystemConfig.updatedAt default.");
  }

  if (failures.length > 0) {
    fail(failures);
    return null;
  }

  console.log(
    `Migration history static verification passed (${models.length} models, ${migrations.length} migrations).`,
  );
  return { migrations, models };
}

async function verifyDeployedDatabase(expected) {
  if (!process.env.DATABASE_URL) {
    fail(["DATABASE_URL is required for deployed-database verification."]);
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const tables = await prisma.$queryRawUnsafe(`
      SELECT c.relname AS "tableName", c.relrowsecurity AS "rlsEnabled"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    const migrations = await prisma.$queryRawUnsafe(`
      SELECT migration_name AS "migrationName",
             finished_at AS "finishedAt",
             rolled_back_at AS "rolledBackAt"
      FROM "_prisma_migrations"
      ORDER BY started_at ASC
    `);

    const tableMap = new Map(tables.map((table) => [table.tableName, table.rlsEnabled]));
    const migrationMap = new Map(
      migrations.map((migration) => [migration.migrationName, migration]),
    );
    const failures = [];

    for (const model of expected.models) {
      if (!tableMap.has(model)) failures.push(`Deployed database is missing table ${model}.`);
      else if (tableMap.get(model) !== true) failures.push(`RLS is disabled on table ${model}.`);
    }

    for (const migrationName of expected.migrations) {
      const migration = migrationMap.get(migrationName);
      if (!migration) failures.push(`Migration ${migrationName} has no deployment record.`);
      else if (!migration.finishedAt || migration.rolledBackAt) {
        failures.push(`Migration ${migrationName} is not recorded as successfully applied.`);
      }
    }

    if (failures.length > 0) {
      fail(failures);
      return;
    }

    console.log(
      `Deployed database verification passed (${expected.models.length} model tables with RLS, ${expected.migrations.length} successful migrations).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const expected = verifyStaticHistory();
if (expected && process.argv.includes("--database")) {
  await verifyDeployedDatabase(expected);
}
