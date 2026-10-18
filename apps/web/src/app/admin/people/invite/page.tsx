import {
  GRANTABLE_ROLES,
  ROLES_BY_ORG_KIND,
  SCOPE_BY_ROLE,
  type Role,
} from '@hunarpramaan/contracts';
import { AdminShell } from '@/components/admin-shell';
import { Card, PageTitle } from '@/components/wire';
import { reasonsFor, type SearchParams } from '@/lib/admin';
import { InviteForm } from './invite-form';

export const metadata = { title: 'Invite someone' };

/** P3 (app flow section 3). "Invite again" fills in the name and role of an expired invite. */
export default async function InvitePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <AdminShell active="people" path="/admin/people/invite">
      {({ m, lang, user, organisations, orgName }) => {
        const grantable: readonly Role[] =
          GRANTABLE_ROLES[user.role as keyof typeof GRANTABLE_ROLES] ?? [];
        const governance = SCOPE_BY_ROLE[user.role] === 'governance';
        // Organisation admins invite into their own organisation: only roles its kind holds.
        const own = organisations.find((o) => o.id === user.organisationId);
        const roles = grantable.filter(
          (r) => governance || !own || (ROLES_BY_ORG_KIND[own.kind] as readonly Role[]).includes(r),
        );
        const defaults = {
          name: typeof params.name === 'string' ? params.name : '',
          role:
            typeof params.role === 'string' && roles.includes(params.role as Role)
              ? params.role
              : '',
        };
        return (
          <>
            <PageTitle title={m.admin.invite.title} body={m.admin.invite.body} />
            <Card className="max-w-xl">
              <InviteForm
                t={{
                  ...m.admin.invite,
                  pin: m.admin.confirm.pin,
                  cancel: m.admin.confirm.cancel,
                  badPhone: m.login.badPhone,
                }}
                roles={roles.map((r) => ({ value: r, label: m.roles[r] }))}
                reasons={reasonsFor('account.invited', m)}
                organisations={
                  governance
                    ? organisations.map((o) => ({ value: o.id, label: o.name[lang] }))
                    : null
                }
                ownOrganisation={orgName}
                defaults={defaults}
              />
            </Card>
          </>
        );
      }}
    </AdminShell>
  );
}
