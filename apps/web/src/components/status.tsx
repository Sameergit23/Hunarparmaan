import {
  BadgeCheck,
  CalendarClock,
  Check,
  Clock,
  Copy,
  Eye,
  Hash,
  Link2,
  PhoneOff,
  UserX,
  MapPinOff,
  PenLine,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import { BLOCKING_FLAGS, type FlagKind, type SessionStatus } from '@hunarpramaan/contracts';
import type { Messages } from '@/lib/i18n';
import { Chip } from './wire';

export function StatusChip({ status, m }: { status: SessionStatus; m: Messages }) {
  const label = m.sessions.statusLabel[status];
  switch (status) {
    case 'approved':
      return (
        <Chip tone="done" icon={BadgeCheck}>
          {label}
        </Chip>
      );
    case 'signed':
      return (
        <Chip tone="neutral" icon={PenLine}>
          {label}
        </Chip>
      );
    case 'returned':
      return (
        <Chip tone="neutral" icon={Undo2}>
          {label}
        </Chip>
      );
    case 'in_progress':
      return (
        <Chip tone="progress" icon={Clock}>
          {label}
        </Chip>
      );
  }
}

export function OutcomeChip({ outcome, m }: { outcome: 'pass' | 'fail'; m: Messages }) {
  return outcome === 'pass' ? (
    <Chip tone="done" icon={Check}>
      {m.sessions.outcome.pass}
    </Chip>
  ) : (
    <Chip tone="neutral" icon={X}>
      {m.sessions.outcome.fail}
    </Chip>
  );
}

const FLAG_ICONS: Record<FlagKind, typeof Hash> = {
  chain_broken: Link2,
  clock_drift: CalendarClock,
  mock_gps: MapPinOff,
  geofence: MapPinOff,
  hash_mismatch: Hash,
  reused_clip: Copy,
  result_mismatch: TriangleAlert,
  invalid_event: TriangleAlert,
  vision_evidence: Eye,
  vision_quality: Eye,
  vision_conflict: Eye,
  similar_clip: Copy,
  account_draining: UserX,
  device_draining: PhoneOff,
  device_lost: PhoneOff,
};

export const isBlocking = (kind: FlagKind) => BLOCKING_FLAGS.includes(kind);

/**
 * Red when the flag blocks approval (an error); yellow when an automatic check
 * only suggests a look. Always with an icon and words.
 */
export function FlagChip({ kind, m }: { kind: FlagKind; m: Messages }) {
  return (
    <Chip tone={isBlocking(kind) ? 'error' : 'ai'} icon={FLAG_ICONS[kind]}>
      {m.flags.kind[kind]}
    </Chip>
  );
}
