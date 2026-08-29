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
        <a href="mailto:support@padihub.com" style="color:#2EAF6F;">support@padihub.com</a>.
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

// ─── Auth emails ──────────────────────────────────────────────────────────────

export async function sendContactEmail(data: {
  name: string; email: string; subject: string; message: string;
}): Promise<void> {
  const APP_URL = process.env.APP_URL ?? 'https://padihub.com';
  const toAddress = process.env.RESEND_FROM_EMAIL ?? 'hello@padihub.com';
  // Send to the support inbox
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
    ${p('If you did not make this change, please <a href="mailto:support@padihub.com" style="color:#2EAF6F;">contact support</a> immediately and reset your password.')}
  `));
}

// ─── Group emails ─────────────────────────────────────────────────────────────

export async function sendGroupInvitationEmail(
  to: string, groupName: string, inviteLink: string, expiresAt: string,
): Promise<void> {
  await send(to, `You've been invited to join ${groupName} on PadiHub`, wrap(`
    ${h2(`You're invited to join a savings group`)}
    ${p(`You have been invited to join <strong>${groupName}</strong> on PadiHub.`)}
    ${table(
      detail('Group', groupName) +
      detail('Invite expires', expiresAt),
    )}
    ${btn('Accept Invitation', inviteLink)}
    ${p('<small style="color:#9CA3AF;">If you don\'t know who sent this, you can safely ignore it.</small>')}
  `));
}

export async function sendInvitationAcceptedEmail(
  to: string, groupName: string, memberName: string, leaderName: string,
): Promise<void> {
  await send(to, `${memberName} joined ${groupName}`, wrap(`
    ${h2('New member joined your group')}
    ${p(`<strong>${memberName}</strong> has accepted their invitation and joined <strong>${groupName}</strong>.`)}
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
    ${p('If you believe this was a mistake, please contact the group leader or <a href="mailto:support@padihub.com" style="color:#2EAF6F;">PadiHub support</a>.')}
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

// ─── Contribution emails ──────────────────────────────────────────────────────

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

export async function sendIdentityVerifiedEmail(to: string, firstName: string): Promise<void> {
  await send(to, 'Your identity has been verified — PadiHub', wrap(`
    ${h2(`Identity verified, ${firstName}!`)}
    ${p('Your identity has been successfully verified on PadiHub.')}
    ${p('As a result, your Trust Score has increased by <strong>+50 points</strong>. This helps build confidence with other group members and may unlock higher contribution limits.')}
    ${p('No further action is needed. You can now create and join savings groups with full verification status.')}
    ${btn('View Your Trust Score', `${process.env.APP_URL ?? 'https://padihub.com'}/trust`)}
  `));
}

export async function sendVerificationFeeChargedEmail(to: string, firstName: string): Promise<void> {
  await send(to, 'Identity Verification Fee Added to Your First Invoice', wrap(`
    ${h2(`Identity Verification Fee — ${firstName}`)}
    ${p('As part of completing your identity verification, a one-time fee has been added to your first subscription invoice.')}
    ${table(
      detail('Verification fee', '£1.50') +
      detail('Monthly subscription', '£4.99') +
      detail('First invoice total', '£6.49') +
      detail('Invoice description', 'Identity Verification Fee (one-time)'),
    )}
    ${p('This fee covers the cost of securely verifying your identity through Stripe Identity. Subsequent monthly payments will be <strong>£4.99</strong>.')}
    ${p('This charge is non-refundable once verification has been completed.')}
    ${btn('View Subscription', `${process.env.APP_URL ?? 'https://padihub.com'}/dashboard`)}
  `));
}
