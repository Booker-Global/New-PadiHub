import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { PiggyBank, Plus, Calendar, TrendingUp, CheckCircle, Clock, ChevronRight } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { SkeletonPage } from '@/components/ui/loading-skeleton';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const groups = [
  { name: 'Lagos Savers Circle',  saved: '₦390,000', members: 15, nextDue: '3 days',  cycle: 'Monthly', color: '#2EAF6F', status: 'active' },
  { name: 'UK House Deposit Fund', saved: '£6,200',  members: 8,  nextDue: '12 days', cycle: 'Monthly', color: '#2eafaf', status: 'active' },
  { name: 'Holiday 2026 Fund',    saved: '£1,350',   members: 6,  nextDue: '20 days', cycle: 'Monthly', color: '#8B5CF6', status: 'active' },
  { name: 'Emergency Reserve',    saved: '₦200,000', members: 10, nextDue: '—',       cycle: 'Monthly', color: '#F59E0B', status: 'active' },
];

const timeline = [
  { group: 'Lagos Savers Circle', amount: '₦35,000', date: 'Jun 21', status: 'upcoming', member: 'You' },
  { group: 'UK House Deposit Fund', amount: '£150', date: 'Jun 15', status: 'paid', member: 'You' },
  { group: 'Holiday 2026 Fund', amount: '£75', date: 'Jun 10', status: 'paid', member: 'You' },
  { group: 'Lagos Savers Circle', amount: '₦35,000', date: 'May 21', status: 'paid', member: 'You' },
];

export default function SavingsGroupsPage() {
  const [tab, setTab] = useState<'groups' | 'timeline'>('groups');
  const [loading] = useState(false);

  if (loading) return <DashboardLayout><SkeletonPage /></DashboardLayout>;

  return (
    <DashboardLayout>
      <Helmet><title>Savings Groups — PadiHub</title><meta name="description" content="Track your savings groups, contributions and milestones on PadiHub." /><link rel="canonical" href="https://padihub.com/savings-groups" />        <meta property="og:title" content="Savings Groups — PadiHub" />
        <meta property="og:description" content="Track your savings groups, contributions and milestones on PadiHub." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
</Helmet>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="flex items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Savings Groups</h1>
              <p className="text-gray-500 text-sm mt-1">Track your contributions and celebrate every milestone</p>
            </div>
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 16px rgba(46,175,111,0.3)' }}>
              <Plus size={16} /> Create group
            </button>
          </MotionDiv>

          {/* Summary stats */}
          <MotionDiv variants={fadeUp} className="r-grid-stats" style={{ marginBottom: 24 }}>
            {[
              { label: 'Active Groups', value: '3', color: '#2EAF6F', icon: PiggyBank },
              { label: 'Total Saved', value: '£7,940', color: '#2eafaf', icon: TrendingUp },
              { label: 'Next Due', value: '3 days', color: '#F59E0B', icon: Calendar },
              { label: 'Contributions', value: '24', color: '#8B5CF6', icon: CheckCircle },
            ].map(s => (
              <div key={s.label} className="rounded-2xl p-4 bg-white flex items-center gap-3" style={{ border: '1px solid #F3F4F6' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}15` }}>
                  <s.icon size={18} style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-xl font-black" style={{ color: s.color, fontFamily: 'Nunito, sans-serif' }}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            ))}
          </MotionDiv>

          {/* Tabs */}
          <MotionDiv variants={fadeUp} className="flex items-center gap-1 p-1 rounded-2xl bg-gray-100 w-fit mb-6">
            {(['groups', 'timeline'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-5 py-2 rounded-xl text-sm font-bold capitalize transition-all"
                style={{ background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#1A1A2E' : '#6B7280', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                {t === 'groups' ? 'My Groups' : 'Timeline'}
              </button>
            ))}
          </MotionDiv>

          {tab === 'groups' && (
            <MotionDiv initial="hidden" animate="visible" variants={stagger} className="r-grid-2">
              {groups.map(g => (
                <MotionDiv key={g.name} variants={fadeUp}
                  className="rounded-3xl p-6 bg-white group hover:-translate-y-1 transition-transform duration-300"
                  style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${g.color}15` }}>
                        <PiggyBank size={20} style={{ color: g.color }} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-gray-900 text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>{g.name}</h3>
                        <p className="text-xs text-gray-400">{g.cycle} · {g.members} members</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded-full text-xs font-bold"
                      style={{
                        background: g.status === 'complete' ? 'rgba(46,175,111,0.1)' : `${g.color}15`,
                        color: g.status === 'complete' ? '#2EAF6F' : g.color
                      }}>
                      {g.status === 'complete' ? '✓ Complete' : 'Active'}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Total saved</p>
                        <span className="font-extrabold text-lg" style={{ color: g.color, fontFamily: 'Nunito, sans-serif' }}>{g.saved}</span>
                      </div>
                      {g.nextDue !== '—' && (
                        <span className="text-xs flex items-center gap-1" style={{ color: g.color }}>
                          <Clock size={10} /> Next: {g.nextDue}
                        </span>
                      )}
                    </div>
                  </div>

                  <button className="w-full py-2.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                    style={{ background: `${g.color}10`, color: g.color }}>
                    <ChevronRight size={14} /> View group details
                  </button>
                </MotionDiv>
              ))}
            </MotionDiv>
          )}

          {tab === 'timeline' && (
            <MotionDiv initial="hidden" animate="visible" variants={stagger} className="max-w-2xl">
              {timeline.map((t, i) => (
                <MotionDiv key={i} variants={fadeUp} className="flex gap-4 mb-4">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: t.status === 'paid' ? 'rgba(46,175,111,0.1)' : 'rgba(245,158,11,0.1)' }}>
                      {t.status === 'paid' ? <CheckCircle size={18} style={{ color: '#2EAF6F' }} /> : <Clock size={18} style={{ color: '#F59E0B' }} />}
                    </div>
                    {i < timeline.length - 1 && <div className="w-0.5 flex-1 mt-2" style={{ background: '#E5E7EB' }} />}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="rounded-2xl p-4 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm text-gray-900">{t.group}</p>
                          <p className="text-xs text-gray-400">{t.date} · {t.member}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-base" style={{ fontFamily: 'Nunito, sans-serif', color: t.status === 'paid' ? '#2EAF6F' : '#F59E0B' }}>{t.amount}</p>
                          <span className="text-xs font-semibold" style={{ color: t.status === 'paid' ? '#2EAF6F' : '#F59E0B' }}>
                            {t.status === 'paid' ? '✓ Paid' : 'Upcoming'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </MotionDiv>
              ))}
            </MotionDiv>
          )}
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
