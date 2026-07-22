/**
 * Flutterwave BVN identity provider — Nigeria users only.
 * BVN verification is free to the user; PadiHub absorbs any API costs.
 * The BVN itself is never stored — only the verification reference.
 */
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import type {
  IIdentityVerificationProvider,
  VerificationSessionResult,
  VerificationStatusResult,
  IdentityWebhookResult,
} from './IdentityVerificationInterface.js';

const FLW_BASE = 'https://api.flutterwave.com/v3';

function getHeaders() {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY environment variable is not set.');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export class FlutterwaveIdentityProvider implements IIdentityVerificationProvider {
  /** Not used for BVN flow — BVN initiation is via initiateBvnVerification() */
  async createVerificationSession(_userId: string): Promise<VerificationSessionResult> {
    return { sessionId: 'bvn_flow' };
  }

  async getVerificationStatus(userId: string): Promise<VerificationStatusResult> {
    const rows = await db.select({
      identity_verified:    schema.users.identity_verified,
      identity_verified_at: schema.users.identity_verified_at,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!rows.length) return { verified: false };
    return {
      verified:   rows[0].identity_verified,
      verifiedAt: rows[0].identity_verified_at ?? undefined,
    };
  }

  /** BVN webhook not used — OTP confirmation is synchronous */
  async handleWebhook(_payload: Buffer, _signature: string): Promise<IdentityWebhookResult> {
    return { handled: false };
  }

  /** No fee for Nigerian users */
  async addVerificationFeeToFirstInvoice(_userId: string): Promise<void> {
    // No-op — BVN verification is free to the user
  }

  /** Step 1: Initiate BVN consent — Flutterwave sends OTP to BVN-registered phone */
  async initiateBvnVerification(userId: string, bvn: string): Promise<{ message: string }> {
    const response = await axios.post(
      `${FLW_BASE}/bvn-consents/${bvn}`,
      {},
      { headers: getHeaders() },
    );
    const reference = response.data?.data?.reference as string | undefined;
    if (!reference) throw new Error('No verification reference returned from Flutterwave.');

    // Store reference (NOT the BVN) on user record
    await db.update(schema.users)
      .set({ bvn_verification_reference: reference })
      .where(eq(schema.users.id, userId));

    return { message: 'OTP sent to your BVN-registered phone number' };
  }

  /** Step 2: Confirm OTP to complete BVN verification */
  async confirmBvnOtp(userId: string, otp: string): Promise<{ verified: boolean; message: string }> {
    const rows = await db.select({ bvn_verification_reference: schema.users.bvn_verification_reference })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!rows.length || !rows[0].bvn_verification_reference) {
      throw new Error('No pending BVN verification found. Please initiate verification first.');
    }

    const response = await axios.post(
      `${FLW_BASE}/bvn-consents/verify`,
      { reference: rows[0].bvn_verification_reference, otp },
      { headers: getHeaders() },
    );

    const status = response.data?.data?.status as string | undefined;
    if (status !== 'completed') {
      return { verified: false, message: 'OTP verification failed. Please try again.' };
    }

    await db.update(schema.users)
      .set({
        identity_verified:          true,
        identity_verified_at:       new Date(),
        bvn_verification_reference: null,
      })
      .where(eq(schema.users.id, userId));

    return { verified: true, message: 'BVN verified successfully.' };
  }
}
