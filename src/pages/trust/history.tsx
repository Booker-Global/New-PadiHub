import { Helmet } from '@dr.pogodin/react-helmet';

import { MotionDiv, MotionProgressBar } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import { ChevronLeft, CheckCircle, Users, Globe, Award, Star } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

const historyItems = [
  { activity: 'Contribution completed',   community: 'Lagos Savers Circle', change: '+8',  date: 'Jun 18, 2026', reason: 'On-time contribution',        status: 'positive', icon: CheckCircle, color: '#2EAF6F' },
  { activity: 'Governance vote submitted', community: 'Lagos Savers Circle', change: '+5',  date: 'Jun 15, 2026', reason: 'Active governance participation',status: 'positive', icon: Users,       color: '#8B5CF6' },
  { activity: 'New community joined',      community: 'Diaspora Builders',   change: '+12', date: 'Jun 10, 2026', reason: 'Community expansion',           status: 'positive', icon: Globe,       color: '#2eafaf' },
  { activity: 'Profile verified',          community: 'PadiHub',             change: '+20', date: 'Jun 5, 2026',  reason: 'Identity verification',         status: 'positive', icon: CheckCircle, color: '#2EAF6F' },
  { activity: 'Contribution completed',   community: 'Lagos Savers Circle', change: '+8',  date: 'Jun 1, 2026',  reason: 'On-time contribution',          status: 'positive', icon: CheckCircle, color: '#2EAF6F' },
  { activity: 'Achievement earned',        community: 'PadiHub',             change: '+15', date: 'May 28, 2026', reason: 'Reliable Member badge',         status: 'positive', icon: Award,       color: '#F59E0B' },
  { activity: 'Contribution completed',   community: 'UK Homeowners Hub',   change: '+8',  date: 'May 18, 2026', reason: 'On-time contribution',          status: 'positive', icon: CheckCircle, color: '#2EAF6F' },
  { activity: 'Leadership role accepted',  community: 'Family First Network',change: '+25', date: 'May 10, 2026', reason: 'Community leadership',          status: 'positive', icon: Star,        color: '#F59E0B' },
];

const insights = [
  { label: 'Contribution Reliability', value: 96,  color: '#2EAF6F', desc: 'On-time contributions' },
  { label: 'Governance Participation', value: 78,  color: '#8B5CF6', desc: 'Votes submitted' },
  { label: 'Community Engagement',     value: 85,  color: '#2eafaf', desc: 'Active participation' },
  { label: 'Consistency',              value: 92,  color: '#F59E0B', desc: 'Regular activity' },
  { label: 'Leadership',               value: 60,  color: '#EF4444', desc: 'Leadership activities' },
  { label: 'Verification',             value: 100, color: '#2EAF6F', desc: 'Profile verified' },
];

const communityTrust = [
  { community: 'Lagos Savers Circle', avg: 892, members: 15, top: true,  color: '#2EAF6F' },
  { community: 'UK Homeowners Hub',   avg: 875, members: 28, top: false, color: '#2eafaf' },
  { community: 'Diaspora Builders',   avg: 905, members: 42, top: true,  color: '#8B5CF6' },
  { community: 'Family First Network',avg: 860, members: 19, top: false, color: '#F59E0B' },
];

export default function TrustHistoryPage() {
  return (
    <DashboardLayout>
      <Helmet>
        <title>Trust History & Insights — PadiHub</title>
        <meta name="description" content="View your Trust Score™ history, insights and community trust on PadiHub." />
        <link rel="canonical" href="https://padihub.com/trust/history" />
              <meta property="og:title" content="Trust History & Insights — PadiHub" />
        <meta property="og:description" content="View your Trust Score™ history, insights and community trust on PadiHub." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          <MotionDiv variants={fadeUp} className="flex items-center gap-3 mb-6">
            <Link to="/trust" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back
            </Link>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Trust History & Insights</h1>
              <p className="text-gray-500 text-sm">Your reputation journey across all communities.</p>
            </div>
          </MotionDiv>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* History timeline */}
            <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
              <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Trust Activity</h2>
              <div className="flex flex-col gap-0">
                {historyItems.map((h, i) => (
                  <div key={i} className="flex items-start gap-3 relative">
                    {i < historyItems.length - 1 && (
                      <div className="absolute left-4 top-9 bottom-0 w-0.5" style={{ background: '#F3F4F6' }} />
                    )}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 bg-white"
                      style={{ border: `1px solid ${h.color}25` }}>
                      <h.icon size={13} style={{ color: h.color }} />
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="text-sm font-semibold text-gray-800">{h.activity}</p>
                      <p className="text-xs text-gray-400">{h.community} · {h.date}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{h.reason}</p>
                    </div>
                    <span className="text-xs font-black flex-shrink-0 mt-0.5" style={{ color: '#2EAF6F' }}>{h.change}</span>
                  </div>
                ))}
              </div>
            </MotionDiv>

            {/* Insights */}
            <div className="flex flex-col gap-5">
              <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Trust Insights</h2>
                <div className="flex flex-col gap-3">
                  {insights.map(ins => (
                    <div key={ins.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-gray-700">{ins.label}</span>
                        <span className="font-black" style={{ color: ins.color }}>{ins.value}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100">
                        <MotionProgressBar className="h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${ins.value}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' as const }}
                          style={{ background: `linear-gradient(90deg, ${ins.color}, ${ins.color}cc)` }} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{ins.desc}</p>
                    </div>
                  ))}
                </div>
              </MotionDiv>

              {/* Community trust */}
              <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Community Trust View</h2>
                <div className="flex flex-col gap-3">
                  {communityTrust.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${c.color}15` }}>
                        <Users size={13} style={{ color: c.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{c.community}</p>
                        <p className="text-xs text-gray-400">{c.members} members</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-black" style={{ color: c.color, fontFamily: 'Nunito, sans-serif' }}>{c.avg}</p>
                        <p className="text-xs text-gray-400">avg trust</p>
                      </div>
                      {c.top && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F' }}>
                          Top 20%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-3 text-center">
                  You are in the top 20% of contributors in Lagos Savers Circle.
                </p>
              </MotionDiv>
            </div>
          </div>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
