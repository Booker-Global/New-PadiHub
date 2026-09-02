export interface BankAccountValidationResult {
  verified: boolean;
  accountName?: string;
  message: string;
}

/**
 * A distinct, swappable "bank account validation" step — deliberately kept
 * separate from IIdentityVerificationProvider. It only confirms that a bank
 * account number resolves to a real, named account holder; it is NOT full
 * identity/KYC verification. NG currently implements this with Flutterwave's
 * free Account Resolve API (see FlutterwaveAccountResolveProvider), but a
 * dedicated KYC provider (Dojah or Monnify, still being decided) can be
 * added alongside or in place of it later just by implementing this
 * interface — no caller needs to change.
 *
 * TODO(NG paid KYC tier): a full BVN-based identity verification flow is a
 * planned future PAID tier for Nigeria, separate from this free interim
 * Account Resolve check. It is NOT being built now — this is only a marker
 * for where it slots in later: it would implement this same
 * IBankAccountValidationProvider interface (or a new, similarly-shaped
 * IIdentityVerificationProvider for full KYC) and be selected instead of /
 * alongside FlutterwaveAccountResolveProvider for users on that paid tier,
 * without requiring changes to any caller of this interface.
 */
export interface IBankAccountValidationProvider {
  validateBankAccount(details: { accountNumber: string; bankCode: string }): Promise<BankAccountValidationResult>;
}
