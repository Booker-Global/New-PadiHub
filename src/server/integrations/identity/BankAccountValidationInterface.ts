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
 */
export interface IBankAccountValidationProvider {
  validateBankAccount(details: { accountNumber: string; bankCode: string }): Promise<BankAccountValidationResult>;
}
