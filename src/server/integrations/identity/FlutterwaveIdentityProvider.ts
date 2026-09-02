/**
 * Nigeria identity-verification provider. Implements the same
 * IIdentityVerificationProvider interface as the UK's StripeIdentityProvider
 * so identityController.ts and the shared identityVerificationService can
 * treat both markets uniformly, but the actual check it delegates to is
 * Flutterwave's free Account Resolve API (see FlutterwaveAccountResolveProvider)
 * — an interim "bank account validation" step (confirms a bank account
 * number matches a real account holder name), NOT full identity/KYC
 * verification. It is deliberately implemented behind the swappable
 * IBankAccountValidationProvider interface so a dedicated KYC provider
 * (Dojah or Monnify) can be substituted later without touching this class's
 * callers.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import type {
  IIdentityVerificationProvider,
  VerificationSessionResult,
  VerificationStatusResult,
  IdentityWebhookResult,
} from './IdentityVerificationInterface.js';
import type { IBankAccountValidationProvider } from './BankAccountValidationInterface.js';
import { FlutterwaveAccountResolveProvider } from './FlutterwaveAccountResolveProvider.js';

export class FlutterwaveIdentityProvider implements IIdentityVerificationProvider {
  private readonly bankAccountValidator: IBankAccountValidationProvider;

  constructor(bankAccountValidator: IBankAccountValidationProvider = new FlutterwaveAccountResolveProvider()) {
    this.bankAccountValidator = bankAccountValidator;
  }

  /** Not used for the Account Resolve flow — see validateBankAccount() */
  async createVerificationSession(_userId: string): Promise<VerificationSessionResult> {
    return { sessionId: 'account_resolve_flow' };
  }

  async getVerificationStatus(userId: string): Promise<VerificationStatusResult> {
    const rows = await db.select({
      identity_verified:            schema.users.identity_verified,
      identity_verified_at:         schema.users.identity_verified_at,
      identity_verification_status: schema.users.identity_verification_status,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!rows.length) return { verified: false, status: 'not_started' };
    return {
      verified:   rows[0].identity_verified,
      status:     rows[0].identity_verification_status,
      verifiedAt: rows[0].identity_verified_at ?? undefined,
    };
  }

  /** Account Resolve is a synchronous REST call — no webhook to receive */
  async handleWebhook(_payload: Buffer, _signature: string): Promise<IdentityWebhookResult> {
    return { handled: false };
  }

  /** No fee for Nigerian users */
  async addVerificationFeeToFirstInvoice(_userId: string, _amountPence: number): Promise<void> {
    // No-op — Account Resolve carries no member-facing fee
  }

  /**
   * Validate that the bank account details provided by the member resolve to
   * a real account holder, then flip identity_verification_status. This
   * mirrors the UK charge-gating pattern exactly: the subscription is not
   * charged until this succeeds (see identityController.resolveNgBankAccount
   * and identityVerificationService.ts, which is called on success).
   */
  async validateBankAccount(
    userId: string,
    details: { accountNumber: string; bankCode: string },
  ): Promise<{ verified: boolean; accountName?: string; message: string }> {
    await db.update(schema.users)
      .set({ identity_verification_status: 'pending' })
      .where(eq(schema.users.id, userId));

    const result = await this.bankAccountValidator.validateBankAccount(details);

    if (!result.verified) {
      await db.update(schema.users)
        .set({ identity_verification_status: 'failed' })
        .where(eq(schema.users.id, userId));
    }
    // On success, identity_verification_status is flipped to 'verified' by
    // identityVerificationService.completeIdentityVerification(), which also
    // sets identity_verified=true and triggers the subscription charge.

    return result;
  }
}
