// Reusable, single-source-of-truth Terms & Conditions content.
//
// This file exists so the full disclosure text lives in exactly one place
// and can be embedded anywhere PadiHub needs to show these terms (the
// standalone /terms page, an onboarding "review terms" step, a payment
// authorization modal, etc.) without duplicating copy that then drifts out
// of sync. To add or edit a disclosure, edit `TERMS_SECTIONS` below — do not
// hardcode terms copy elsewhere.
import { FileText, Shield, Users, AlertTriangle } from 'lucide-react';

export type TermsRegion = 'UK' | 'NG';

type TermsSectionContentItem = {
  subtitle: string;
  text: string | ((region: TermsRegion) => string);
};

export type TermsSection = {
  id: string;
  title: string;
  icon: typeof FileText;
  color: string;
  region?: TermsRegion;
  content: TermsSectionContentItem[];
};

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    icon: FileText,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'Agreement',
        text: 'By creating a PadiHub account or using any part of the PadiHub platform, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use PadiHub.',
      },
      {
        subtitle: 'Updates to Terms',
        text: 'We may update these Terms from time to time. We will notify you of significant changes by email or through the platform. Continued use of PadiHub after changes constitutes acceptance of the updated Terms.',
      },
      {
        subtitle: 'Eligibility',
        text: 'You must be at least 18 years old to use PadiHub. By using the platform, you confirm that you meet this requirement and that the information you provide is accurate.',
      },
    ],
  },
  {
    id: 'platform-description',
    title: '2. Platform Description',
    icon: Users,
    color: '#2eafaf',
    content: [
      {
        subtitle: 'What PadiHub Is',
        text: 'PadiHub is a Community Savings Infrastructure Platform that provides digital tools for communities to organise, govern, and coordinate savings activities. PadiHub is not a bank, financial institution, payment processor, or investment service.',
      },
      {
        subtitle: 'What PadiHub Is Not',
        text: 'PadiHub does not hold, process, or transfer funds on behalf of members or communities. PadiHub does not provide financial advice, investment recommendations, or regulated financial services. All financial transactions between community members are conducted independently of PadiHub, which acts only as a pass-through utility and never issues credit to any member.',
      },
      {
        subtitle: 'Trust Score™',
        text: 'Trust Score™ is a reputation metric calculated from your activity on PadiHub. It is an informational tool for community use and does not constitute a credit score, financial assessment, or regulated rating.',
      },
    ],
  },
  {
    id: 'membership',
    title: '3. Membership & Subscriptions',
    icon: Shield,
    color: '#8B5CF6',
    content: [
      {
        subtitle: 'Subscription Plans',
        text: (region: TermsRegion) => region === 'NG'
          ? 'PadiHub offers exactly two monthly-only subscription tiers with no annual option and no free trial: Basic at ₦5,000/month, and Premium at ₦10,000/month. Basic lets a member join up to 3 savings groups but cannot create one. Premium lets a member create up to 3 savings groups and join up to 5 more, for up to 8 group memberships in total.'
          : 'PadiHub offers exactly two monthly-only subscription tiers with no annual option and no free trial: Basic at £4.99/month, and Premium at £14.99/month. Basic lets a member join up to 3 savings groups but cannot create one. Premium lets a member create up to 3 savings groups and join up to 5 more, for up to 8 group memberships in total.',
      },
      {
        subtitle: 'Cancellation',
        text: 'You may cancel your subscription at any time through Settings → Subscription & Billing. Cancellation takes effect at the end of your current billing period. We do not offer refunds for partial periods.',
      },
      {
        subtitle: 'Account Suspension',
        text: 'We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or harm the PadiHub community.',
      },
    ],
  },
  {
    id: 'community-rules',
    title: '4. Community Rules & Conduct',
    icon: Users,
    color: '#F59E0B',
    content: [
      {
        subtitle: 'Respectful Participation',
        text: 'All members must treat each other with respect. Harassment, discrimination, hate speech, or abusive behaviour of any kind is strictly prohibited and will result in immediate account suspension.',
      },
      {
        subtitle: 'Honest Representation',
        text: 'You must represent yourself honestly on PadiHub. Creating fake accounts, misrepresenting your identity, or manipulating your Trust Score™ through dishonest means is prohibited.',
      },
      {
        subtitle: 'Community Governance',
        text: 'When participating in community governance, you must vote honestly and in good faith. Attempting to manipulate governance outcomes through coordinated inauthentic behaviour is prohibited.',
      },
      {
        subtitle: 'Financial Responsibility',
        text: 'PadiHub facilitates community coordination but is not responsible for financial commitments made between community members. Members are individually responsible for their savings commitments.',
      },
    ],
  },
  {
    id: 'intellectual-property',
    title: '5. Intellectual Property',
    icon: FileText,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'PadiHub IP',
        text: 'PadiHub™, Trust Score™, and Community DNA™ are trademarks of PadiHub. The platform, its design, and all original content are protected by copyright and other intellectual property laws.',
      },
      {
        subtitle: 'Your Content',
        text: 'You retain ownership of content you create on PadiHub (profile information, community posts, etc.). By posting content, you grant PadiHub a licence to display and use that content to provide the service.',
      },
      {
        subtitle: 'Restrictions',
        text: 'You may not copy, modify, distribute, or create derivative works from PadiHub\'s platform, design, or proprietary features without our written permission.',
      },
    ],
  },
  {
    id: 'liability',
    title: '6. Limitation of Liability',
    icon: AlertTriangle,
    color: '#EF4444',
    content: [
      {
        subtitle: 'No Financial Liability',
        text: 'PadiHub is not liable for any financial losses arising from community savings activities, missed contributions, or disputes between community members. All financial arrangements are between members directly.',
      },
      {
        subtitle: 'Service Availability',
        text: 'We aim to provide a reliable service but cannot guarantee 100% uptime. PadiHub is not liable for losses arising from service interruptions, technical failures, or data loss beyond our reasonable control.',
      },
      {
        subtitle: 'Limitation',
        text: 'To the maximum extent permitted by law, PadiHub\'s total liability to you for any claim arising from these Terms or your use of the platform shall not exceed the amount you paid for your subscription in the 12 months preceding the claim.',
      },
    ],
  },
  {
    id: 'governing-law',
    title: '7. Governing Law',
    icon: Shield,
    color: '#2eafaf',
    content: [
      {
        subtitle: 'UK Members',
        text: 'For members based in the United Kingdom, these Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.',
      },
      {
        subtitle: 'Nigerian Members',
        text: 'For members based in Nigeria, these Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be subject to the jurisdiction of the courts of Nigeria.',
      },
      {
        subtitle: 'Dispute Resolution',
        text: 'We encourage members to contact us first to resolve any disputes informally. If a dispute cannot be resolved informally, it shall be referred to mediation before any legal proceedings are commenced.',
      },
    ],
  },
  {
    id: 'identity-verification',
    title: '8. Identity & Bank Account Verification',
    icon: Shield,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'Requirement to Verify',
        text: 'To keep PadiHub savings groups safe, all users must complete a verification step before their subscription is charged and their group-joining/creation access unlocks. This requirement applies to every user, regardless of country.',
      },
      {
        subtitle: 'UK Users — Stripe Identity, Embedded',
        text: 'UK-based users complete Stripe Identity verification directly within the PadiHub dashboard, using an embedded verification flow — you are never redirected to a separate Stripe-hosted page. You will be asked to provide a government-issued photo ID and a selfie. PadiHub does not store your identity documents — they are processed and held by Stripe in accordance with their privacy policy.',
      },
      {
        subtitle: 'Nigerian Users — Flutterwave Account Resolve',
        text: 'Nigerian users complete Flutterwave Account Resolve, a free check that confirms a provided bank account number matches a real account holder name. Account Resolve is a preliminary bank-account validation step — it is not full identity/KYC verification. PadiHub plans to add a dedicated KYC provider (such as Dojah or Monnify) for Nigerian users in a future update, alongside or in place of Account Resolve, without requiring you to redo this step.',
      },
      {
        subtitle: 'No Charge Until Verification Succeeds',
        text: 'For both UK and Nigerian users, your subscription is never charged until verification succeeds. Your card (UK) or bank account details (Nigeria) are saved but not charged while your profile shows a "Pending" status. If verification fails, no charge occurs, you receive an email explaining what happened with a clear "try again" action, and you may restart the entire verification and subscription process.',
      },
    ],
  },
  {
    id: 'identity-verification-fee-uk',
    title: '9. Identity Verification Fee (UK Users)',
    icon: AlertTriangle,
    color: '#F59E0B',
    region: 'UK' as TermsRegion,
    content: [
      {
        subtitle: 'Free for the First 50 Verified Users',
        text: 'Stripe Identity verification is free for the first 50 successfully-verified users platform-wide. This threshold is tracked using a race-safe counter so it can never let more than 50 free verifications through, even under concurrent verification attempts.',
      },
      {
        subtitle: 'One-Time Fee From the 51st Verified User Onward',
        text: 'From the 51st successfully-verified user onward, a one-time £1 fee is added to the first subscription charge collected immediately after your verification succeeds. Only a successful verification can trigger this fee or count toward the 50-user threshold — a failed or abandoned attempt is never charged.',
      },
      {
        subtitle: 'How It Appears on Your Invoice',
        text: 'If it applies to you, the fee will appear on your first invoice as "Identity Verification Fee (one-time)", collected together with your first monthly subscription payment, which only occurs after your identity verification has succeeded.',
      },
      {
        subtitle: 'Non-Refundable',
        text: 'The identity verification fee, where charged, is non-refundable once your identity has been successfully verified. By proceeding with identity verification, you agree to this charge if it applies to you.',
      },
    ],
  },
  {
    id: 'identity-verification-fee-ng',
    title: '10. Bank Account Validation (Nigerian Users)',
    icon: Shield,
    color: '#2eafaf',
    region: 'NG' as TermsRegion,
    content: [
      {
        subtitle: 'No Charge for Nigerian Users',
        text: 'Flutterwave Account Resolve is provided at no additional cost to Nigerian users. There is no charge for completing Account Resolve through PadiHub.',
      },
      {
        subtitle: 'Interim Validation, Not Full KYC',
        text: 'Account Resolve confirms that your provided bank account number matches your account holder name — it does not constitute full identity/KYC verification. PadiHub plans to add a dedicated KYC provider for Nigerian users in a future update.',
      },
      {
        subtitle: 'Standard Subscription Pricing',
        text: 'Nigerian users can subscribe to Basic at ₦5,000/month or Premium at ₦10,000/month. Basic lets a member join up to 3 savings groups but cannot create one. Premium lets a member create up to 3 savings groups and join up to 5 more, for up to 8 group memberships in total. There is no annual billing option, no free trial, and no verification surcharge. Your subscription is only charged after your Account Resolve check succeeds.',
      },
    ],
  },
  {
    id: 'contribution-processing-fees',
    title: '11. Contribution Payment Processing Fees',
    icon: AlertTriangle,
    color: '#F59E0B',
    content: [
      {
        subtitle: 'Fee Added to Each Contribution Charge',
        text: 'Every recurring group contribution charge includes a visible processing-fee surcharge added on top of your contribution amount and charged to you at the same time — it is never deducted from the group pot, so every member still receives their full contribution amount when it is their turn to be paid out.',
      },
      {
        subtitle: 'UK Rates (Stripe)',
        text: 'A card fee of 1.5% + £0.20 is charged on every contribution, plus an equal share of a payout fee (0.25% of that cycle\'s total pot + £0.20), split across all members contributing that cycle and rounded up to the next penny. Worked example: a £10 contribution in a 5-person group adds a £0.35 card fee and a £0.07 payout-fee share, for a £10.42 total charge. This applies to any contribution frequency (daily, weekly, or monthly).',
      },
      {
        subtitle: 'Nigeria Rates (Flutterwave)',
        text: 'A transaction fee of 2% of the contribution plus 7.5% VAT on that fee is charged on every contribution, plus an equal share of a tiered payout fee on that cycle\'s total pot (₦10 under ₦5,000; ₦25 for ₦5,001–₦50,000; ₦50 above ₦50,000) plus 7.5% VAT on that tiered fee, split across all contributing members and rounded up to the next kobo. Both the transaction fee and payout-fee share are itemised on-screen with their VAT components shown separately before you confirm a contribution.',
      },
      {
        subtitle: 'Subscription Charges Are Not Surcharged',
        text: 'Unlike contribution charges, processing fees on subscription and identity-verification charges are absorbed by PadiHub, not passed on to you as a surcharge (aside from the identity-verification fee described above, where applicable).',
      },
      {
        subtitle: 'Consent',
        text: 'By ticking the payment authorization checkbox when saving a payment method, you explicitly consent to this processing fee being added to each of your recurring group contribution charges.',
      },
    ],
  },
  {
    id: 'payout-timing',
    title: '12. Payout Timing',
    icon: Shield,
    color: '#2eafaf',
    content: [
      {
        subtitle: 'How Payouts Work',
        text: 'PadiHub charges member contributions to its platform balance and then transfers each cycle\'s total pot to that cycle\'s recipient. This keeps every contribution charge separate from the payout transfer.',
      },
      {
        subtitle: 'First Payout May Be Delayed',
        text: 'The first payout made to a new recipient may be delayed by approximately 7–14 days while our payment processor completes its standard risk review for new payout destinations. This is a standard processor requirement and not specific to any individual member.',
      },
      {
        subtitle: 'Standard Payout Timing',
        text: 'After a recipient\'s first payout has completed, subsequent payouts are typically completed within approximately 3 business days.',
      },
    ],
  },
  {
    id: 'payout-slot-assignment',
    title: '13. Payout Slot Assignment',
    icon: Users,
    color: '#8B5CF6',
    content: [
      {
        subtitle: 'How the First 3 Slots Are Assigned',
        text: 'When a savings group activates, its first 3 payout slots are reserved for the Group Organiser and/or the members with the highest verified Trust Score™ at that moment. This gives priority to the group\'s founder and its most reliable members.',
      },
      {
        subtitle: 'Later Admissions',
        text: 'Any member admitted to a group after it has already activated is added to the end of the remaining payout order — a later admission cannot displace a slot already assigned to an existing member.',
      },
    ],
  },
  {
    id: 'default-handling',
    title: '14. Missed Payments & Default Handling',
    icon: AlertTriangle,
    color: '#EF4444',
    content: [
      {
        subtitle: 'Fixed 72-Hour Grace Period',
        text: 'If a contribution charge fails, you are given a fixed 72-hour grace period before PadiHub automatically retries the charge exactly once. This grace period is fixed platform-wide and is not configurable by individual group leaders.',
      },
      {
        subtitle: 'Single Retry, Then Default',
        text: 'If the single automatic retry also fails, your contribution is marked as a default. There are no further automatic retry attempts for that missed contribution.',
      },
      {
        subtitle: 'Suspension Threshold & Trust Score Impact',
        text: 'Each group\'s creator sets a maximum number of permitted defaults for that group. Once a member\'s default count reaches this threshold, they are automatically suspended and removed from the group, and their Trust Score™ is reduced accordingly.',
      },
      {
        subtitle: 'Fund Recovery Is the Group\'s Responsibility',
        text: 'PadiHub does not guarantee, insure, or recover missed contributions on behalf of a group. Recovering funds from a member who defaults or is suspended is the responsibility of the Group Creator and remaining members, not PadiHub.',
      },
    ],
  },
  {
    id: 'compensated-compression',
    title: '15. Compensated Compression',
    icon: Users,
    color: '#2eafaf',
    content: [
      {
        subtitle: 'What Happens When a Member Leaves',
        text: 'When a member departs a group — whether by voluntary exit, leader removal, or default-triggered suspension — the final remaining period on that group\'s payout timeline is automatically deleted and every remaining member\'s payout slot moves up by one. This automatic recalculation is called Compensated Compression.',
      },
      {
        subtitle: 'Notification to the Group',
        text: 'All remaining group members are notified by email whenever Compensated Compression recalculates the group\'s timeline, including their updated payout date and, where applicable, updated payout amount.',
      },
      {
        subtitle: 'Owner Departure & Succession',
        text: 'If the Group Owner departs a group that is still in Draft (fewer than 3 verified members and no contributions yet collected), the draft is cancelled and any members who had already joined are notified by email. If the group is already Active, the Owner departs through the standard Compensated Compression process above, and Owner status automatically transfers to whichever remaining active member has been in the group the longest (earliest join date — tenure, not Trust Score™). If no other active member remains, the group is closed.',
      },
      {
        subtitle: 'Group Lifecycle Length',
        text: 'When creating a group, the Owner chooses whether it runs indefinitely, with no fixed end date until the Owner chooses to close it, or for a fixed number of complete payout rotations (every active member receiving one payout counts as one rotation). A fixed-length group closes automatically once its set number of rotations has completed. An indefinite group\'s Owner may close it at any time from the group page, other than while a payout cycle is mid-progress.',
      },
    ],
  },
  {
    id: 'governance-voting',
    title: '16. Community Governance Voting',
    icon: Shield,
    color: '#8B5CF6',
    content: [
      {
        subtitle: 'Member Admission Votes',
        text: 'Admitting a new member to a group that already has other members requires a unanimous "accept" vote from all existing active members. Each member can respond directly from an email link within a 48-hour deadline; if that deadline passes without a unanimous accept, the admission does not proceed.',
      },
      {
        subtitle: 'Contribution Claim Votes',
        text: 'Certain claims relating to a member\'s contribution status likewise require a unanimous vote from active group members, cast via the same accept/decline email mechanism within a 48-hour deadline.',
      },
      {
        subtitle: 'Payout Swap Votes',
        text: 'Two members may propose to swap their assigned payout slots. This requires mutual 1:1 acceptance between just the two members involved — not the whole group — also within a 48-hour response deadline.',
      },
      {
        subtitle: 'Member Removal Votes',
        text: 'Any active member may propose a unanimous vote to remove another active member, for example after repeated missed payments. Every other active member must accept within a 48-hour deadline, or the target member remains in the group. A member who is currently the designated recipient of the in-progress payout cycle cannot be targeted by a removal vote until after they have received that cycle\'s payout, to prevent the vote mechanism being used to strip a payout from a member in good standing.',
      },
      {
        subtitle: 'Missed Deadlines',
        text: 'If a governance vote\'s 48-hour deadline passes without the required acceptances, the proposed action is automatically declined and does not take effect.',
      },
    ],
  },
  {
    id: 'account-deletion',
    title: '17. Account Deletion',
    icon: AlertTriangle,
    color: '#F59E0B',
    content: [
      {
        subtitle: 'Deleting Your Account',
        text: 'You may request deletion of your PadiHub account at any time from Settings. Upon deletion, your personal profile data is anonymised.',
      },
      {
        subtitle: 'Permanent Email Block',
        text: 'PadiHub retains a permanent, one-way hashed record of the email address associated with a deleted account. This hashed record is used solely to prevent that email address from being used to create a new PadiHub account in future — for example, to stop someone evading a default or suspension history by simply re-registering.',
      },
    ],
  },
  {
    id: 'profile-completion',
    title: '18. Profile Completion, Activation & Inactive Accounts',
    icon: Shield,
    color: '#2eafaf',
    content: [
      {
        subtitle: 'When Your Profile Is Complete',
        text: 'Your profile is only treated as fully complete once you have signed up, verified your email address, chosen a subscription plan, added and verified a payment card, verified a payout account, and completed identity verification. Joining a savings group comes after these steps — it is separate from profile completion.',
      },
      {
        subtitle: 'Complete Profile, No Group Yet',
        text: 'If you have finished every setup step but have not yet joined a group that has already started with at least 3 active members, we do not charge you yet. Your account may show "Pending Charge" while you wait, but your card is not billed until you become part of an active group. During this waiting period, you may still join or be invited to as many groups as your plan allows.',
      },
      {
        subtitle: 'Reminders if You Have Not Joined a Group',
        text: 'While your profile is complete but you are still not in an active group, we may send reminder emails about every 7 days encouraging you to join one. If 30 days pass after your profile is completed and you still have not joined an active group, we may move your profile back to an incomplete state, make your subscription inactive, and email you to log in, choose a plan again, and join a group before you can become fully active.',
      },
      {
        subtitle: 'Profiles Left Unfinished',
        text: 'If you do not finish every required setup step, your subscription stays inactive and you cannot join or take part in any group until everything is complete. Your dashboard will show what is still missing. Because nothing has been charged at this stage, we do not send payment-failed emails for unfinished profiles — only friendly reminder emails, usually about every 7 days. If a profile stays unfinished for 60 days, we may delete that account and notify you by email. If this happens, you may sign up again later with the same email address.',
      },
    ],
  },
  {
    id: 'billing-start-and-payment-notices',
    title: '19. Subscription Billing, Group Charges & Payment Emails',
    icon: AlertTriangle,
    color: '#EF4444',
    content: [
      {
        subtitle: 'When Subscription Billing Starts',
        text: 'Your subscription billing starts on the day you become an active member of a started group with at least 3 active members. From that date, your subscription renews monthly.',
      },
      {
        subtitle: 'Group Charge and Payout Schedule',
        text: 'The day your group contributions are charged, and the day the group payout is sent, follow the schedule chosen by the Group Owner when the group was created. Charges and payouts are triggered at 07:00 GMT on that day, with an automatic, idempotent catch-up run at 18:00 GMT the same day that retries any accounts not yet successfully charged (for example, due to a temporary payment-provider outage) — this catch-up can never charge you twice for the same contribution. After a payout is sent, the time it takes to reach the recipient\'s bank or mobile money account depends on the payment provider handling that transfer. Please also read the payment processing and payout timing sections of these Terms.',
      },
      {
        subtitle: 'Same-Day Cut-Off for New or Newly-Active Groups',
        text: 'If a group only reaches 3 active members and starts (or a member joins an already-started group) after 17:00 GMT on a day that matches its chosen payout schedule, that day\'s contribution charge and payout are no longer attempted on that date. Instead, the first charge and payout automatically move to the same date (or day of the week) in the following week or month, and affected members are shown the revised date.',
      },
      {
        subtitle: 'Payment Failure Emails',
        text: 'We send a payment-failed email only in two situations: first, if we try to collect your subscription because you have just joined an active group and that charge does not go through; or second, if one of your regular group contribution charges fails. We do not send payment-failed emails for profiles that are still unfinished, or for cards that have simply not been charged yet because the member has not joined an active group.',
      },
    ],
  },
  {
    id: 'cancellation-and-resubscription',
    title: '20. Cancellation & Re-Subscription',
    icon: Shield,
    color: '#8B5CF6',
    content: [
      {
        subtitle: 'What Happens if You Cancel',
        text: 'If you cancel your subscription, you are automatically removed from any groups you belong to. You and the other members of those groups will be notified. Your subscription becomes inactive, and you cannot join groups or receive payouts unless you subscribe again.',
      },
      {
        subtitle: 'Reminders After Cancellation',
        text: 'If you stay inactive after cancelling, we may email you about every 7 days to invite you to subscribe again.',
      },
      {
        subtitle: 'Long-Term Inactivity After Cancellation',
        text: 'If 60 days pass after cancellation and you have not re-subscribed, we may delete your account and notify you by email. If this happens, you may sign up again later with the same email address, but you will not be able to log back into the deleted account.',
      },
    ],
  },
  {
    id: 'group-membership-visibility-and-removal',
    title: '21. Group Member Visibility & Removal',
    icon: Users,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'Seeing Other Members',
        text: 'Members of an active group can view the other active members on that group\'s page, including each person\'s name, join date, and Trust Score™.',
      },
      {
        subtitle: 'Removal by Group Vote',
        text: 'A group may remove a member through a vote of the other group members, in line with the governance rules set out in these Terms.',
      },
      {
        subtitle: 'Trust Score Impact',
        text: 'Each time a member is removed from a group, that removal lowers the member\'s Trust Score™.',
      },
      {
        subtitle: 'Three Removals Rule',
        text: 'If a member is removed from groups a total of three times, PadiHub will permanently delete that account and notify the member by email that they can no longer use PadiHub. The email address associated with that account can never be used to sign up to PadiHub again — this is different from the 60-day inactivity deletions described elsewhere in these Terms, where signing up again with the same email address remains possible.',
      },
    ],
  },
  {
    id: 'contact',
    title: '22. Contact',
    icon: FileText,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'Legal Team',
        text: 'For questions about these Terms of Service, please contact our Legal Team at hello@padihub.com.',
      },
      {
        subtitle: 'General Support',
        text: 'For general support and account questions, visit our Help Centre at padihub.com/help or contact hello@padihub.com. Support is available Mondays to Saturdays, 9am to 6pm.',
      },
    ],
  },
];

function renumberTitle(title: string, position: number) {
  return title.replace(/^\d+\./, `${position}.`);
}

/** Filters sections to the given region and renumbers their titles sequentially. */
export function getVisibleTermsSections(region: TermsRegion): TermsSection[] {
  return TERMS_SECTIONS
    .filter(section => !section.region || section.region === region)
    .map((section, index) => ({ ...section, title: renumberTitle(section.title, index + 1) }));
}

/**
 * Renders the full set of region-appropriate Terms & Conditions cards.
 * Used by the standalone /terms page, and reusable anywhere else in the app
 * that needs to embed the full terms text (e.g. an onboarding review step).
 */
export function TermsAndConditions({ region, className }: { region: TermsRegion; className?: string }) {
  const visibleSections = getVisibleTermsSections(region);

  return (
    <div className={className ?? 'flex flex-col gap-8'}>
      {visibleSections.map((section) => (
        <div key={section.id} id={section.id}
          className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${section.color}12` }}>
              <section.icon size={18} style={{ color: section.color }} />
            </div>
            <h2 className="text-lg font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{section.title}</h2>
          </div>
          <div className="flex flex-col gap-5">
            {section.content.map((item, i) => (
              <div key={i}>
                <h3 className="text-sm font-bold text-gray-900 mb-1">{item.subtitle}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{typeof item.text === 'function' ? item.text(region) : item.text}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
