import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import {
  Users, PiggyBank, Shield, Vote,
  AlertTriangle, CheckCircle, Clock, ChevronRight, Crown, Bell
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Link } from 'react-router-dom';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const communities = [
  { name: 'Lagos Savers Circle', members: 15, health: 95, pendingContribs: 2, openProposals: 1, color: '#2EAF6F' },
  { name: 'Family First Network', members: 19, health: 85, pendingContribs: 4, openProposals: 2, color: '#F59E0B' },
];

const pendingActions = [
  { type: 'contribution', label: 'Amara O. missed June contribution', community: 'Lagos Savers Circle', urgency: 'high', time: '2h ago' },
  { type: 'proposal',     label: 'New proposal: Increase monthly target', community: 'Family First Network', urgency: 'medium', time: '5h ago' },
  { type: 'member',       label: 'New join request from Tunde B.', community: 'Lagos Savers Circle', urgency: 'low', time: '1d ago' },
  { type: 'contribution', label: 'Chidi N. missed June contribution', community: 'Family First Network', urgency: 'high', time: '1d ago' },
];

const members = [
  { name: 'Amara Okafor',  trust: 920, status: 'active',  contributions: '100%', avatar: 'A' },
  { name: 'Tunde Bello',   trust: 880, status: 'active',  contributions: '95%',  avatar: 'T' },
  { name: 'Chidi Nwosu',   trust: 760, status: 'warning', contributions: '78%',  avatar: 'C' },
  { name: 'Fatima Aliyu',  trust: 910, status: 'active',  contributions: '100%', avatar: 'F' },
  { name: 'Emeka Obi',     trust: 840, status: 'active',  contributions: '92%',  avatar: 'E' },
];

const urgencyColor: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#2EAF6F' };

export default function LeaderDashboardPage() {
  return (
    <DashboardLayout>
      <Helmet>
        <title>Leader Dashboard — PadiHub</title>
        <meta name="description" content="Manage your communities, track member contributions and govern with confidence on PadiHub." />
        <link rel="canonical" href="https://padihub.com/leader-dashboard" />
              <meta property="og:title" content="Leader Dashboard — PadiHub" />
        <meta property="og:description" content="Manage your communities, track member contributions and govern with confidence on PadiHub." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          {/* Header */}
          <MotionDiv variants={fadeUp} className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Crown size={18} style={{ color: '#F59E0B' }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#F59E0B' }}>Leader Dashboard</span>
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Community Command Centre</h1>
              <p className="text-gray-500 text-sm mt-1">You lead 2 communities · 34 members total</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 16px rgba(46,175,111,0.3)' }}>
              <Bell size={15} /> Send announcement
            </button>
          </MotionDiv>

          {/* KPI overview */}
          <MotionDiv variants={fadeUp} className="r-grid-stats" style={{ marginBottom: 32 }}>
            {[
              { label: 'Total Members',       value: '34',  trend: '+2 this month', icon: Users,    color: '#2EAF6F', ring: 68 },
              { label: 'Avg Contribution Rate',value: '89%', trend: '+3% vs last',  icon: PiggyBank,color: '#2eafaf', ring: 89 },
              { label: 'Avg Trust Score™',    value: '862', trend: '+15 this month',icon: Shield,   color: '#8B5CF6', ring: 86 },
              { label: 'Open Proposals',      value: '3',   trend: '2 need votes',  icon: Vote,     color: '#F59E0B', ring: 30 },
            ].map((k, i) => (
              <div key={i} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${k.color}15` }}>
                    <k.icon size={17} style={{ color: k.color }} />
                  </div>
                  <ProgressRing value={k.ring} size={38} strokeWidth={4} color={k.color} />
                </div>
                <p className="text-2xl font-black text-gray-900 mb-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>{k.value}</p>
                <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                <span className="text-xs font-semibold" style={{ color: k.color }}>{k.trend}</span>
              </div>
            ))}
          </MotionDiv>

          <div className="r-grid-3" style={{ marginBottom: 24 }}>

            {/* Pending actions */}
            <MotionDiv variants={fadeUp} className="lg:col-span-2 rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Pending Actions</h2>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
                  {pendingActions.filter(a => a.urgency === 'high').length} urgent
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {pendingActions.map((a, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 transition-colors cursor-pointer"
                    style={{ border: '1px solid #F3F4F6' }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: urgencyColor[a.urgency] }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{a.label}</p>
                      <p className="text-xs text-gray-400">{a.community} · {a.time}</p>
                    </div>
                    <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </MotionDiv>

            {/* Community health */}
            <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <h2 className="font-extrabold text-gray-900 mb-5" style={{ fontFamily: 'Nunito, sans-serif' }}>Community Health</h2>
              <div className="flex flex-col gap-5">
                {communities.map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black"
                          style={{ background: c.color }}>{c.name[0]}</div>
                        <div>
                          <p className="text-xs font-bold text-gray-800 leading-tight">{c.name}</p>
                          <p className="text-xs text-gray-400">{c.members} members</p>
                        </div>
                      </div>
                      <span className="text-sm font-black" style={{ color: c.color, fontFamily: 'Nunito, sans-serif' }}>{c.health}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${c.health}%`, background: `linear-gradient(90deg, ${c.color}, #F59E0B)` }} />
                    </div>
                    <div className="flex gap-3 mt-2">
                      {c.pendingContribs > 0 && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#EF4444' }}>
                          <AlertTriangle size={10} /> {c.pendingContribs} missed
                        </span>
                      )}
                      {c.openProposals > 0 && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#F59E0B' }}>
                          <Vote size={10} /> {c.openProposals} proposals
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </MotionDiv>
          </div>

          {/* Member overview */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Member Overview</h2>
              <Link to="/savings-groups" className="text-sm font-semibold flex items-center gap-1" style={{ color: '#2EAF6F' }}>
                View all <ChevronRight size={14} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="pb-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Member</th>
                    <th className="pb-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Trust</th>
                    <th className="pb-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Contributions</th>
                    <th className="pb-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {members.map((m, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>{m.avatar}</div>
                          <span className="font-semibold text-gray-800">{m.name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-right font-bold" style={{ color: '#2EAF6F' }}>{m.trust}</td>
                      <td className="py-3 text-right font-semibold text-gray-700">{m.contributions}</td>
                      <td className="py-3 text-right">
                        {m.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F' }}>
                            <CheckCircle size={10} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>
                            <Clock size={10} /> Attention
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MotionDiv>

        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
