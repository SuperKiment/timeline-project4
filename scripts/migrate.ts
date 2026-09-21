import { getConfig } from '../src/lib/server/config';
import { getDb } from '../src/lib/server/db/index';
import { runMigrations } from '../src/lib/server/db/migrate';

const config = getConfig();
const db = getDb();
runMigrations(db);
console.log(`Migrations applied to ${config.dbPath}`);
