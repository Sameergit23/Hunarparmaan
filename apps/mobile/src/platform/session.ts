/**
 * The signed-in account, kept in secure storage (workflows 4.2 rule 4: the
 * phone keeps the token in encrypted storage). Work recorded offline is
 * signed with this account's actor, so it survives restarts without a network.
 */
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { SessionUser, type Actor } from '@hunarpramaan/contracts';

const SESSION_ITEM = 'hp.session.v1';

const StoredSession = z.object({
  token: z.string().min(1),
  expiresAt: z.string(),
  user: SessionUser,
  apiUrl: z.string(),
});
export type StoredSession = z.infer<typeof StoredSession>;

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_ITEM);
  if (!raw) return null;
  const parsed = StoredSession.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_ITEM, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_ITEM);
}

export function actorOf(session: StoredSession): Actor {
  return { kind: 'user', userId: session.user.id, role: session.user.role };
}
