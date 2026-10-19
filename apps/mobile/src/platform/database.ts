/**
 * Open the phone's database (ADR 003): expo-sqlite with SQLCipher, keyed with
 * a random 256-bit key that never leaves secure storage (Android Keystore).
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseSync } from 'expo-sqlite';
import migrations from '../../drizzle/migrations';
import { idFactory } from '../core/ids';
import { ensureDeviceId } from '../db/device';
import type { LocalDb } from '../db/outbox';

const DATABASE_NAME = 'hunarpramaan.db';
const KEY_ITEM = 'hp.database-key.v1';

export const ids = idFactory((length) => Crypto.getRandomBytes(length));

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function databaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_ITEM);
  if (existing) return existing;
  const key = hex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_ITEM, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

export interface LocalDatabase {
  db: LocalDb;
  deviceId: string;
}

export async function openLocalDatabase(): Promise<LocalDatabase> {
  const key = await databaseKey();
  const client = openDatabaseSync(DATABASE_NAME);
  // The key must be the first statement on the connection. A raw key in x'…'
  // form skips SQLCipher's slow passphrase derivation on a low-end phone.
  client.execSync(`PRAGMA key = "x'${key}'"`);
  // Refuse to store personal data unencrypted if a build ever lacks SQLCipher.
  const cipher = client.getFirstSync<{ cipher_version: string }>('PRAGMA cipher_version');
  if (!cipher?.cipher_version) {
    client.closeSync();
    throw new Error('SQLCipher is not in this build; check the expo-sqlite plugin in app.config.ts');
  }
  client.execSync('PRAGMA foreign_keys = ON');
  const db = drizzle(client);
  await migrate(db, migrations);
  return { db, deviceId: ensureDeviceId(db, ids.deviceId) };
}
