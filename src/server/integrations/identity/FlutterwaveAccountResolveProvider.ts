/**
 * Flutterwave "Account Resolve" bank-account-validation provider — Nigeria
 * users only. Free interim replacement for the earlier planned BVN/₦50 flow.
 * It only confirms that a bank account number matches a real, named account
 * holder (via Flutterwave's /accounts/resolve endpoint) — it is NOT full
 * identity/KYC verification. See BankAccountValidationInterface.ts for why
 * this is kept as its own swappable step.
 */
import axios from 'axios';
import type { IBankAccountValidationProvider, BankAccountValidationResult } from './BankAccountValidationInterface.js';

const FLW_BASE = 'https://api.flutterwave.com/v3';

function getHeaders() {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY environment variable is not set.');
  return {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  };
}

export class FlutterwaveAccountResolveProvider implements IBankAccountValidationProvider {
  async validateBankAccount(details: { accountNumber: string; bankCode: string }): Promise<BankAccountValidationResult> {
    try {
      const response = await axios.post(
        `${FLW_BASE}/accounts/resolve`,
        { account_number: details.accountNumber, account_bank: details.bankCode },
        { headers: getHeaders() },
      );
      const accountName = response.data?.data?.account_name as string | undefined;
      if (!accountName) {
        return { verified: false, message: 'Could not resolve an account holder name for those bank details. Double-check the account number and bank, then try again.' };
      }
      return { verified: true, accountName, message: `Account resolved to ${accountName}.` };
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message
        : undefined;
      return {
        verified: false,
        message: message ?? 'This bank account could not be validated. Double-check the account number and bank, then try again.',
      };
    }
  }
}
