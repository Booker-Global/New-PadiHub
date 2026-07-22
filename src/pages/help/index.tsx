import { Helmet } from '@dr.pogodin/react-helmet';
import { useState } from 'react';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  HelpCircle, Search, ChevronDown, ChevronRight, MessageSquare,
  Mail, BookOpen, Video, Shield, Users, PiggyBank, Award,
  Globe, Vote, Zap, CheckCircle, ArrowUpRight, FileText
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/help#webpage\",\"name\":\"Help & Support — PadiHub\",\"url\":\"https://padihub.com/help\",\"description\":\"Get help with PadiHub — browse articles, submit a ticket or chat with our team.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const categories = [
  { icon: Users,     label: 'Communities',    count: 12, color: '#2EAF6F', slug: 'communities' },
  { icon: PiggyBank, label: 'Savings Groups', count: 9,  color: '#2eafaf', slug: 'savings-groups' },
  { icon: Shield,    label: 'Trust Score™',   count: 8,  color: '#8B5CF6', slug: 'trust-score' },
  { icon: Award,     label: 'Karma™',         count: 6,  color: '#F59E0B', slug: 'karma' },
  { icon: Globe,     label: 'Passport™',      count: 5,  color: '#EF4444', slug: 'passport' },
  { icon: Vote,      label: 'Governance',     count: 7,  color: '#2EAF6F', slug: 'governance' },
  { icon: Zap,       label: 'Subscription',   count: 4,  color: '#F59E0B', slug: 'subscription' },
  { icon: Shield,    label: 'Security',       count: 6,  color: '#8B5CF6', slug: 'security' },
];

const popularArticles = [
  { title: 'How does Trust Score™ work?',                  slug: 'how-trust-score-works',       category: 'Trust Score™',   reads: 2840 },
  { title: 'What is Community Karma™?',                    slug: 'what-is-community-karma',      category: 'Karma™',         reads: 2210 },
  { title: 'How to create a savings group',                slug: 'create-savings-group',         category: 'Savings Groups', reads: 1980 },
  { title: 'Understanding your PadiHub Passport™',         slug: 'understanding-passport',       category: 'Passport™',      reads: 1750 },
  { title: 'How to invite members to your community',      slug: 'invite-members',               category: 'Communities',    reads: 1540 },
  { title: 'What happens if I miss a contribution?',       slug: 'missed-contribution',          category: 'Savings Groups', reads: 1320 },
];

const faqs = [
  { q: 'How does Trust Score™ work?', a: 'Your Trust Score™ is a living reputation score built from your contribution reliability, governance participation, community engagement and peer vouching. It ranges from 0–1000 and updates in real time.' },
  { q: 'What is Community Karma™?', a: 'Community Karma™ is PadiHub\'s achievement and recognition system. You earn Karma points by contributing on time, participating in governance, welcoming new members and completing community milestones.' },
  { q: 'How do savings groups work?', a: 'Savings groups are collective pools where members contribute regularly. Each group has a schedule, target and rules set by the community leader. Contributions are tracked transparently and your Trust Score™ reflects your reliability.' },
  { q: 'What is the PadiHub Passport™?', a: 'Your PadiHub Passport™ is your verified community identity — a portable record of your Trust Score™, Karma™, communities, achievements and leadership roles. You can share it publicly or keep it private.' },
  { q: 'Is PadiHub a bank?', a: 'No. PadiHub is a Community Operating System — not a bank, wallet or financial institution. We help communities organise, track and celebrate their savings journey together. We do not hold funds.' },
  { q: 'How do I cancel my subscription?', a: 'You can cancel your subscription at any time from Settings → Subscription → Cancel. Your access continues until the end of your billing period. Your data and community memberships are preserved.' },
];

const channels = [
  { icon: MessageSquare, label: 'Live Chat',     desc: 'Chat with our team',      action: 'Start Chat',    color: '#2EAF6F', available: true },
  { icon: Mail,          label: 'Email Support', desc: 'Response within 24h',     action: 'Send Email',    color: '#2eafaf', available: true },
  { icon: BookOpen,      label: 'Help Centre',   desc: 'Browse all articles',     action: 'Browse',        color: '#8B5CF6', available: true },
  { icon: Video,         label: 'Video Guides',  desc: 'Step-by-step tutorials',  action: 'Watch Now',     color: '#F59E0B', available: true },
];

export default function HelpIndexPage() {
  const [search, setSearch] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const filteredFaqs = faqs.filter(f =>
    f.q.toLowerCase().includes(search.toLowerCase()) ||
    f.a.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <Helmet>
        <title>Help & Support — PadiHub</title>
        <meta name="description" content="Get help with PadiHub — browse articles, submit a ticket or chat with our team." />
        <link rel="canonical" href="https://www.padihub.com/help" />
              <meta property="og:title" content="Help & Support — PadiHub" />
        <meta property="og:description" content="Get help with PadiHub — browse articles, submit a ticket or chat with our team." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Hero */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible"
          className="rounded-3xl p-8 text-center relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1A1A2E 60%, #0d2818 100%)' }}>
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-10" style={{ background: '#2EAF6F' }} />
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(46,175,111,0.2)', border: '1px solid rgba(46,175,111,0.3)' }}>
              <HelpCircle size={26} style={{ color: '#2EAF6F' }} />
            </div>
            <h1 className="text-2xl font-extrabold text-white mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
              How can we help?
            </h1>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Search our help centre or browse by topic
            </p>
            <div className="relative max-w-md mx-auto">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.4)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search articles, FAQs…"
                className="w-full pl-11 pr-4 py-3 rounded-2xl text-sm focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }} />
            </div>
          </div>
        </MotionDiv>

        {/* Contact Channels */}
        <MotionDiv variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {channels.map((ch, i) => (
            <MotionDiv key={i} variants={fadeUp}
              className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100 hover:shadow-md transition-all group cursor-pointer">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3 transition-transform group-hover:scale-110"
                style={{ background: `${ch.color}15` }}>
                <ch.icon size={18} style={{ color: ch.color }} />
              </div>
              <p className="text-sm font-extrabold text-gray-900 mb-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>{ch.label}</p>
              <p className="text-xs text-gray-400 mb-3">{ch.desc}</p>
              {ch.label === 'Live Chat' ? (
                <Link to="/help/ticket"
                  className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all hover:opacity-90 text-white inline-block"
                  style={{ background: ch.color }}>
                  {ch.action}
                </Link>
              ) : (
                <button className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all hover:opacity-90 text-white"
                  style={{ background: ch.color }}>
                  {ch.action}
                </button>
              )}
            </MotionDiv>
          ))}
        </MotionDiv>

        {/* Browse by Category */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible">
          <h2 className="text-base font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Browse by Topic</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {categories.map((cat, i) => (
              <Link key={i} to={`/help/article/${cat.slug}`}
                className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 hover:shadow-md transition-all group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                  style={{ background: `${cat.color}15` }}>
                  <cat.icon size={16} style={{ color: cat.color }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{cat.label}</p>
                  <p className="text-xs text-gray-400">{cat.count} articles</p>
                </div>
              </Link>
            ))}
          </div>
        </MotionDiv>

        {/* Popular Articles */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible">
          <h2 className="text-base font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Popular Articles</h2>
          <div className="space-y-2">
            {popularArticles.map((art, i) => (
              <Link key={i} to={`/help/article/${art.slug}`}
                className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all group">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#F9FAFB' }}>
                  <FileText size={14} style={{ color: '#6B7280' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{art.title}</p>
                  <p className="text-xs text-gray-400">{art.category} · {art.reads.toLocaleString()} reads</p>
                </div>
                <ChevronRight size={14} style={{ color: '#D1D5DB' }} className="flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ))}
          </div>
        </MotionDiv>

        {/* FAQ Accordion */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Frequently Asked Questions</h2>
            <Link to="/help/ticket" className="text-xs font-bold flex items-center gap-1 transition-colors hover:opacity-80"
              style={{ color: '#2EAF6F' }}>
              Can't find your answer? <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="space-y-2">
            {filteredFaqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors">
                  <p className="text-sm font-bold text-gray-900 pr-4">{faq.q}</p>
                  <MotionDiv animate={{ rotate: openFaq === i ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0">
                    <ChevronDown size={16} style={{ color: '#9CA3AF' }} />
                  </MotionDiv>
                </button>
                {openFaq === i && (
                  <MotionDiv initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="px-4 pb-4">
                    <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                  </MotionDiv>
                )}
              </div>
            ))}
          </div>
        </MotionDiv>

        {/* Still need help */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible"
          className="rounded-3xl p-6 text-center"
          style={{ background: 'linear-gradient(135deg, #F0FDF4, #ECFDF5)', border: '1px solid #D1FAE5' }}>
          <CheckCircle size={28} style={{ color: '#2EAF6F', margin: '0 auto 12px' }} />
          <h3 className="text-base font-extrabold mb-1" style={{ color: '#065F46', fontFamily: 'Nunito, sans-serif' }}>
            Still need help?
          </h3>
          <p className="text-xs mb-4" style={{ color: '#059669' }}>
            Our support team typically responds within 2 hours.
          </p>
          <Link to="/help/ticket"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
            Submit a Support Ticket
          </Link>
        </MotionDiv>

      </div>
    </DashboardLayout>
  );
}
