/**
 * PadiHub Email Service — all transactional emails via Resend.
 * Every function is fire-and-forget safe: failures are caught and logged,
 * never thrown, so a failed email never crashes a payment or auth flow.
 */
import { getResendClient, getFromEmail } from './resendClient.js';

// ─── Shared HTML helpers ──────────────────────────────────────────────────────

function header(): string {
  return `
    <div style="background:#1A1A2E;padding:24px 32px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-family:sans-serif;font-size:22px;color:#2EAF6F;letter-spacing:-0.5px;">
        PadiHub
      </h1>
      <p style="margin:4px 0 0;font-family:sans-serif;font-size:12px;color:#9CA3AF;">
        Save Together. Grow Together. Belong.
      </p>
    </div>`;
}

function footer(): string {
  return `
    <div style="background:#F9FAFB;padding:16px 32px;border-radius:0 0 8px 8px;border-top:1px solid #E5E7EB;">
      <p style="margin:0;font-family:sans-serif;font-size:12px;color:#6B7280;">
        You received this email because you have an account with PadiHub.
        If you have questions, contact us at
        <a href="mailto:hello@padihub.com" style="color:#2EAF6F;">hello@padihub.com</a>.
      </p>
      <p style="margin:8px 0 0;font-family:sans-serif;font-size:11px;color:#9CA3AF;">
        © ${new Date().getFullYear()} PadiHub. All rights reserved.
      </p>
    </div>`;
}

function wrap(content: string): string {
  return `
    <div style="background:#F3F4F6;padding:32px 16px;font-family:sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        ${header()}
        <div style="padding:32px;">
          ${content}
        </div>
        ${footer()}
      </div>
    </div>`;
}

function btn(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:#2EAF6F;color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">${text}</a>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${text}</p>`;
}

function h2(text: string): string {
  return `<h2 style="margin:0 0 16px;font-size:20px;color:#1A1A2E;">${text}</h2>`;
}

function detail(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px;font-size:14px;color:#6B7280;background:#F9FAFB;border-radius:4px;">${label}</td>
    <td style="padding:8px 12px;font-size:14px;color:#111827;font-weight:600;">${value}</td>
  </tr>`;
}

function table(rows: string): string {
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;">${rows}</table>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Safe send wrapper ────────────────────────────────────────────────────────

async function send(to: string, subject: string, html: string): Promise<void> {
  try {
    const resend = getResendClient();
    await resend.emails.send({ from: getFromEmail(), to, subject, html });
  } catch (err) {
    // Log but never throw — a failed email must never crash a payment or auth flow
    console.error(`[EmailService] Failed to send "${subject}" to ${to}:`, err);
  }
}

export async function sendSupportTicketSubmissionEmail(data: {
  ticketRef: string;
  firstName: string;
  lastName: string;
  email: string;
  ticketAbout: string;
  priority: string;
  subject: string;
  message: string;
  userId?: string;
}): Promise<void> {
  const APP_URL = process.env.APP_URL ?? 'https://padihub.com';
  const toAddress = 'hello@padihub.com';
  const requesterName = escapeHtml(`${data.firstName} ${data.lastName}`.trim());
  const safeEmail = escapeHtml(data.email);
  const safeSubject = escapeHtml(data.subject);
  const safeTicketAbout = escapeHtml(data.ticketAbout);
  const safePriority = escapeHtml(data.priority);
  const safeMessage = escapeHtml(data.message);
  const safeUserId = data.userId ? detail('User ID', escapeHtml(data.userId)) : '';

  await send(toAddress, `[Support Ticket] ${data.subject} — ${data.ticketRef}`, wrap(`
    ${h2('New support ticket submission')}
    ${table(
      detail('Ticket reference', escapeHtml(data.ticketRef)) +
      detail('From', requesterName || safeEmail) +
      detail('Email', safeEmail) +
      detail('What it is about', safeTicketAbout) +
      detail('Priority', safePriority) +
      detail('Subject', safeSubject) +
      safeUserId
    )}
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;font-family:sans-serif;font-size:14px;color:#374151;white-space:pre-wrap;">${safeMessage}</p>
    </div>
    ${btn('Reply to ' + (requesterName || data.email), `mailto:${data.email}`)}
    ${p('<small style="color:#9CA3AF;">Sent via the PadiHub help ticket form at ' + APP_URL + '/help/ticket</small>')}
  `));
}

// ─── Auth emails ──────────────────────────────────────────────────────────────

export async function sendContactEmail(data: {
  name: string; email: string; subject: string; message: string;
}): Promise<void> {
  const APP_URL = process.env.APP_URL ?? 'https://padihub.com';
  const toAddress = 'hello@padihub.com';
  // Send to the shared inbox
  await send(toAddress, `[Contact] ${data.subject} — from ${data.name}`, wrap(`
    ${h2('New contact form submission')}
    ${p(`<strong>From:</strong> ${data.name} &lt;${data.email}&gt;`)}
    ${p(`<strong>Subject:</strong> ${data.subject}`)}
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;font-family:sans-serif;font-size:14px;color:#374151;white-space:pre-wrap;">${data.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    </div>
    ${btn('Reply to ' + data.name, `mailto:${data.email}`)}
    ${p('<small style="color:#9CA3AF;">Sent via the PadiHub contact form at ' + APP_URL + '/contact</small>')}
  `));
  // Auto-reply to the sender
  await send(data.email, 'We received your message — PadiHub', wrap(`
    ${h2('Thanks for reaching out, ' + data.name + '!')}
    ${p("We've received your message and will get back to you within 24 hours.")}
    ${p('<strong>Your message:</strong>')}
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;font-family:sans-serif;font-size:14px;color:#374151;white-space:pre-wrap;">${data.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    </div>
    ${btn('Visit PadiHub', APP_URL)}
  `));
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${process.env.APP_URL ?? 'https://padihub.com'}/verify-email?token=${token}`;
  await send(to, 'Verify your PadiHub email address', wrap(`
    ${h2('Verify your email address')}
    ${p('Thanks for signing up! Click the button below to verify your email address and activate your account.')}
    ${p('This link expires in 24 hours.')}
    ${btn('Verify Email Address', url)}
    ${p('<small style="color:#9CA3AF;">If you didn\'t create a PadiHub account, you can safely ignore this email.</small>')}
  `));
}

export async function sendWelcomeEmail(to: string, firstName: string): Promise<void> {
  await send(to, 'Welcome to PadiHub!', wrap(`
    ${h2(`Welcome, ${firstName}!`)}
    ${p('Your email has been verified and your account is now active.')}
    ${p('You can now join or create savings groups, track your Trust Score, and start saving together with your community.')}
    ${btn('Go to Dashboard', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${process.env.APP_URL ?? 'https://padihub.com'}/reset-password?token=${token}`;
  await send(to, 'Reset your PadiHub password', wrap(`
    ${h2('Reset your password')}
    ${p('We received a request to reset your password. Click the button below to choose a new one.')}
    ${p('This link expires in 2 hours.')}
    ${btn('Reset Password', url)}
    ${p('<small style="color:#9CA3AF;">If you didn\'t request a password reset, please ignore this email. Your password will not change.</small>')}
  `));
}

export async function sendPasswordChangedEmail(to: string, timestamp: string): Promise<void> {
  await send(to, 'Your PadiHub password was changed', wrap(`
    ${h2('Password changed')}
    ${p(`Your PadiHub password was successfully changed on <strong>${timestamp}</strong>.`)}
    ${p('If you made this change, no further action is needed.')}
    ${p('If you did not make this change, please <a href="mailto:hello@padihub.com" style="color:#2EAF6F;">contact support</a> immediately and reset your password.')}
  `));
}

export async function sendPaymentMethodUpdatedEmail(to: string, name: string): Promise<void> {
  await send(to, 'Your PadiHub payment method was updated', wrap(`
    ${h2('Payment method updated')}
    ${p(`Hi ${escapeHtml(name)}, your saved payment card has been updated.`)}
    ${p('This new payment method is now in effect immediately for future PadiHub contribution charges.')}
    ${p('If you did not make this change, please <a href="mailto:hello@padihub.com" style="color:#2EAF6F;">contact support</a> straight away.')}
  `));
}

export async function sendPayoutDestinationUpdatedEmail(to: string, name: string): Promise<void> {
  await send(to, 'Your PadiHub payout destination was updated', wrap(`
    ${h2('Payout destination updated')}
    ${p(`Hi ${escapeHtml(name)}, your saved payout destination has been updated.`)}
    ${p('This payout destination is now the one on file for your future PadiHub payouts with immediate effect.')}
    ${p('If you did not make this change, please <a href="mailto:hello@padihub.com" style="color:#2EAF6F;">contact support</a> straight away.')}
  `));
}

export async function sendAccountDeletedEmail(to: string, name: string): Promise<void> {
  await send(to, 'Your PadiHub account has been deleted', wrap(`
    ${h2('Account deleted')}
    ${p(`Hi ${escapeHtml(name)}, your PadiHub account has now been deleted.`)}
    ${p('Your subscription access has been cancelled and your personal details have been removed or anonymised where retention is required for operational or compliance reasons.')}
    ${p('If you did not request this, please contact <a href="mailto:hello@padihub.com" style="color:#2EAF6F;">hello@padihub.com</a> immediately.')}
    ${btn('Contact Support', 'mailto:hello@padihub.com')}
  `));
}

// ─── Group emails ─────────────────────────────────────────────────────────────

export async function sendGroupInvitationEmail(
  to: string, groupName: string, inviteLink: string, expiresAt: string, inviterName?: string,
): Promise<void> {
  const appUrl = process.env.APP_URL ?? 'https://padihub.com';
  await send(to, `You've been invited to join ${groupName} on PadiHub`, wrap(`
    ${h2('You\'re invited to join a savings group')}
    ${p(`${inviterName ? `<strong>${escapeHtml(inviterName)}</strong> has invited you` : 'You have been invited'} to join <strong>${escapeHtml(groupName)}</strong> on PadiHub.`)}
    ${table(
      detail('Group', escapeHtml(groupName)) +
      detail('Invite expires', expiresAt),
    )}
    ${btn('Accept Invitation', inviteLink)}
    ${p(`Already have a PadiHub account? <a href="${appUrl}/login" style="color:#2EAF6F;">Log in</a> and the link above takes you straight to the group. New to PadiHub? <a href="${appUrl}/get-started" style="color:#2EAF6F;">Create your free account</a> first — the same link will still be waiting for you.`)}
    ${p('Before you can join, we\'ll walk you through completing your profile: confirm your email, verify your identity, choose your subscription plan, and add your payment card and payout details. Your subscription fee is only charged once you\'re part of a valid, active group with at least three members.')}
    ${p('<small style="color:#9CA3AF;">If you don\'t know who sent this, you can safely ignore it.</small>')}
  `));
}

export async function sendInvitationAcceptedEmail(
  to: string, groupName: string, memberName: string, leaderName: string,
): Promise<void> {
  await send(to, `${memberName} joined ${groupName}`, wrap(`
    ${h2('New member joined your group')}
    ${p(`<strong>${escapeHtml(memberName)}</strong> has completed their PadiHub profile setup — confirmed email, verified identity, subscription plan, payment card and payout details — accepted your invitation and joined <strong>${escapeHtml(groupName)}</strong>.`)}
    ${table(
      detail('Group', groupName) +
      detail('New member', memberName) +
      detail('Group leader', leaderName),
    )}
    ${btn('View Group', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

export async function sendMemberRemovedEmail(
  to: string, groupName: string, reason: string,
): Promise<void> {
  await send(to, `You have been removed from ${groupName}`, wrap(`
    ${h2('Membership removed')}
    ${p(`You have been removed from <strong>${groupName}</strong>.`)}
    ${table(detail('Reason', reason))}
    ${p('If you believe this was a mistake, please contact the group leader or <a href="mailto:hello@padihub.com" style="color:#2EAF6F;">PadiHub support</a>.')}
  `));
}

/**
 * Notify the OTHER active members of a group when one member is suspended
 * (kicked out) for repeated missed contributions — every member has a stake
 * in the rotation, so the whole group needs visibility into a change to it,
 * not just the affected member.
 */
export async function sendGroupMemberSuspendedNotificationEmail(
  to: string, groupName: string, suspendedMemberName: string,
): Promise<void> {
  await send(to, `A member of ${groupName} has been suspended`, wrap(`
    ${h2('Group membership update')}
    ${p(`<strong>${suspendedMemberName}</strong> has been suspended from <strong>${groupName}</strong> after repeated missed contributions.`)}
    ${p('This may affect the group\'s rotation order and payout schedule. Check the group page for the latest details.')}
  `));
}

export async function sendGroupClosedEmail(to: string, groupName: string): Promise<void> {
  await send(to, `${groupName} has been closed`, wrap(`
    ${h2('Your savings group has been closed')}
    ${p(`The savings group <strong>${groupName}</strong> has been closed by the group leader.`)}
    ${p('Any pending contributions or payouts will be handled according to your group\'s rules. If you have questions, contact the group leader or PadiHub support.')}
  `));
}

/** Confirm to the Creator that their new group (and its lifecycle length) was created. */
export async function sendGroupCreatedEmail(to: string, groupName: string, durationSummary: string): Promise<void> {
  await send(to, `${groupName} has been created`, wrap(`
    ${h2('Your savings group has been created')}
    ${p(`<strong>${escapeHtml(groupName)}</strong> has been created as a draft.`)}
    ${p(durationSummary)}
    ${btn('View Group', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

/** Confirm to a brand-new member (invite-token immediate join) that they've joined, including the group's lifecycle length. */
export async function sendMemberJoinedGroupEmail(to: string, groupName: string, durationSummary: string): Promise<void> {
  await send(to, `You've joined ${groupName}`, wrap(`
    ${h2('You\'re in!')}
    ${p(`You've successfully joined <strong>${escapeHtml(groupName)}</strong>.`)}
    ${p(durationSummary)}
    ${btn('View Group', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

/** Notify a group leader that a verified member has requested to join their group. */
export async function sendGroupJoinRequestEmail(
  to: string, groupName: string, requesterName: string, requesterTrustScore: number,
): Promise<void> {
  await send(to, `${requesterName} wants to join ${groupName}`, wrap(`
    ${h2('New request to join your group')}
    ${p(`<strong>${requesterName}</strong> has requested to join <strong>${groupName}</strong>.`)}
    ${table(
      detail('Group', groupName) +
      detail('Requested by', requesterName) +
      detail('Trust Score', `${requesterTrustScore}/100`),
    )}
    ${p('Review and vote on this request from your dashboard.')}
    ${btn('Review Request', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

/** Confirm to the requester that their join request has been submitted. */
export async function sendGroupJoinRequestSubmittedEmail(to: string, groupName: string): Promise<void> {
  await send(to, `Your request to join ${groupName} was submitted`, wrap(`
    ${h2('Join request submitted')}
    ${p(`Your request to join <strong>${groupName}</strong> has been sent to the group leader for approval.`)}
    ${p('We\'ll email you as soon as a decision has been made.')}
  `));
}

/** Notify the requester their join request was approved. */
export async function sendGroupJoinApprovedEmail(to: string, groupName: string, durationSummary?: string): Promise<void> {
  await send(to, `You've been accepted into ${groupName}`, wrap(`
    ${h2('Request approved')}
    ${p(`You've been accepted as a member of <strong>${groupName}</strong>.`)}
    ${p('The group\'s payout schedule has been updated to include you. Check the group page for your rotation position.')}
    ${durationSummary ? p(durationSummary) : ''}
    ${btn('View Group', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

/** Notify the requester their join request was declined. */
export async function sendGroupJoinRejectedEmail(to: string, groupName: string): Promise<void> {
  await send(to, `Update on your request to join ${groupName}`, wrap(`
    ${h2('Request not approved')}
    ${p(`Your request to join <strong>${groupName}</strong> was not approved by the group leader at this time.`)}
  `));
}

/** Notify the group leader and every existing member once a new member is accepted. */
export async function sendGroupNewMemberJoinedEmail(
  to: string, groupName: string, newMemberName: string,
): Promise<void> {
  await send(to, `${newMemberName} joined ${groupName}`, wrap(`
    ${h2('New member joined your group')}
    ${p(`<strong>${newMemberName}</strong> has joined <strong>${groupName}</strong>. The payout schedule has been updated accordingly.`)}
    ${btn('View Group', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

/** Notify the group leader that "Start Group" launched the group (Draft → Active). */
export async function sendGroupActivatedEmail(to: string, groupName: string): Promise<void> {
  await send(to, `${groupName} is now active`, wrap(`
    ${h2('Your group has started')}
    ${p(`<strong>${groupName}</strong> has reached its minimum member count and is now <strong>Active</strong>. Contributions and the payout rotation are live.`)}
    ${btn('View Group', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

/** Notify the group leader that an Active group dropped below the minimum member count and was Suspended. */
export async function sendGroupSuspendedLowMembersEmail(
  to: string, groupName: string, activeCount: number, minRequired: number,
): Promise<void> {
  await send(to, `${groupName} has been suspended — below minimum members`, wrap(`
    ${h2('Group suspended')}
    ${p(`<strong>${groupName}</strong> dropped to ${activeCount} active member(s), below the required minimum of ${minRequired}, and has been <strong>Suspended</strong>.`)}
    ${p('Contribution collection is paused while suspended. Invite more members via your existing invite link to reactivate the group automatically. Groups left below the minimum for 30 days will auto-expire.')}
    ${btn('Invite Members', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

/** Notify the group leader that a Suspended group was refilled and is Active again. */
export async function sendGroupReactivatedEmail(to: string, groupName: string): Promise<void> {
  await send(to, `${groupName} is active again`, wrap(`
    ${h2('Group reactivated')}
    ${p(`<strong>${groupName}</strong> is back above the minimum member count and is <strong>Active</strong> again. Contribution collection has resumed.`)}
  `));
}

/** Notify every active member (except the Owner who made the change) that the group's settings/parameters were edited. */
export async function sendGroupSettingsUpdatedEmail(to: string, groupName: string): Promise<void> {
  await send(to, `${groupName}'s settings have been updated`, wrap(`
    ${h2('Group settings updated')}
    ${p(`The group leader has updated <strong>${groupName}</strong>'s settings — this may include the contribution amount, payout date, membership limit, or minimum Trust Score for new join requests.`)}
    ${p('Sign in to your dashboard to review the latest details before your next contribution is due.')}
    ${btn('View Group', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

/** Notify the group leader that a group stuck below the minimum member count for 30 days has auto-expired. */
export async function sendGroupExpiredEmail(to: string, groupName: string): Promise<void> {
  await send(to, `${groupName} has expired`, wrap(`
    ${h2('Group expired')}
    ${p(`<strong>${groupName}</strong> remained below the minimum member count for 30 days and has automatically <strong>Expired</strong>. No further contributions or payouts will occur for this group.`)}
    ${p('You can create a new group at any time.')}
  `));
}

/** Reminder nudge before a below-minimum group auto-expires. */
export async function sendGroupExpiryReminderEmail(
  to: string, groupName: string, daysRemaining: number,
): Promise<void> {
  await send(to, `${groupName} will expire in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`, wrap(`
    ${h2('Group expiring soon')}
    ${p(`<strong>${groupName}</strong> has been below the minimum member count for a while and will automatically expire in <strong>${daysRemaining} day${daysRemaining === 1 ? '' : 's'}</strong> if not refilled.`)}
    ${p('Invite more members via your existing invite link to keep the group active.')}
    ${btn('Invite Members', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

/**
 * "Member-exit notice" (Section 8) — sent to every REMAINING member
 * whenever anyone departs a group for any reason, under Compensated
 * Compression. Explicitly discloses BOTH the payout-timing change and the
 * pool-size change, per Section 5/8's requirement — never just "someone left".
 */
export async function sendMemberExitCompressionEmail(
  to: string, groupName: string, departedName: string,
  reason: 'voluntary' | 'removed_by_leader' | 'defaulted' | 'vote_removed',
  /**
   * Set only when the departing member was the group's Owner/Organiser —
   * folds the tenure-based succession announcement into this SAME email
   * rather than sending a separate one (Section 15.B: "Send one combined
   * email to the group: compression details plus who the new
   * Organiser/Owner is").
   */
  newOwnerName?: string,
): Promise<void> {
  const reasonText = reason === 'voluntary' ? 'left the group'
    : reason === 'defaulted' ? 'was suspended after repeated contribution defaults'
    : reason === 'vote_removed' ? 'was removed by a group member vote'
    : 'was removed by the group leader';
  await send(to, `Payout schedule updated in ${groupName}`, wrap(`
    ${h2('Group membership and payout schedule updated')}
    ${p(`<strong>${departedName}</strong> ${reasonText} in <strong>${groupName}</strong>.`)}
    ${p('As a result: the final period has been removed from the group\'s timeline, everyone behind that slot has moved up one position in the payout order (your payout date may now be earlier), and the future payout pool is reduced by their share since they will no longer contribute.')}
    ${p('Your own contribution amount is unchanged. Check the group page for your updated position and next payout date.')}
    ${newOwnerName ? p(`Because ${departedName} was the group's Organiser, the Organiser/Owner role has automatically transferred to <strong>${newOwnerName}</strong> — the remaining member who has been in the group the longest.`) : ''}
    ${btn('View Group', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

/**
 * Sent to every member when a member defaults but is RETAINED in the group
 * (default count below the group's max-permitted-defaults setting) — makes
 * clear the payout amount/schedule is unaffected this cycle, and that
 * recovering the specific missed amount from the defaulting member is the
 * group's own responsibility, not the platform's.
 */
export async function sendDefaultRetainedNotificationEmail(
  to: string, groupName: string, defaultingName: string, amountDue: string, currency: string,
  defaultCount: number, maxPermittedDefaults: number,
): Promise<void> {
  await send(to, `Contribution default in ${groupName}`, wrap(`
    ${h2('A member missed their contribution')}
    ${p(`<strong>${defaultingName}</strong> defaulted on a contribution of <strong>${currency} ${amountDue}</strong> in <strong>${groupName}</strong> (default ${defaultCount} of ${maxPermittedDefaults} permitted before removal).`)}
    ${p(`${defaultingName} remains in the group and the payout amount/schedule for this and future cycles is <strong>unchanged</strong>.`)}
    ${p('Recovering the missed amount from the defaulting member is the group\'s/organiser\'s own responsibility — PadiHub does not guarantee, insure, or recover missed contributions on the group\'s behalf.')}
  `));
}

export async function sendContributionReminderEmail(
  to: string, groupName: string, amount: string, dueDate: string,
): Promise<void> {
  await send(to, `Contribution reminder — ${groupName}`, wrap(`
    ${h2('Your contribution is due soon')}
    ${p(`A reminder that your contribution to <strong>${groupName}</strong> is due in 3 days.`)}
    ${table(
      detail('Group', groupName) +
      detail('Amount due', amount) +
      detail('Due date', dueDate),
    )}
    ${btn('Pay Now', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

export async function sendContributionSuccessEmail(
  to: string, groupName: string, amount: string, date: string, reference: string,
): Promise<void> {
  await send(to, `Contribution confirmed — ${groupName}`, wrap(`
    ${h2('Contribution received')}
    ${p(`Your contribution to <strong>${groupName}</strong> has been successfully recorded.`)}
    ${table(
      detail('Group', groupName) +
      detail('Amount', amount) +
      detail('Date', date) +
      detail('Reference', reference),
    )}
    ${p('Your Trust Score has been updated. Keep it up!')}
  `));
}

export async function sendContributionFailedEmail(
  to: string, groupName: string, amount: string,
): Promise<void> {
  await send(to, `Contribution payment failed — ${groupName}`, wrap(`
    ${h2('Payment failed')}
    ${p(`Your contribution payment to <strong>${groupName}</strong> was unsuccessful.`)}
    ${table(
      detail('Group', groupName) +
      detail('Amount', amount),
    )}
    ${p('Please update your payment method and retry as soon as possible to avoid a strike on your account.')}
    ${btn('Retry Payment', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

export async function sendContributionOverdueEmail(
  to: string, groupName: string, amount: string,
): Promise<void> {
  await send(to, `Overdue contribution — ${groupName}`, wrap(`
    ${h2('Your contribution is overdue')}
    ${p(`Your contribution to <strong>${groupName}</strong> is now overdue.`)}
    ${table(
      detail('Group', groupName) +
      detail('Amount', amount),
    )}
    ${p('<strong style="color:#DC2626;">Warning:</strong> This missed contribution has been recorded as a strike. Repeated missed contributions may result in suspension from the group.')}
    ${btn('View Dashboard', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

/**
 * "Payment overdue notice" (Section 8) — sent to the member the moment a
 * charge attempt fails and their 72-hour grace period starts (Section 6).
 * One automatic retry happens at the end of the grace period; no other
 * repeat/forced charging occurs.
 */
export async function sendPaymentGracePeriodStartedEmail(
  to: string, groupName: string, amount: string, graceEndsAt: string,
): Promise<void> {
  await send(to, `Payment failed — 72-hour grace period started for ${groupName}`, wrap(`
    ${h2('Your contribution payment failed')}
    ${p(`Your contribution of <strong>${amount}</strong> to <strong>${groupName}</strong> could not be charged.`)}
    ${p(`You have a 72-hour grace period. We'll automatically retry the charge once, on <strong>${graceEndsAt}</strong>. No further retries happen after that.`)}
    ${p('You can also update your payment method now to make sure the retry succeeds.')}
    ${btn('Update Payment Method', `${process.env.APP_URL ?? 'https://padihub.com'}/payments/methods`)}
  `));
}

/**
 * Sent to the defaulting member when the single grace-period retry also
 * fails and they are flagged In Default. If this pushes them past the
 * group's max-permitted-defaults setting, Compensated Compression removes
 * them and sendMemberExitCompressionEmail goes to the rest of the group;
 * otherwise sendDefaultRetainedNotificationEmail is sent to the group instead.
 */
export async function sendMemberDefaultSuspensionEmail(
  to: string, groupName: string, amount: string,
): Promise<void> {
  await send(to, `Contribution default recorded — ${groupName}`, wrap(`
    ${h2('Your contribution is now in default')}
    ${p(`The single automatic retry of your <strong>${amount}</strong> contribution to <strong>${groupName}</strong> also failed, so it's now recorded as a default.`)}
    ${p('Depending on your group\'s settings, this may result in your removal from the group and a recalculation of the group\'s payout schedule.')}
    ${p('Note: recovering an already-defaulted contribution amount from you is a matter between you and the group/organiser, not PadiHub.')}
  `));
}

// ─── Payout emails ────────────────────────────────────────────────────────────

export async function sendUpcomingPayoutEmail(
  to: string, groupName: string, expectedAmount: string, expectedDate: string,
): Promise<void> {
  await send(to, `Your payout is coming — ${groupName}`, wrap(`
    ${h2('Your payout is scheduled')}
    ${p(`Great news! You are the next recipient in <strong>${groupName}</strong>.`)}
    ${table(
      detail('Group', groupName) +
      detail('Expected amount', expectedAmount) +
      detail('Expected date', expectedDate),
    )}
    ${p('We\'ll notify you as soon as the transfer is confirmed.')}
  `));
}

export async function sendPayoutCompleteEmail(
  to: string, groupName: string, amountReceived: string, reference: string,
): Promise<void> {
  await send(to, `Payout received — ${groupName}`, wrap(`
    ${h2('Your payout has been sent')}
    ${p(`Your payout from <strong>${groupName}</strong> has been transferred to your account.`)}
    ${table(
      detail('Group', groupName) +
      detail('Amount received', amountReceived) +
      detail('Reference', reference),
    )}
    ${p('Please allow 1–3 business days for the funds to appear in your account.')}
  `));
}

// ─── Vote emails ──────────────────────────────────────────────────────────────

export async function sendVoteRequiredEmail(
  to: string, groupName: string, voteDescription: string, deadline: string,
): Promise<void> {
  await send(to, `Vote required — ${groupName}`, wrap(`
    ${h2('Your vote is needed')}
    ${p(`A vote has been created in <strong>${groupName}</strong> that requires your input.`)}
    ${table(
      detail('Group', groupName) +
      detail('Proposal', voteDescription) +
      detail('Voting deadline', deadline),
    )}
    ${btn('Cast Your Vote', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

export async function sendVoteResultEmail(
  to: string, groupName: string, outcome: string, voteCounts: string,
): Promise<void> {
  await send(to, `Vote result — ${groupName}`, wrap(`
    ${h2('Vote result')}
    ${p(`The vote in <strong>${groupName}</strong> has closed.`)}
    ${table(
      detail('Group', groupName) +
      detail('Outcome', outcome) +
      detail('Vote counts', voteCounts),
    )}
  `));
}

/**
 * Governance vote notice with working single-click accept/decline links
 * (Section 4/8) — used for new-member admission, contribution "claim", and
 * payout-swap proposals. The links themselves are the authentication
 * (GET /api/votes/respond?token=...&decision=...), so no login is required
 * to respond — this is deliberately email-based, not push/in-app-only.
 */
export async function sendGovernanceVoteEmail(
  to: string, groupName: string, subjectLine: string, description: string,
  deadline: string, acceptUrl: string, declineUrl: string,
): Promise<void> {
  await send(to, `${subjectLine} — ${groupName}`, wrap(`
    ${h2(subjectLine)}
    ${p(description)}
    ${table(
      detail('Group', groupName) +
      detail('Respond by', deadline),
    )}
    ${btn('Accept', acceptUrl)}
    <div style="margin-top:12px;">
      <a href="${declineUrl}" style="color:#DC2626;font-size:14px;text-decoration:underline;">Decline instead</a>
    </div>
  `));
}

/** Generic result notice for any governance vote (member admission, contribution claim, payout swap). */
export async function sendVoteOutcomeEmail(to: string, groupName: string, subjectLine: string, message: string): Promise<void> {
  await send(to, `${subjectLine} — ${groupName}`, wrap(`
    ${h2(subjectLine)}
    ${p(message)}
    ${btn('View Group', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}

// ─── Subscription emails ──────────────────────────────────────────────────────

export async function sendSubscriptionCreatedEmail(
  to: string, plan: string, amount: string, renewalDate: string,
): Promise<void> {
  await send(to, 'Your PadiHub subscription is active', wrap(`
    ${h2('Subscription confirmed')}
    ${p('Your PadiHub subscription has been activated.')}
    ${table(
      detail('Plan', plan) +
      detail('Amount', amount) +
      detail('Next renewal', renewalDate),
    )}
    ${p('You now have full access to all PadiHub features.')}
  `));
}

export async function sendSubscriptionRenewalReminderEmail(
  to: string, amount: string, renewalDate: string,
): Promise<void> {
  await send(to, 'Your PadiHub subscription renews in 7 days', wrap(`
    ${h2('Subscription renewal reminder')}
    ${p('Your PadiHub subscription will renew in 7 days.')}
    ${table(
      detail('Amount', amount) +
      detail('Renewal date', renewalDate),
    )}
    ${p('Ensure your payment method is up to date to avoid any interruption to your access.')}
    ${btn('Manage Subscription', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

export async function sendSubscriptionPaymentFailedEmail(
  to: string, amount: string,
): Promise<void> {
  await send(to, 'PadiHub subscription payment failed', wrap(`
    ${h2('Subscription payment failed')}
    ${p('We were unable to process your PadiHub subscription payment.')}
    ${table(detail('Amount', amount))}
    ${p('Please update your payment method to restore full access to your account.')}
    ${btn('Update Payment Method', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

export async function sendSubscriptionCancelledEmail(
  to: string, accessEndDate: string,
): Promise<void> {
  await send(to, 'Your PadiHub subscription has been cancelled', wrap(`
    ${h2('Subscription cancelled')}
    ${p('Your PadiHub subscription has been cancelled.')}
    ${table(detail('Access ends', accessEndDate))}
    ${p('You will retain access until the end of your current billing period. You can reactivate at any time.')}
    ${btn('Reactivate Subscription', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

/**
 * Notify a member their subscription tier has changed. When downgrading,
 * the new (lower) price takes effect from `effectiveDate` (their next
 * billing date) and they keep current-tier access until then. When
 * upgrading, the new (higher) price is charged immediately/from
 * `effectiveDate`, which reflects their existing monthly billing anniversary.
 */
export async function sendSubscriptionTierChangedEmail(
  to: string, params: {
    direction: 'upgrade' | 'downgrade';
    fromPlanName: string;
    toPlanName: string;
    newAmount: string;
    effectiveDate: string;
  },
): Promise<void> {
  const { direction, fromPlanName, toPlanName, newAmount, effectiveDate } = params;
  await send(to, `Your PadiHub subscription is switching to ${toPlanName}`, wrap(`
    ${h2(direction === 'upgrade' ? 'Subscription upgraded' : 'Subscription downgrade scheduled')}
    ${p(`Your PadiHub subscription is changing from <strong>${fromPlanName}</strong> to <strong>${toPlanName}</strong>.`)}
    ${table(
      detail('New monthly amount', newAmount) +
      detail(direction === 'upgrade' ? 'Charged from' : 'New price takes effect from', effectiveDate),
    )}
    ${direction === 'upgrade'
      ? p('Your new group limits are available immediately.')
      : p('You will keep your current plan\'s group limits until the date above, then move to your new plan\'s limits.')}
    ${btn('View Subscription', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

// ─── Support emails ───────────────────────────────────────────────────────────

export async function sendSupportTicketReceivedEmail(
  to: string, ticketRef: string, subject: string,
): Promise<void> {
  await send(to, `Support ticket received — ${ticketRef}`, wrap(`
    ${h2('We received your support request')}
    ${p('Thank you for contacting PadiHub support. We\'ll get back to you as soon as possible.')}
    ${table(
      detail('Ticket reference', ticketRef) +
      detail('Subject', subject) +
      detail('Expected response time', '1–2 business days'),
    )}
  `));
}

export async function sendSupportTicketUpdatedEmail(
  to: string, ticketRef: string, response: string,
): Promise<void> {
  await send(to, `Update on your support ticket — ${ticketRef}`, wrap(`
    ${h2('Your support ticket has been updated')}
    ${p(`Ticket reference: <strong>${ticketRef}</strong>`)}
    ${p('Our team has responded to your request:')}
    <div style="background:#F9FAFB;border-left:4px solid #2EAF6F;padding:16px;border-radius:0 4px 4px 0;margin:16px 0;">
      <p style="margin:0;font-size:15px;color:#374151;">${response}</p>
    </div>
    ${btn('View Ticket', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

export async function sendSupportTicketClosedEmail(
  to: string, ticketRef: string, resolution: string,
): Promise<void> {
  await send(to, `Support ticket resolved — ${ticketRef}`, wrap(`
    ${h2('Your support ticket has been resolved')}
    ${p(`Ticket reference: <strong>${ticketRef}</strong>`)}
    ${p('Your support request has been resolved:')}
    <div style="background:#F9FAFB;border-left:4px solid #2EAF6F;padding:16px;border-radius:0 4px 4px 0;margin:16px 0;">
      <p style="margin:0;font-size:15px;color:#374151;">${resolution}</p>
    </div>
    ${p('If you need further assistance, please open a new support ticket.')}
  `));
}

// ─── Identity Verification emails ─────────────────────────────────────────────

export async function sendIdentityVerifiedEmail(to: string, firstName: string, subscriptionActivated: boolean): Promise<void> {
  await send(to, 'Your identity has been verified — PadiHub', wrap(`
    ${h2(`Identity verified, ${firstName}!`)}
    ${subscriptionActivated
      ? p('Your identity has been successfully verified on PadiHub, and your subscription is now active.')
      : p('Your identity has been successfully verified on PadiHub.')}
    ${p('As a result, your Trust Score has increased slightly. Everyone starts from the bottom of the scale and builds their Trust Score up over time through real group activity — on-time contributions, completed cycles, and positive participation.')}
    ${subscriptionActivated
      ? p('No further action is needed. You can now create and join savings groups per your plan\'s limits.')
      : p('Choose a subscription plan and add your payment card to activate your subscription and start creating or joining savings groups.')}
    ${btn(subscriptionActivated ? 'Go to Dashboard' : 'Choose Your Plan', `${process.env.APP_URL ?? 'https://padihub.com'}/${subscriptionActivated ? 'dashboard' : 'subscription/manage'}`)}
  `));
}

export async function sendVerificationFeeChargedEmail(
  to: string, firstName: string, monthlySubscriptionAmount: string, verificationFeeAmount: string,
): Promise<void> {
  await send(to, 'Identity Verification Fee Added to Your First Invoice', wrap(`
    ${h2(`Identity Verification Fee — ${firstName}`)}
    ${p('As part of completing your identity verification, a one-time fee has been added to your first subscription invoice.')}
    ${table(
      detail('Verification fee', verificationFeeAmount) +
      detail('Monthly subscription', monthlySubscriptionAmount) +
      detail('Invoice description', 'Identity Verification Fee (one-time)'),
    )}
    ${p(`This fee covers the cost of securely verifying your identity through Stripe Identity. Subsequent monthly payments will be <strong>${monthlySubscriptionAmount}</strong>.`)}
    ${p('This charge is non-refundable once verification has been completed.')}
    ${btn('View Subscription', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}

export async function sendIdentityVerificationFailedEmail(to: string, firstName: string): Promise<void> {
  await send(to, 'We couldn\'t verify your identity — try again', wrap(`
    ${h2(`Verification unsuccessful, ${firstName}`)}
    ${p('We were unable to complete your identity/bank-account verification, so no charge has been made to your card and your subscription has not started.')}
    ${p('This can happen for a number of reasons — a document photo that didn\'t match, bank details that didn\'t resolve to your name, or a step that timed out. You can try again as many times as you need to.')}
    ${btn('Try Verification Again', `${process.env.APP_URL ?? 'https://padihub.com'}/verify-identity`)}
    ${p('If you keep running into trouble, our support team is happy to help — just reply to this email or open a support ticket.')}
  `));
}

// ─── Onboarding completion ────────────────────────────────────────────────────

/**
 * Sent once, the first time a member finishes every onboarding step AND their
 * subscription is genuinely active: confirmed email, verified identity,
 * chosen subscription plan, saved payment card and payout details. Confirms
 * the tier they're on and spells out exactly what that tier lets them do — see
 * paymentEligibilityService.notifyOnboardingComplete().
 */
export async function sendProfileSetupCompleteEmail(
  to: string,
  firstName: string,
  plan: { tierName: string; monthlyPrice: string; maxGroupsCreate: number; maxGroupsJoin: number },
): Promise<void> {
  const canCreate = plan.maxGroupsCreate > 0;
  await send(to, `Your PadiHub profile is complete — ${plan.tierName} plan`, wrap(`
    ${h2(`You're all set, ${escapeHtml(firstName)}!`)}
    ${p('Your PadiHub profile setup is complete. Your email is confirmed, your identity is verified, your plan is chosen and both your payment card and payout details are on file.')}
    ${table(
      detail('Plan', escapeHtml(plan.tierName)) +
      detail('Monthly subscription', plan.monthlyPrice) +
      detail('Groups you can create', canCreate ? String(plan.maxGroupsCreate) : 'None — upgrade to Premium to create groups') +
      detail('Groups you can join', String(plan.maxGroupsJoin)),
    )}
    ${p(canCreate
      ? `You can now create up to <strong>${plan.maxGroupsCreate}</strong> savings groups and be a member of up to <strong>${plan.maxGroupsJoin}</strong> in total.`
      : `You can now join up to <strong>${plan.maxGroupsJoin}</strong> savings groups. Creating your own group is a Premium feature — you can upgrade at any time.`)}
    ${p('Your subscription is now active and your payment setup is complete. If a future renewal ever needs attention, we’ll email you right away.')}
    ${btn(canCreate ? 'Create or Join a Group' : 'Find a Group to Join', `${process.env.APP_URL ?? 'https://padihub.com'}/savings-groups`)}
  `));
}
