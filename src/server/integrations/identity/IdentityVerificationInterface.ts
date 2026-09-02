export type IdentityVerificationStatus = 'not_started' | 'pending' | 'verified' | 'failed';

export interface VerificationSessionResult {
  sessionId: string;
  clientSecret?: string;
  url?: string;
}

export interface VerificationStatusResult {
  verified: boolean;
  status: IdentityVerificationStatus;
  verifiedAt?: Date;
  sessionId?: string;
}

export interface IdentityWebhookResult {
  handled: boolean;
  event?: string;
  userId?: string;
}

export interface IIdentityVerificationProvider {
  createVerificationSession(userId: string): Promise<VerificationSessionResult>;
  getVerificationStatus(userId: string): Promise<VerificationStatusResult>;
  handleWebhook(payload: Buffer, signature: string): Promise<IdentityWebhookResult>;
  /**
   * UK only — adds a one-time verification-fee pending invoice item to the
   * user's Stripe customer record so it's picked up by the next invoice
   * generated (normally the first subscription invoice). `amountPence` is
   * 0 for the first 50 successfully-verified users platform-wide, 100 (£1)
   * from the 51st onward — see identityVerificationService.ts. A no-op when
   * amountPence is 0, and always a no-op for NG (no verification fee there).
   */
  addVerificationFeeToFirstInvoice(userId: string, amountPence: number): Promise<void>;
}
