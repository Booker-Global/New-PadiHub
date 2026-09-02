import type { PricingRegion } from '@/lib/pricingRegion';

export interface FAQEntry {
  q: string;
  a: string;
}

const costAnswerByRegion: Record<PricingRegion, string> = {
  UK: 'PadiHub has two monthly-only plans. Basic: £4.99/month. Join up to 3 savings groups; cannot create a group. Premium: £14.99/month. Create up to 3 savings groups and join up to 5 more (8 group memberships total).',
  NG: 'PadiHub has two monthly-only plans. Basic: ₦5,000/month. Join up to 3 savings groups; cannot create a group. Premium: ₦10,000/month. Create up to 3 savings groups and join up to 5 more (8 group memberships total).',
};

const contributionFeeAnswerByRegion: Record<PricingRegion, string> = {
  UK: 'A card fee of 1.5% + £0.20 is charged on every contribution, plus an equal share of that cycle\'s payout fee (0.25% of the total pot + £0.20), split across all contributing members and rounded up to the next penny. For example, a £10 contribution in a 5-person group totals £10.42. This surcharge is itemised on-screen before you confirm and is never deducted from the pot.',
  NG: 'A transaction fee of 2% of the contribution plus 7.5% VAT on that fee is charged on every contribution, plus an equal share of that cycle\'s tiered payout fee (₦10 / ₦25 / ₦50 depending on pot size), with VAT shown separately and each share rounded up to the next kobo. This surcharge is itemised on-screen before you confirm and is never deducted from the pot.',
};

// Builds the FAQ list for a resolved region — the "How much does PadiHub
// cost?" answer must show only that region's prices, never both at once.
export function getFaqEntries(region: PricingRegion): FAQEntry[] {
  return [
    { q: 'How do I join a savings group?', a: 'You can join a group by accepting an invitation link from a group leader, or by browsing available groups after you subscribe. Once you request to join, the group leader will approve your membership. A brand-new group only moves from "Draft" to "Active" (and starts collecting contributions) once it has at least 3 verified members.' },
    { q: 'How do I create a savings group?', a: 'After subscribing to a Premium plan, go to My Groups and click "Create Group". Our step-by-step wizard will guide you through setting up your group name, contribution amount, group size, rotation rules and inviting members. The "Start Group" button stays disabled until at least 3 verified members have joined.' },
    { q: 'How do payments work?', a: 'Each cycle (daily, weekly or monthly, depending on your group\'s schedule), every member contributes the agreed amount plus a small, clearly itemised processing-fee surcharge. PadiHub uses secure, region-appropriate payment processing for contributions — subscription and identity-verification charges only ever occur after your verification succeeds.' },
    { q: 'What are the contribution processing fees?', a: contributionFeeAnswerByRegion[region] },
    { q: 'What\'s the grace period for a missed payment?', a: 'If a contribution charge fails, you get a fixed 72-hour grace period before PadiHub automatically retries the charge exactly once. If that single retry also fails, the payment is marked in default. There are no further automatic retries.' },
    { q: 'What happens if someone leaves the group or defaults on a payment?', a: 'Whenever a member leaves (by choice) or is suspended after breaching the group\'s maximum-permitted-defaults setting, that member is removed, the final period on the group\'s timeline is deleted, and everyone remaining moves up one payout slot — this is called Compensated Compression. Recovering a specific missed contribution from a member who later defaults is the group\'s own responsibility, not PadiHub\'s — we\'ll notify everyone clearly, but we do not guarantee, insure, or recover the money for you.' },
    { q: 'Why did my payout date move?', a: 'Your payout date can move if another member leaves or is suspended before your turn — the remaining schedule automatically compresses (Compensated Compression) so nobody waits for a slot that no longer needs filling. We always email every member both the new date and the new payout amount when this happens.' },
    { q: 'Why a contribution fee instead of a payout deduction?', a: 'We add the card/transaction processing fee on top of your contribution, rather than deducting it from the pot, so every recipient still gets their full contribution amount when it\'s their turn to be paid out — nobody\'s payout is ever short-changed by processing costs.' },
    { q: 'How are the first 3 payout slots assigned?', a: 'When a group activates, its first 3 payout slots go to the Group Organiser and/or the members with the highest verified Trust Score at that moment. Anyone admitted to the group after it\'s already running is automatically added to the end of the remaining payout sequence.' },
    { q: 'What happens if I delete my account?', a: 'Your account is deactivated and your personal data is anonymised. We also keep a permanent, hashed record of your email address so it can never be used to create a new PadiHub account — this exists to stop someone from evading a default or suspension history by simply signing up again.' },
    { q: 'What is Trust Score™?', a: 'Trust Score™ is your reputation on PadiHub. It\'s based on your payment history — successful on-time payments and completed cycles increase your score, while missed payments, defaults, or being removed from a group reduce it. A higher Trust Score makes it easier to join new groups and can qualify you for one of the first 3 payout slots.' },
    { q: 'How much does PadiHub cost?', a: costAnswerByRegion[region] },
    { q: 'Can I cancel my subscription?', a: 'Yes, you can cancel anytime from your Settings page. There are no cancellation fees. Your access continues until the end of your current billing period. Note that your subscription billing only ever starts once you\'re a verified member of an active group — it stays inert at signup.' },
    { q: 'Is PadiHub secure?', a: 'Yes. PadiHub uses secure payment processing to handle all transactions. We never store your card details. All data is encrypted in transit and at rest.' },
    { q: 'Is PadiHub a bank?', a: 'No. PadiHub is not a bank, wallet or financial institution. We provide the platform and tools that help groups of people save together. We do not hold or manage your funds, and we do not insure or guarantee group contributions, payouts, or losses — that risk sits with the Group Creator and members.' },
  ];
}

