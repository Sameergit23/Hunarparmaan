/** pnpm db:migrate: apply pending migrations to DATABASE_URL. */
import { loadConfig, loadEnvFiles } from '../config';
import { openDatabase } from './client';

loadEnvFiles();
const config = loadConfig();
const database = await openDatabase(config.DATABASE_URL);
await database.migrate();
await database.close();
console.log(`✓ migrations applied (${database.driver})`);
