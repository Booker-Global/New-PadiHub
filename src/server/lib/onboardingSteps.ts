/**
 * The ordered onboarding path every member must finish before they can
 * create or join a savings group:
 *   a) sign up and confirm their email address,
 *   b) choose a subscription plan,
 *   c) add a payment card and payout details,
 *   d) verify their identity.
 *
 * Completing all four sets `account_status` to 'active' and unlocks group
 * creation/joining — it does NOT create or charge a platform subscription.
 * `users.subscription_status` stays 'pending' until the member joins/creates
 * a group that reaches 3+ active members and the group leader launches it —
 * that is the one and only moment the subscription is actually created and
 * the member's card is charged (see
 * subscriptionService.reconcileBillingForActiveGroupMembership, invoked from
 * groupService.activateGroup).
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
      description: 'Pick Basic or Premium. Your card is only charged once you join or create a group that launches with 3 or more members.',
      href: '/subscription/manage',
      complete: eligibility.subscriptionTierSelected,
    },
    {
      key: 'payment_method',
      label: 'Add your payment card',
      description: 'The card your contributions (and, once a group you\'re in launches, your subscription) are charged to.',
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
      description: 'A quick ID and selfie check that keeps every PadiHub savings group trustworthy.',
      href: '/verify-identity',
      complete: eligibility.identityVerified,
    },
  ];
}

/** Lower-cases the first character of a step label for use mid-sentence. */
export function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
