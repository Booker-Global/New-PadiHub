import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import { ChevronLeft, CheckCircle, Clock, AlertCircle, PiggyBank, Download } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

const filters = ['All', 'This Month', 'Last Month', 'Completed', 'Pending'];

const history = [
  { id: 'REF-2026-0618', group: 'Monthly Ajo Pool',    community: 'Lagos Savers Circle', amount: '₦5,000', date: 'Jun 18, 2026', status: 'completed', color: '#2EAF6F' },
  { id: 'REF-2026-0618B',group: 'Emergency Fund',      community: 'Lagos Savers Circle', amount: '₦2,500', date: 'Jun 18, 2026', status: 'completed', color: '#F59E0B' },
  { id: 'REF-2026-0610', group: 'UK Deposit Fund',     community: 'UK Homeowners Hub',   amount: '£150',   date: 'Jun 10, 2026', status: 'completed', color: '#2eafaf' },
  { id: 'REF-2026-0605', group: 'Business Capital',    community: 'Diaspora Builders',   amount: '£200',   date: 'Jun 5, 2026',  status: 'pending',   color: '#8B5CF6' },
  { id: 'REF-2026-0518', group: 'Monthly Ajo Pool',    community: 'Lagos Savers Circle', amount: '₦5,000', date: 'May 18, 2026', status: 'completed', color: '#2EAF6F' },
  { id: 'REF-2026-0518B',group: 'Emergency Fund',      community: 'Lagos Savers Circle', amount: '₦2,500', date: 'May 18, 2026', status: 'completed', color: '#F59E0B' },
  { id: 'REF-2026-0510', group: 'UK Deposit Fund',     community: 'UK Homeowners Hub',   amount: '£150',   date: 'May 10, 2026', status: 'completed', color: '#2eafaf' },
  { id: 'REF-2026-0418', group: 'Monthly Ajo Pool',    community: 'Lagos Savers Circle', amount: '₦5,000', date: 'Apr 18, 2026', status: 'completed', color: '#2EAF6F' },
];

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  completed: { label: 'Completed', color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)',  icon: CheckCircle },
  pending:   { label: 'Pending',   color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  icon: Clock },
  missed:    { label: 'Missed',    color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   icon: AlertCircle },
};

export default function ContributionHistoryPage() {
  const [activeFilter, setActiveFilter] = useState('All');

  const filtered = history.filter(h => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Completed') return h.status === 'completed';
    if (activeFilter === 'Pending') return h.status === 'pending';
    if (activeFilter === 'This Month') return h.date.includes('Jun 2026');
    if (activeFilter === 'Last Month') return h.date.includes('May 2026');
    return true;
  });

  const totalCompleted = history.filter(h => h.status === 'completed').length;

  return (
    <DashboardLayout>
      <Helmet>
        <title>Contribution History — PadiHub</title>
        <meta name="description" content="View your full contribution history across all savings groups on PadiHub." />
        <link rel="canonical" href="https://padihub.com/savings-groups/history" />
              <meta property="og:title" content="Contribution History — PadiHub" />
        <meta property="og:description" content="View your full contribution history across all savings groups on PadiHub." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          <MotionDiv variants={fadeUp} className="flex items-center gap-3 mb-6">
            <Link to="/savings-groups" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back
            </Link>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Contribution History</h1>
              <p className="text-gray-500 text-sm">{totalCompleted} completed contributions</p>
            </div>
          </MotionDiv>

          {/* Summary */}
          <MotionDiv variants={fadeUp} className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Total contributions', value: history.length.toString(), color: '#2EAF6F' },
              { label: 'Completed',           value: totalCompleted.toString(), color: '#2EAF6F' },
              { label: 'Completion rate',     value: `${Math.round((totalCompleted / history.length) * 100)}%`, color: '#F59E0B' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl p-4 text-center bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <p className="text-2xl font-black" style={{ color: s.color, fontFamily: 'Nunito, sans-serif' }}>{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            ))}
          </MotionDiv>

          {/* Filters */}
          <MotionDiv variants={fadeUp} className="flex gap-2 flex-wrap mb-5">
            {filters.map(f => (
              <button key={f} onClick={() => setActiveFilter(f)}
                className="px-4 py-2 rounded-full text-sm font-bold transition-all"
                style={{ background: activeFilter === f ? '#2EAF6F' : '#F3F4F6', color: activeFilter === f ? '#fff' : '#6B7280' }}>
                {f}
              </button>
            ))}
          </MotionDiv>

          {/* History list */}
          <MotionDiv initial="hidden" animate="visible" variants={stagger} className="flex flex-col gap-3">
            {filtered.map(h => {
              const sc = statusConfig[h.status];
              return (
                <MotionDiv key={h.id} variants={fadeUp}
                  className="rounded-2xl p-4 bg-white flex items-center gap-4"
                  style={{ border: '1px solid #F3F4F6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${h.color}12` }}>
                    <PiggyBank size={16} style={{ color: h.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{h.group}</p>
                    <p className="text-xs text-gray-400">{h.community} · {h.date}</p>
                    <p className="text-xs text-gray-300 mt-0.5 font-mono">{h.id}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black" style={{ color: h.color, fontFamily: 'Nunito, sans-serif' }}>{h.amount}</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: sc.bg, color: sc.color }}>
                      {sc.label}
                    </span>
                  </div>
                  {h.status === 'completed' && (
                    <button className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
                      title="Download receipt">
                      <Download size={14} style={{ color: '#9CA3AF' }} />
                    </button>
                  )}
                </MotionDiv>
              );
            })}
          </MotionDiv>

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <PiggyBank size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400 font-semibold">No contributions match this filter.</p>
            </div>
          )}
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
