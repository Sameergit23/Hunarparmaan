/**
 * The app shell: fonts, the encrypted database, the session and sync, then a
 * small stack of screens. The walking skeleton of gate G1: a declaration
 * recorded offline reaches the dashboard after sync.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, View } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Language } from '@hunarpramaan/contracts';
import type { MappingSuggestion } from '@hunarpramaan/mapping';
import { ErrorNote, Header, Screen } from './components/wire';
import { appendEvent } from './db/outbox';
import { I18nProvider, useI18n } from './i18n';
import { bundledPack } from './pack';
import { ids, openLocalDatabase, type LocalDatabase } from './platform/database';
import { actorOf, clearSession, loadSession, type StoredSession } from './platform/session';
import { startSyncService, type SyncService } from './platform/sync-service';
import { ConsentScreen } from './screens/ConsentScreen';
import { DevSignInScreen } from './screens/DevSignInScreen';
import { DoneScreen } from './screens/DoneScreen';
import { HomeScreen } from './screens/HomeScreen';
import { InterviewScreen } from './screens/InterviewScreen';
import { RegisterWorkerScreen } from './screens/RegisterWorkerScreen';
import { ServicesProvider, type Services } from './services';
import { color, fontFiles } from './theme';

type Route =
  | { name: 'home' }
  | { name: 'register' }
  | { name: 'consent'; workerId: string; language: Language }
  | { name: 'interview'; workerId: string; language: Language }
  | { name: 'done'; suggestion: MappingSuggestion | null };

export function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <StatusBar style="dark" />
        <Boot />
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Boot() {
  const { m } = useI18n();
  const [fontsLoaded] = useFonts(fontFiles);
  const [database, setDatabase] = useState<LocalDatabase | Error | null>(null);
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);
  const pack = useMemo(() => bundledPack(), []);

  useEffect(() => {
    openLocalDatabase().then(setDatabase, (error: unknown) =>
      setDatabase(error instanceof Error ? error : new Error(String(error))),
    );
    loadSession().then(setSession, () => setSession(null));
  }, []);

  if (database instanceof Error) {
    return (
      <Screen>
        <Header title={m.error.title} />
        <ErrorNote>{`${m.error.database} ${database.message}`}</ErrorNote>
      </Screen>
    );
  }
  if (!fontsLoaded || !database || session === undefined) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.ground,
        }}
      >
        <ActivityIndicator color={color.ink} size="large" />
      </View>
    );
  }
  return <SignedIn database={database} pack={pack} session={session} onSession={setSession} />;
}

function SignedIn({
  database,
  pack,
  session,
  onSession,
}: {
  database: LocalDatabase;
  pack: Services['pack'];
  session: StoredSession | null;
  onSession: (session: StoredSession | null) => void;
}) {
  const { setLang } = useI18n();
  const token = useRef<string | null>(session?.token ?? null);
  token.current = session?.token ?? null;
  const [sync, setSync] = useState<SyncService | null>(null);
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);

  // One sync loop per database; it reads the current token on every pass.
  useEffect(() => {
    const service = startSyncService({
      db: database.db,
      deviceId: database.deviceId,
      getToken: () => token.current,
    });
    setSync(service);
    return service.stop;
  }, [database]);

  useEffect(() => {
    if (session) sync?.nudge();
  }, [session, sync]);

  const push = useCallback((route: Route) => setStack((s) => [...s, route]), []);
  const replace = useCallback((route: Route) => setStack((s) => [...s.slice(0, -1), route]), []);
  const home = useCallback(() => setStack([{ name: 'home' }]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length <= 1) return false;
      pop();
      return true;
    });
    return () => subscription.remove();
  }, [stack.length, pop]);

  const services = useMemo<Services | null>(() => {
    if (!session || !sync) return null;
    return {
      db: database.db,
      deviceId: database.deviceId,
      pack,
      session,
      sync,
      record: (type, payload, options) => {
        const event = appendEvent(
          database.db,
          {
            deviceId: database.deviceId,
            actor: actorOf(session),
            now: () => new Date(),
            newEventId: ids.eventId,
          },
          type,
          payload,
          options,
        );
        sync.nudge();
        return event;
      },
      newEntityId: ids.entityId,
      signOut: async () => {
        await clearSession();
        onSession(null);
        home();
      },
    };
  }, [database, pack, session, sync, onSession, home]);

  if (!session) {
    return <DevSignInScreen deviceId={database.deviceId} onSignedIn={onSession} />;
  }
  if (!services) return null;

  const route = stack.at(-1) ?? { name: 'home' };
  // Worker screens speak the worker's language (NFR-05).
  const startWorker = (workerId: string, language: Language, consented: boolean) => {
    setLang(language);
    push(
      consented
        ? { name: 'interview', workerId, language }
        : { name: 'consent', workerId, language },
    );
  };

  return (
    <ServicesProvider value={services}>
      {route.name === 'home' ? (
        <HomeScreen
          onAddWorker={() => push({ name: 'register' })}
          onOpenWorker={(w) => startWorker(w.id, w.language, w.consented)}
        />
      ) : route.name === 'register' ? (
        <RegisterWorkerScreen
          onBack={pop}
          onRegistered={(workerId, language) => {
            setLang(language);
            replace({ name: 'consent', workerId, language });
          }}
        />
      ) : route.name === 'consent' ? (
        <ConsentScreen
          workerId={route.workerId}
          language={route.language}
          onAgreed={() =>
            replace({ name: 'interview', workerId: route.workerId, language: route.language })
          }
          onDeclined={home}
        />
      ) : route.name === 'interview' ? (
        <InterviewScreen
          workerId={route.workerId}
          language={route.language}
          onBack={home}
          onDone={({ suggestion }) => replace({ name: 'done', suggestion })}
        />
      ) : (
        <DoneScreen suggestion={route.suggestion} onHome={home} />
      )}
    </ServicesProvider>
  );
}
