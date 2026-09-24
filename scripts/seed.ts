import { getDb } from '../src/lib/server/db/index';
import { runMigrations } from '../src/lib/server/db/migrate';
import { seedHistoire } from '../src/lib/server/seed/histoire';

const db = getDb();
runMigrations(db);
const count = seedHistoire(db);
console.log(`Seeded histoire entries: ${count}`);
