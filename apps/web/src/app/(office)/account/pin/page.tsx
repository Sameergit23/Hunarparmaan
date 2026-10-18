import { OfficeShell } from '@/components/office-shell';
import { Card, PageTitle } from '@/components/wire';
import { PinForm } from './pin-form';

export const metadata = { title: 'Change PIN' };

/** Every office role may change their own PIN; it isn't in the nav, so no item is highlighted. */
export default function ChangePinPage() {
  return (
    <OfficeShell path="/account/pin">
      {({ m }) => (
        <>
          <PageTitle title={m.account.title} body={m.account.body} />
          <Card className="max-w-md">
            <PinForm m={m} />
          </Card>
        </>
      )}
    </OfficeShell>
  );
}
