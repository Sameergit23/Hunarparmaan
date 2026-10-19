/** The mobiliser's home: the sync line, a new worker, and the workers on this phone. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CircleCheck, LogOut, UserPlus } from 'lucide-react-native';
import { LanguageToggle } from '../components/LanguageToggle';
import { SyncLine } from '../components/SyncLine';
import { Body, Button, ErrorNote, Header, Icon, Label, Screen } from '../components/wire';
import { workersOnPhone, type WorkerRow } from '../db/queries';
import { fill, useI18n } from '../i18n';
import { useServices, useSync } from '../services';
import { border, color, font, radius, role, size } from '../theme';

export function HomeScreen({
  onAddWorker,
  onOpenWorker,
}: {
  onAddWorker: () => void;
  onOpenWorker: (worker: WorkerRow) => void;
}) {
  const { m } = useI18n();
  const { db, session, sync, signOut } = useServices();
  const { pending } = useSync();
  const [blocked, setBlocked] = useState(false);
  // useSync re-renders this screen after every write and ack, so the list stays current.
  const workers = workersOnPhone(db);

  const trySignOut = () => {
    // Workflows 4.4: signing out with unsynced work is blocked.
    if (pending > 0) {
      setBlocked(true);
      sync.nudge();
      return;
    }
    void signOut();
  };

  return (
    <Screen
      footer={
        <Button label={m.home.signOut} icon={LogOut} variant="secondary" onPress={trySignOut} />
      }
    >
      <Header title={m.brand} right={<LanguageToggle />} />
      <SyncLine onRetry={sync.nudge} />
      <Text style={styles.hello}>{fill(m.home.hello, { name: session.user.name })}</Text>
      <Button label={m.home.addWorker} icon={UserPlus} onPress={onAddWorker} />
      <Label>{m.home.workers}</Label>
      {workers.length === 0 ? <Body>{m.home.noWorkers}</Body> : null}
      {workers.map((worker) => (
        <Pressable
          key={worker.id}
          onPress={() => onOpenWorker(worker)}
          disabled={worker.declared}
          accessibilityRole="button"
          style={({ pressed }) => [styles.worker, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.workerName}>{worker.name}</Text>
          {worker.declared ? (
            <View style={styles.done}>
              <Icon icon={CircleCheck} size={16} tint={color.onGreen} />
              <Text style={styles.doneText}>{m.home.declared}</Text>
            </View>
          ) : (
            <Text style={styles.pendingText}>{m.home.notDeclared}</Text>
          )}
        </Pressable>
      ))}
      {blocked && pending > 0 ? (
        <ErrorNote>{fill(m.home.unsynced, { count: pending })}</ErrorNote>
      ) : null}
      <Body size={15}>{m.offline}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hello: { fontFamily: font.heading, fontSize: 24, color: color.ink },
  worker: {
    minHeight: size.workerButton,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: border.quiet.width,
    borderColor: border.quiet.color,
    backgroundColor: color.plate,
  },
  workerName: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 18, color: color.ink },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.chip,
    backgroundColor: role.verified,
  },
  doneText: { fontFamily: font.bodySemiBold, fontSize: 14, color: color.onGreen },
  pendingText: {
    fontFamily: font.bodyMedium,
    fontSize: 14,
    color: color.ink,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.chip,
    borderWidth: border.quiet.width,
    borderColor: color.ink,
  },
});
