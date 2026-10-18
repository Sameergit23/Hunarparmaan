import { AdminShell } from '@/components/admin-shell';
import { OfficeShell } from '@/components/office-shell';
import { Card, PageTitle } from '@/components/wire';
import { isAdminRole, requireUser } from '@/lib/session';
import { PinForm } from './pin-form';

export const metadata = { title: 'Change PIN' };

/**
 * Every office and admin role may change their own PIN, in their own frame;
 * it isn't in the nav, so no item is highlighted.
 */
export default async function ChangePinPage() {
  const Shell = isAdminRole((await requireUser()).role) ? AdminShell : OfficeShell;
  return (
    <Shell path="/account/pin">
      {({ m }) => (
        <>
          <PageTitle title={m.account.title} body={m.account.body} />
          <Card className="max-w-md">
            <PinForm m={m} />
          </Card>
        </>
      )}
    </Shell>
  );
}
