/**
 * The ordered onboarding path every member must finish before they can
 * create or join a savings group:
 *   a) sign up and confirm their email address,
 *   b) choose a subscription plan and accept the terms,
 *   c) add a payment card,
 *   d) add payout details,
 *   e) verify their identity — done LAST, on purpose: only once verification
 *      succeeds does the platform subscription actually get charged/created
 *      (see identityVerificationService.completeIdentityVerification), so a
 *      plan + card must already be on file before identity verification can
 *      make the subscription genuinely active.
 *
 * `href` is always a member-facing dashboard page — never an API route — so
 * the same list can drive the blocked-action message, the dashboard's
 * profile-completion card and the invitation flow. Kept free of any database
 * or provider imports so it stays a pure, directly testable description of
 * the flow.
 */
export type OnboardingStep = {
  key: 'email' | 'identity' | 'subscription' | 'payment_method' | 'payout';
  label: string;
  description: string;
  href: string;
  complete: boolean;
};

export type OnboardingEligibility = {
  emailVerified: boolean;
  identityVerified: boolean;
  subscriptionTierSelected: boolean;
  paymentMethodVerified: boolean;
  payoutVerified: boolean;
};

export function buildOnboardingSteps(eligibility: OnboardingEligibility): OnboardingStep[] {
  return [
    {
      key: 'email',
      label: 'Confirm your email address',
      description: 'Confirm the email address you signed up with so we can reach you about your groups.',
      href: '/verify-email',
      complete: eligibility.emailVerified,
    },
    {
      key: 'subscription',
      label: 'Choose your subscription plan',
      description: 'Pick Basic or Premium and accept the terms. Your subscription fee is only charged once you are part of a valid, active group with at least three members.',
      href: '/subscription/manage',
      complete: eligibility.subscriptionTierSelected,
    },
    {
      key: 'payment_method',
      label: 'Add your payment card',
      description: 'The card your contributions (and your subscription) are charged to.',
      href: '/payments/methods',
      complete: eligibility.paymentMethodVerified,
    },
    {
      key: 'payout',
      label: 'Add your payout details',
      description: 'Where we send your money when it is your turn to be paid out.',
      href: '/payments/payout',
      complete: eligibility.payoutVerified,
    },
    {
      key: 'identity',
      label: 'Verify your identity',
      description: 'A quick ID and selfie check that keeps every PadiHub savings group trustworthy. Completing this last is what makes your subscription go active.',
      href: '/verify-identity',
      complete: eligibility.identityVerified,
    },
  ];
}

/** Lower-cases the first character of a step label for use mid-sentence. */
export function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
