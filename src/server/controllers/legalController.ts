import type { Request, Response } from 'express';

const TERMS_SECTIONS = [
  {
    title: 'Identity Verification',
    content: 'To maintain the safety and integrity of PadiHub savings groups, users who create a savings group are required to complete identity verification before their group becomes active. UK-based users will be verified using Stripe Identity, a secure third-party identity verification service. Nigerian users will be verified via BVN (Bank Verification Number) confirmation through Flutterwave.',
  },
  {
    title: 'Identity Verification Fee (UK Users)',
    content: "A one-time identity verification fee of £1.50 will be added to your first month's subscription invoice. This fee covers the cost of securely verifying your identity through Stripe Identity. This charge will appear on your invoice as 'Identity Verification Fee (one-time)'. This fee is non-refundable once verification has been initiated. By proceeding with identity verification, you agree to this charge.",
  },
  {
    title: 'Identity Verification Fee (Nigerian Users)',
    content: 'BVN verification for Nigerian users is provided at no additional cost. There is no charge to Nigerian users for completing BVN verification through PadiHub.',
  },
  {
    title: 'Subscription Fees',
    content: "PadiHub charges a monthly platform subscription fee of £4.99 (UK) or ₦3,500 (Nigeria). For UK users completing identity verification, the first month's invoice will include the £1.50 identity verification fee, making the first payment £6.49. Subsequent monthly payments will be £4.99.",
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
    content: 'We collect your name, email address, country, and payment information necessary to provide the PadiHub service. For UK users undergoing identity verification, we collect identity document data processed by Stripe Identity. For Nigerian users, we initiate BVN consent via Flutterwave but do not store your BVN.',
  },
  {
    title: 'How We Use Your Data',
    content: 'Your data is used to operate your account, process contributions and payouts, calculate your Trust Score, send transactional emails, and comply with legal obligations.',
  },
  {
    title: 'Data Sharing',
    content: 'We share data with Stripe (payment processing and identity verification for UK users), Flutterwave (payment processing and BVN verification for Nigerian users), and Resend (transactional email delivery). We do not sell your personal data.',
  },
  {
    title: 'Data Retention',
    content: 'We retain your account data for as long as your account is active. Audit logs are retained for 7 years for compliance purposes. You may request deletion of your account data subject to legal retention requirements.',
  },
  {
    title: 'Your Rights',
    content: 'UK users have rights under the UK GDPR including access, rectification, erasure, and portability. Nigerian users have rights under the Nigeria Data Protection Regulation (NDPR). Contact privacy@padihub.com to exercise your rights.',
  },
];

export const legalController = {
  terms: (_req: Request, res: Response) => {
    res.json({
      success:      true,
      version:      '1.0',
      effective_date: '2026-01-01',
      sections:     TERMS_SECTIONS,
    });
  },

  privacy: (_req: Request, res: Response) => {
    res.json({
      success:      true,
      version:      '1.0',
      effective_date: '2026-01-01',
      sections:     PRIVACY_SECTIONS,
    });
  },
};
