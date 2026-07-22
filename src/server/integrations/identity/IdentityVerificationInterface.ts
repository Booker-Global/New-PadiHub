export interface VerificationSessionResult {
  sessionId: string;
  clientSecret?: string;
  url?: string;
}

export interface VerificationStatusResult {
  verified: boolean;
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
  /** UK only — adds £1.50 pending invoice item to first subscription invoice */
  addVerificationFeeToFirstInvoice(userId: string): Promise<void>;
}
