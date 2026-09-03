import { describe, expect, it } from 'vitest';
import { buildOnboardingSteps, type OnboardingEligibility } from '../lib/onboardingSteps.js';

const nothingDone: OnboardingEligibility = {
  emailVerified: false,
  identityVerified: false,
  subscriptionTierSelected: false,
  subscriptionActive: false,
  paymentMethodVerified: false,
  payoutVerified: false,
};

describe('buildOnboardingSteps', () => {
  it('returns the five required steps in the order members must complete them', () => {
    expect(buildOnboardingSteps(nothingDone).map(step => step.key)).toEqual([
      'email', 'subscription', 'payment_method', 'payout', 'identity',
    ]);
  });

  it('links every step to a member-facing dashboard page, never an API route', () => {
    for (const step of buildOnboardingSteps(nothingDone)) {
      expect(step.href.startsWith('/')).toBe(true);
      expect(step.href.startsWith('/api')).toBe(false);
    }
  });

  it('marks only the completed steps as complete', () => {
    const steps = buildOnboardingSteps({
      ...nothingDone,
      emailVerified: true,
      identityVerified: true,
    });
    expect(steps.filter(step => step.complete).map(step => step.key)).toEqual(['email', 'identity']);
  });

  it('treats an unverified payment method or payout as outstanding even when one exists', () => {
    const steps = buildOnboardingSteps({
      ...nothingDone,
      subscriptionTierSelected: true,
      paymentMethodVerified: false,
      payoutVerified: false,
    });
    const outstanding = steps.filter(step => !step.complete).map(step => step.key);
    expect(outstanding).toContain('payment_method');
    expect(outstanding).toContain('payout');
  });

  it('keeps the subscription step incomplete until billing is active', () => {
    const subscriptionStep = buildOnboardingSteps({
      ...nothingDone,
      subscriptionTierSelected: true,
      subscriptionActive: false,
    }).find(step => step.key === 'subscription');
    expect(subscriptionStep?.complete).toBe(false);
    expect(subscriptionStep?.label).toContain('payment');
  });

  it('explains that the subscription must go active before group access is allowed', () => {
    const subscriptionStep = buildOnboardingSteps(nothingDone).find(step => step.key === 'subscription');
    expect(subscriptionStep?.description).toContain('go active');
  });
});
