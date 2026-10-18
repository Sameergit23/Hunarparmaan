/**
 * Status chips for the admin panel (app flow section 6): an icon and a word
 * each. Green fill for done, black fill for in progress, a black outline for
 * neutral; a lost phone has the outline with a red icon, because it is an
 * error state, and always the word.
 */
import { CircleCheck, CircleSlash, Hourglass, Lock, MailPlus, TriangleAlert } from 'lucide-react';
import type { AccountStatus, DeviceStatus, InviteStatus } from '@hunarpramaan/contracts';
import type { Messages } from '@/lib/i18n';
import { Chip } from './wire';

export function AccountStatusChip({ status, m }: { status: AccountStatus; m: Messages }) {
  const label = m.admin.status[status];
  if (status === 'active') {
    return (
      <Chip tone="done" icon={CircleCheck}>
        {label}
      </Chip>
    );
  }
  return status === 'draining' ? (
    <Chip tone="progress" icon={Hourglass}>
      {label}
    </Chip>
  ) : (
    <Chip tone="neutral" icon={CircleSlash}>
      {label}
    </Chip>
  );
}

export function LockedChip({ m }: { m: Messages }) {
  return (
    <Chip tone="neutral" icon={Lock}>
      {m.admin.status.locked}
    </Chip>
  );
}

export function InviteStatusChip({ status, m }: { status: InviteStatus; m: Messages }) {
  const label = m.admin.inviteStatus[status];
  if (status === 'accepted') {
    return (
      <Chip tone="done" icon={CircleCheck}>
        {label}
      </Chip>
    );
  }
  return status === 'pending' ? (
    <Chip tone="progress" icon={MailPlus}>
      {label}
    </Chip>
  ) : (
    <Chip tone="neutral" icon={CircleSlash}>
      {label}
    </Chip>
  );
}

export function DeviceStatusChip({ status, m }: { status: DeviceStatus; m: Messages }) {
  const label = m.admin.deviceStatus[status];
  if (status === 'registered') {
    return (
      <Chip tone="done" icon={CircleCheck}>
        {label}
      </Chip>
    );
  }
  return status === 'lost' ? (
    <Chip tone="neutral" icon={TriangleAlert} iconClassName="text-phaseRed">
      {label}
    </Chip>
  ) : (
    <Chip tone="neutral" icon={CircleSlash}>
      {label}
    </Chip>
  );
}
