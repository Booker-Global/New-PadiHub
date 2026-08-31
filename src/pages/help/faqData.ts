import type { PricingRegion } from '@/lib/pricingRegion';

export interface FAQEntry {
  q: string;
  a: string;
}

const costAnswerByRegion: Record<PricingRegion, string> = {
  UK: 'PadiHub has two monthly-only plans. Pro Group: £4.99/month. Create ONE savings group; be a member of up to 5 groups total. Elite Group: £9.99/month. Create up to SEVEN savings groups; be a member of up to 10 groups total.',
  NG: 'PadiHub has two monthly-only plans. Pro Group: ₦5,000/month. Create ONE savings group; be a member of up to 5 groups total. Elite Group: ₦10,000/month. Create up to SEVEN savings groups; be a member of up to 10 groups total.',
};

// Builds the FAQ list for a resolved region — the "How much does PadiHub
// cost?" answer must show only that region's prices, never both at once.
export function getFaqEntries(region: PricingRegion): FAQEntry[] {
  return [
    { q: 'How do I join a savings group?', a: 'You can join a group by accepting an invitation link from a group leader, or by browsing available groups after you subscribe. Once you request to join, the group leader will approve your membership.' },
    { q: 'How do I create a savings group?', a: 'After subscribing, go to My Groups and click "Create Group". Our step-by-step wizard will guide you through setting up your group name, contribution amount, group size, rotation rules and inviting members.' },
    { q: 'How do payments work?', a: 'Each month (or week, depending on your group\'s schedule), every member contributes the agreed amount. PadiHub uses secure, region-appropriate payment processing for contributions.' },
    { q: 'What happens if I miss a payment?', a: 'If you miss a payment, your Trust Score will be affected. Your group leader sets the grace period (24–72 hours) and the maximum number of missed payments before a member is removed. You\'ll receive reminders before your payment is due.' },
    { q: 'What is Trust Score™?', a: 'Trust Score™ is your reputation on PadiHub. It\'s based on your payment history — successful on-time payments increase your score, while late or missed payments reduce it. A higher Trust Score makes it easier to join new groups.' },
    { q: 'How much does PadiHub cost?', a: costAnswerByRegion[region] },
    { q: 'Can I cancel my subscription?', a: 'Yes, you can cancel anytime from your Settings page. There are no cancellation fees. Your access continues until the end of your current billing period.' },
    { q: 'Is PadiHub secure?', a: 'Yes. PadiHub uses secure payment processing to handle all transactions. We never store your card details. All data is encrypted in transit and at rest.' },
    { q: 'Is PadiHub a bank?', a: 'No. PadiHub is not a bank, wallet or financial institution. We provide the platform and tools that help groups of people save together. We do not hold or manage your funds.' },
  ];
}

