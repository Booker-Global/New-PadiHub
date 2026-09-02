import type { Request, Response } from 'express';

const TERMS_SECTIONS = [
  {
    title: 'Identity & Bank Account Verification',
    content: 'To maintain the safety and integrity of PadiHub savings groups, users are required to complete a verification step before their subscription is charged and their group-joining/creation access unlocks. UK-based users complete Stripe Identity verification directly within the PadiHub dashboard (an embedded modal — you are never redirected to a separate Stripe-hosted page). Nigerian users complete Flutterwave Account Resolve, a free check that confirms a provided bank account number matches a real account holder name. Account Resolve is an interim bank-account validation step, not a full identity/KYC verification — PadiHub intends to add a dedicated KYC provider (such as Dojah or Monnify) for Nigerian users in a future update, alongside or in place of Account Resolve.',
  },
  {
    title: 'Charge-Gating — Verification Before Any Charge',
    content: 'For both UK and Nigerian users, no subscription charge is made until verification succeeds. When you select a plan, your card details (UK) or bank account details (Nigeria) are saved but not charged. Your profile shows a "Pending" status while verification is in progress. If verification fails, you are not charged, you receive an email explaining what happened with a clear "try again" action, and you may restart the whole verification and subscription process at any time.',
  },
  {
    title: 'Identity Verification Fee (UK Users)',
    content: 'Stripe Identity verification is free for the first 50 successfully-verified users platform-wide. From the 51st successfully-verified user onward, a one-time £1 fee is added to the first subscription charge collected immediately after your verification succeeds. This fee is only ever applied to a successful verification — a failed or abandoned attempt is never charged and does not count toward the 50-user threshold. By proceeding with identity verification, you agree to this charge if it applies to you.',
  },
  {
    title: 'Bank Account Validation (Nigerian Users)',
    content: 'Flutterwave Account Resolve is provided at no additional cost. There is no charge to Nigerian users for completing Account Resolve through PadiHub. Please note this check validates that your bank account number matches your provided account name — it does not constitute full identity/KYC verification, and a fuller identity verification step is planned for a future update.',
  },
  {
    title: 'Subscription Fees',
    content: 'PadiHub offers exactly two monthly-only subscription tiers with no annual option and no free trial: Basic at £4.99/month (UK) or ₦5,000/month (Nigeria), and Premium at £14.99/month (UK) or ₦10,000/month (Nigeria). Basic lets a member join up to 3 savings groups but cannot create one. Premium lets a member create up to 3 savings groups and join up to 5 more, for up to 8 group memberships in total. Which currency/country is shown depends on the visitor\'s location (IP-based), not a manual toggle.',
  },
  {
    title: 'Contribution Processing Fee Surcharges',
    content: 'Every contribution charge includes a visible processing-fee surcharge added on top of your contribution amount — it is never deducted from the group pot. UK (Stripe): a 1.5% + £0.20 card fee, plus an equal share of a 0.25% + £0.20 payout fee calculated on that cycle\'s total pot and split across all contributing members that cycle (each member\'s share is rounded up to the next penny). Nigeria (Flutterwave): a 2% transaction fee plus 7.5% VAT on that fee, plus an equal share of a tiered payout fee (₦10 for cycle pots under ₦5,000, ₦25 for ₦5,001–₦50,000, ₦50 above ₦50,000) plus 7.5% VAT on that tiered fee, split across all contributing members (rounded up to the next kobo). These fees are itemised on-screen, with VAT shown separately for Flutterwave, before you confirm any contribution. Subscription and verification charges are not surcharged this way — those processor fees are absorbed by PadiHub.',
  },
  {
    title: 'Payout Timing',
    content: 'Because PadiHub uses a separate-charges-and-transfers model (contributions are charged to PadiHub\'s platform balance, then transferred to each cycle\'s recipient), the very first payout made to a new recipient\'s connected account may be delayed by approximately 7–14 days while the platform\'s payment processor completes its standard risk review for new payout destinations. Standard payouts thereafter are typically completed within approximately 3 business days.',
  },
  {
    title: 'Savings Groups',
    content: 'PadiHub facilitates peer-to-peer savings groups (also known as Ajo, Esusu, or Rotating Savings and Credit Associations). PadiHub acts as a platform facilitator only and does not hold, manage, or guarantee any member funds. All contributions and payouts are processed through regulated third-party payment providers (Stripe for UK users, Flutterwave for Nigerian users).',
  },
  {
    title: 'Trust Score',
    content: 'The PadiHub Trust Score is a proprietary metric that reflects a member\'s reliability and contribution history. It is used to build community confidence and is not a credit score. PadiHub makes no representations about the use of Trust Scores outside the platform.',
  },
  {
    title: 'Acceptable Use',
    content: 'Members must not use PadiHub for money laundering, fraud, or any illegal activity. PadiHub reserves the right to suspend or terminate accounts found to be in violation of these terms.',
  },
  {
    title: 'Governing Law',
    content: 'These terms are governed by the laws of England and Wales for UK users, and the laws of the Federal Republic of Nigeria for Nigerian users.',
  },
];

const PRIVACY_SECTIONS = [
  {
    title: 'Data We Collect',
    content: 'We collect your name, email address, country, and payment information necessary to provide the PadiHub service. For UK users undergoing identity verification, we collect identity document data processed by Stripe Identity. For Nigerian users, we collect the bank account number and account name you provide for Flutterwave Account Resolve, a bank-account validation check — we do not store your BVN.',
  },
  {
    title: 'How We Use Your Data',
    content: 'Your data is used to operate your account, process contributions and payouts, calculate your Trust Score, send transactional emails, and comply with legal obligations.',
  },
  {
    title: 'Data Sharing',
    content: 'We share data with Stripe (payment processing and identity verification for UK users), Flutterwave (payment processing and Account Resolve bank-account validation for Nigerian users), and Resend (transactional email delivery). We do not sell your personal data.',
  },
  {
    title: 'Data Retention',
    content: 'We retain your account data for as long as your account is active. Audit logs are retained for 7 years for compliance purposes. You may request deletion of your account data subject to legal retention requirements.',
  },
  {
    title: 'Your Rights',
    content: 'UK users have rights under the UK GDPR including access, rectification, erasure, and portability. Nigerian users have rights under the Nigeria Data Protection Regulation (NDPR). Contact hello@padihub.com to exercise your rights.',
  },
];

export const legalController = {
  terms: (_req: Request, res: Response) => {
    res.json({
      success:      true,
      version:      '2.0',
      effective_date: '2026-09-02',
      sections:     TERMS_SECTIONS,
    });
  },

  privacy: (_req: Request, res: Response) => {
    res.json({
      success:      true,
      version:      '1.1',
      effective_date: '2026-09-02',
      sections:     PRIVACY_SECTIONS,
    });
  },
};
