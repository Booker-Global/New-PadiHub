import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useParams } from 'react-router-dom';
import {
  Clock, ThumbsUp, ThumbsDown, BookOpen,
  ChevronRight, Shield, PiggyBank, Users, Globe,
  CheckCircle, AlertTriangle, Zap, MessageSquare,
} from 'lucide-react';
import { useState } from 'react';

import HelpRouteLayout from '../HelpRouteLayout';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const articles: Record<string, {
  title: string; category: string; readTime: string; updated: string;
  icon: typeof Shield; color: string;
  sections: { heading: string; body: string; type?: 'tip' | 'warning' | 'info' }[];
  related: { title: string; slug: string }[];
}> = {
  'how-trust-score-works': {
    title: 'How does Trust Score™ work?',
    category: 'Trust Score™', readTime: '4 min read', updated: '12 Jun 2025',
    icon: Shield, color: '#8B5CF6',
    sections: [
      { heading: 'What is Trust Score™?', body: 'Your Trust Score™ is a living reputation score that reflects your reliability, participation and community standing within PadiHub. It ranges from 0 to 1,000 and is updated in real time as you interact with your communities.' },
      { heading: 'How is it calculated?', body: 'Trust Score™ is built from four key pillars: Contribution Reliability (40%) — how consistently you contribute to savings groups on time. Governance Participation (25%) — how actively you vote and engage in community decisions. Community Engagement (20%) — your activity, welcoming new members and supporting others. Peer Vouching (15%) — endorsements from fellow community members.' },
      { heading: 'Trust Tiers', body: 'Your score places you in one of six tiers: Newcomer (0–199), Builder (200–399), Trusted (400–599), Reliable (600–749), Champion (750–899), and Legend (900–1000). Each tier unlocks new privileges and community recognition.' },
      { heading: 'What increases your score?', body: 'Contributing on time or early, participating in governance votes, welcoming new members, completing community milestones, receiving peer vouches and maintaining consistent activity all increase your Trust Score™.', type: 'tip' },
      { heading: 'What decreases your score?', body: 'Missing contributions, failing to vote on governance proposals, extended inactivity and receiving negative peer feedback can reduce your Trust Score™. The impact is proportional — one missed contribution will not dramatically affect a strong score.', type: 'warning' },
    ],
    related: [
      { title: 'Understanding your PadiHub Passport™', slug: 'understanding-passport' },
      { title: 'What happens if I miss a contribution?', slug: 'missed-contribution' },
    ],
  },
  'create-savings-group': {
    title: 'How to create a savings group',
    category: 'Savings Groups', readTime: '5 min read', updated: '8 Jun 2025',
    icon: PiggyBank, color: '#2EAF6F',
    sections: [
      { heading: 'Before you start', body: 'To create a savings group, you need an active PadiHub membership and a Trust Score™ of at least 400 (Trusted tier). This ensures that group leaders have demonstrated reliability to their communities.' },
      { heading: 'Step 1: Choose your group type', body: 'PadiHub supports fixed-schedule groups (contributions on set dates), rotating groups (members take turns receiving the pool), and milestone groups (contributions towards a shared goal). Choose the type that best fits your community\'s needs.' },
      { heading: 'Step 2: Set your schedule and target', body: 'Define your contribution frequency (weekly, fortnightly, monthly), contribution amount, group target and duration. Be realistic — groups with achievable targets have higher completion rates and better Trust Score™ outcomes for all members.' },
      { heading: 'Step 3: Invite members', body: 'Invite members from your existing communities or share a join link. Each savings group can have between 3 and 20 members.', type: 'tip' },
      { heading: 'Step 4: Set group rules', body: 'Define your group\'s contribution rules and what happens if a member misses contributions. PadiHub uses a fixed 72-hour late-payment grace period across every group to keep expectations consistent.' },
    ],
    related: [
      { title: 'What happens if I miss a contribution?', slug: 'missed-contribution' },
      { title: 'How to invite members to your community', slug: 'invite-members' },
    ],
  },
  'understanding-passport': {
    title: 'Understanding your PadiHub Passport™',
    category: 'Passport™', readTime: '3 min read', updated: '5 Jun 2025',
    icon: Globe, color: '#EF4444',
    sections: [
      { heading: 'What is PadiHub Passport™?', body: 'Your PadiHub Passport™ is your verified community identity — a portable, shareable record of your Trust Score™, communities, achievements and leadership roles within the PadiHub ecosystem.' },
      { heading: 'What does it contain?', body: 'Your Passport™ includes your verified display name and unique Passport ID, current Trust Score™ and tier, communities you belong to and lead, achievements and badges earned, and your contribution history summary.' },
      { heading: 'Sharing your Passport™', body: 'You can share your Passport™ publicly via a unique link, or keep it private. Sharing your Passport™ helps build trust when joining new communities or applying for leadership roles.', type: 'tip' },
      { heading: 'Passport™ verification', body: 'Your Passport™ is automatically verified when you complete identity verification and maintain an active membership. Verified Passports™ display a verification badge and are trusted by community leaders.', type: 'info' },
    ],
    related: [
      { title: 'How does Trust Score™ work?', slug: 'how-trust-score-works' },
    ],
  },
  'missed-contribution': {
    title: 'What happens if I miss a contribution?',
    category: 'Savings Groups', readTime: '3 min read', updated: '3 Jun 2025',
    icon: PiggyBank, color: '#2EAF6F',
    sections: [
      { heading: 'Immediate impact', body: 'Missing a contribution affects your Trust Score™ and your standing within the savings group. The impact depends on your history — a first missed contribution has a smaller impact than a pattern of missed contributions.' },
      { heading: 'Trust Score™ impact', body: 'A missed contribution typically reduces your Trust Score™ by 15–40 points depending on your current tier and history. Paying late (within 7 days) reduces the impact to 5–15 points.', type: 'warning' },
      { heading: 'What to do if you\'ll miss a payment', body: 'Contact your group leader as soon as possible. Every group uses the same fixed 72-hour grace period before one automatic retry. Communicating proactively is always better than going silent — it protects your Trust Score™ and community relationships.', type: 'tip' },
      { heading: 'Recovering your Trust Score™', body: 'Trust Score™ recovers over time through consistent on-time contributions, governance participation and community engagement. A single missed contribution is not permanent — consistent positive behaviour rebuilds your score.' },
    ],
    related: [
      { title: 'How does Trust Score™ work?', slug: 'how-trust-score-works' },
      { title: 'How to create a savings group', slug: 'create-savings-group' },
    ],
  },
  'invite-members': {
    title: 'How to invite members to your community',
    category: 'Communities', readTime: '2 min read', updated: '1 Jun 2025',
    icon: Users, color: '#2eafaf',
    sections: [
      { heading: 'Inviting via link', body: 'Every community has a unique invite link. Share it via WhatsApp, email or any messaging platform. Recipients can join directly if your community is open, or submit a join request if it requires approval.' },
      { heading: 'Inviting existing PadiHub members', body: 'Search for members by name or Passport™ ID from your community management panel. Send direct invitations that appear in their notifications.' },
      { heading: 'Setting join requirements', body: 'As a community leader, you can require a minimum Trust Score™, approval for all join requests, or keep your community fully open. We recommend requiring a minimum Trust Score™ of 300 for savings-focused communities.', type: 'tip' },
    ],
    related: [
      { title: 'How to create a savings group', slug: 'create-savings-group' },
      { title: 'Understanding your PadiHub Passport™', slug: 'understanding-passport' },
    ],
  },
};

const fallbackArticle: {
  title: string; category: string; readTime: string; updated: string;
  icon: typeof BookOpen; color: string;
  sections: { heading: string; body: string; type?: 'tip' | 'warning' | 'info' }[];
  related: { title: string; slug: string }[];
} = {
  title: 'Help Article',
  category: 'Help', readTime: '3 min read', updated: 'Jun 2025',
  icon: BookOpen, color: '#2EAF6F',
  sections: [
    { heading: 'Article not found', body: 'This article is being updated. Please browse our FAQ and help pages for related guidance, or submit a support ticket if you need immediate assistance.' },
  ],
  related: [
    { title: 'How does Trust Score™ work?', slug: 'how-trust-score-works' },
  ],
};

export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = (slug && articles[slug]) ? articles[slug] : fallbackArticle;
  const [helpful, setHelpful] = useState<boolean | null>(null);

  return (
    <HelpRouteLayout>
      <Helmet>
        <title>{article.title} — PadiHub Help</title>
        <meta name="description" content={`PadiHub help article: ${article.title}`} />
        <link rel="canonical" href={`https://www.padihub.com/help/article/${slug || ''}`} />
        <meta property="og:title" content={`${article.title} — PadiHub Help`} />
        <meta property="og:description" content="The trusted community savings platform. Save together, grow together and belong." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://padihub.com/help/article/[slug]" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible" className="flex items-center gap-2 text-xs text-gray-400">
          <Link to="/help" className="hover:text-gray-600 transition-colors">Help &amp; Support</Link>
          <ChevronRight size={12} />
          <span style={{ color: article.color }}>{article.category}</span>
          <ChevronRight size={12} />
          <span className="text-gray-600 truncate">{article.title}</span>
        </MotionDiv>

        <MotionDiv variants={fadeUp} initial="hidden" animate="visible" className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${article.color}15` }}>
              <article.icon size={22} style={{ color: article.color }} />
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full mb-2 inline-block" style={{ background: `${article.color}15`, color: article.color }}>
                {article.category}
              </span>
              <h1 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {article.title}
              </h1>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Clock size={11} /> {article.readTime}</span>
                <span>Updated {article.updated}</span>
              </div>
            </div>
          </div>
        </MotionDiv>

        <MotionDiv variants={stagger} initial="hidden" animate="visible" className="space-y-4">
          {article.sections.map((section, i) => (
            <MotionDiv
              key={i}
              variants={fadeUp}
              className={`rounded-2xl p-5 ${section.type ? '' : 'bg-white shadow-sm border border-gray-100'}`}
              style={section.type ? {
                background: section.type === 'tip' ? '#F0FDF4' : section.type === 'warning' ? '#FFFBEB' : '#EFF6FF',
                border: `1px solid ${section.type === 'tip' ? '#D1FAE5' : section.type === 'warning' ? '#FDE68A' : '#BFDBFE'}`,
              } : {}}
            >
              {section.type && (
                <div className="flex items-center gap-2 mb-2">
                  {section.type === 'tip' && <CheckCircle size={14} style={{ color: '#2EAF6F' }} />}
                  {section.type === 'warning' && <AlertTriangle size={14} style={{ color: '#F59E0B' }} />}
                  {section.type === 'info' && <Zap size={14} style={{ color: '#3B82F6' }} />}
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: section.type === 'tip' ? '#065F46' : section.type === 'warning' ? '#92400E' : '#1E40AF' }}>
                    {section.type === 'tip' ? 'Pro Tip' : section.type === 'warning' ? 'Important' : 'Note'}
                  </span>
                </div>
              )}
              <h2 className="text-sm font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {section.heading}
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed">{section.body}</p>
            </MotionDiv>
          ))}
        </MotionDiv>

        <MotionDiv variants={fadeUp} initial="hidden" animate="visible" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
          <p className="text-sm font-bold text-gray-700 mb-3">Was this article helpful?</p>
          {helpful === null ? (
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setHelpful(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-green-50"
                style={{ borderColor: '#D1FAE5', color: '#2EAF6F' }}
              >
                <ThumbsUp size={14} /> Yes, helpful
              </button>
              <button
                onClick={() => setHelpful(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-gray-50"
                style={{ borderColor: '#E5E7EB', color: '#6B7280' }}
              >
                <ThumbsDown size={14} /> Not really
              </button>
            </div>
          ) : helpful ? (
            <div className="flex items-center justify-center gap-2" style={{ color: '#2EAF6F' }}>
              <CheckCircle size={16} />
              <p className="text-sm font-bold">Thanks for your feedback!</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Sorry to hear that. Let us help you directly.</p>
              <Link to="/help/ticket" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                <MessageSquare size={13} /> Submit a Support Ticket
              </Link>
            </div>
          )}
        </MotionDiv>

        {article.related.length > 0 && (
          <MotionDiv variants={fadeUp} initial="hidden" animate="visible">
            <h2 className="text-sm font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Related Articles</h2>
            <div className="space-y-2">
              {article.related.map(rel => (
                <Link
                  key={rel.slug}
                  to={`/help/article/${rel.slug}`}
                  className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all group"
                >
                  <BookOpen size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <p className="text-sm font-semibold text-gray-700 flex-1">{rel.title}</p>
                  <ChevronRight size={14} style={{ color: '#D1D5DB' }} className="flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              ))}
            </div>
          </MotionDiv>
        )}
      </div>
    </HelpRouteLayout>
  );
}
