import type { Metadata } from 'next';
import { requireCapability } from '@/lib/business-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { listTeam } from '@/lib/team';
import { canAssign, canManageMember, ROLE_LABELS } from '@/lib/permissions';
import { formatUKDate } from '@/lib/uk-defaults';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { SettingsTabs } from '@/components/settings-tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { InviteForm } from './invite-form';
import { RemoveMemberButton, ResetMfaButton, RevokeInviteButton, RoleSelect } from './member-controls';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage() {
  const { business, role, userId } = await requireCapability('team.manage');
  const { members, invitations } = await listTeam(createAdminClient() as never, business.id);

  return (
    <div>
      <PageHeader
        title="Team"
        icon="users"
        tone="violet"
        description="Invite colleagues and choose what each person can do."
        tabs={<SettingsTabs />}
      />
      <div className="space-y-6">
        <SectionCard title="Invite a teammate" description="They get an email with a single-use link that only works for that address and expires after 7 days.">
          <InviteForm canInviteAdmin={canAssign(role, 'admin')} />
        </SectionCard>

        <SectionCard title={`Members (${members.length})`} flush>
          <ul className="divide-y divide-line">
            {members.map((m) => {
              const label = m.email ?? 'Unknown user';
              const editable = m.userId !== userId && m.role !== 'owner' && canManageMember(role, m.role);
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
                  <Avatar name={label} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {label}
                      {m.userId === userId && <span className="ml-2 text-xs font-normal text-ink-4">(you)</span>}
                    </p>
                    <p className="text-xs text-ink-4">
                      Joined {formatUKDate(new Date(m.joinedAt))}
                      {m.lastSignInAt ? ` · last signed in ${formatUKDate(new Date(m.lastSignInAt))}` : ' · never signed in'}
                    </p>
                  </div>
                  {m.mfaEnrolled === true && <Badge tone="success" dot>2FA on</Badge>}
                  {m.mfaEnrolled === false && <Badge tone={business.require_mfa ? 'warning' : 'neutral'}>{business.require_mfa ? '2FA needed' : '2FA off'}</Badge>}
                  {editable && m.mfaEnrolled === true && <ResetMfaButton userId={m.userId} label={label} />}
                  {editable ? (
                    <>
                      <RoleSelect userId={m.userId} role={m.role as 'admin' | 'staff'} label={label} canAssignAdmin={canAssign(role, 'admin')} />
                      <RemoveMemberButton userId={m.userId} label={label} />
                    </>
                  ) : (
                    <Badge tone={m.role === 'owner' ? 'success' : 'neutral'}>{ROLE_LABELS[m.role].label}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>

        {invitations.length > 0 && (
          <SectionCard title={`Pending invitations (${invitations.length})`} flush>
            <ul className="divide-y divide-line">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{i.email}</p>
                    <p className="text-xs text-ink-4">
                      {ROLE_LABELS[i.role].label} · expires {formatUKDate(new Date(i.expiresAt))}
                      {new Date(i.expiresAt) <= new Date() && ' (expired)'}
                    </p>
                  </div>
                  {canManageMember(role, i.role) && <RevokeInviteButton invitationId={i.id} email={i.email} />}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        <SectionCard title="What each role can do">
          <dl className="grid gap-4 sm:grid-cols-3">
            {(['owner', 'admin', 'staff'] as const).map((r) => (
              <div key={r}>
                <dt className="text-sm font-semibold text-ink">{ROLE_LABELS[r].label}</dt>
                <dd className="mt-1 text-sm text-ink-3">{ROLE_LABELS[r].summary}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}
