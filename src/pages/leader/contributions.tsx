import { Helmet } from '@dr.pogodin/react-helmet';
import { useState } from 'react';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle, Clock,
  Search, Bell, Download, ArrowLeft, TrendingUp,
  Shield
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { ProgressRing } from '@/components/ui/progress-ring';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const rateData = [88, 91, 85, 94, 90, 88];

const contributions = [
  { member: 'Amara Okafor',  avatar: 'A', color: '#2EAF6F', community: 'Lagos Savers Circle',  amount: '£150', due: '1 Jun', status: 'paid',    paid: '30 May', trust: 920 },
  { member: 'Tunde Bello',   avatar: 'T', color: '#F59E0B', community: 'Lagos Savers Circle',  amount: '£150', due: '1 Jun', status: 'paid',    paid: '1 Jun',  trust: 880 },
  { member: 'Chidi Nwosu',   avatar: 'C', color: '#EF4444', community: 'Family First Network', amount: '£200', due: '1 Jun', status: 'missed',  paid: '—',      trust: 760 },
  { member: 'Fatima Aliyu',  avatar: 'F', color: '#8B5CF6', community: 'Family First Network', amount: '£200', due: '1 Jun', status: 'paid',    paid: '31 May', trust: 910 },
  { member: 'Yemi Oladele',  avatar: 'Y', color: '#2eafaf', community: 'Diaspora Builders',    amount: '£100', due: '5 Jun', status: 'paid',    paid: '4 Jun',  trust: 840 },
  { member: 'Ngozi Eze',     avatar: 'N', color: '#2EAF6F', community: 'Diaspora Builders',    amount: '£100', due: '5 Jun', status: 'paid',    paid: '5 Jun',  trust: 870 },
  { member: 'Emeka Obi',     avatar: 'E', color: '#F59E0B', community: 'Lagos Savers Circle',  amount: '£150', due: '1 Jun', status: 'late',    paid: '8 Jun',  trust: 720 },
  { member: 'Kemi Adeyemi',  avatar: 'K', color: '#8B5CF6', community: 'Diaspora Builders',    amount: '£100', due: '5 Jun', status: 'paid',    paid: '3 Jun',  trust: 950 },
  { member: 'Bola Ogundimu', avatar: 'B', color: '#2eafaf', community: 'Family First Network', amount: '£200', due: '1 Jun', status: 'pending', paid: '—',      trust: 800 },
  { member: 'Seun Adesanya', avatar: 'S', color: '#EF4444', community: 'Family First Network', amount: '£200', due: '1 Jun', status: 'missed',  paid: '—',      trust: 680 },
];

const statusMeta: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  paid:    { label: 'Paid',    color: '#2EAF6F', bg: '#F0FDF4', icon: CheckCircle },
  late:    { label: 'Late',    color: '#F59E0B', bg: '#FFFBEB', icon: Clock },
  missed:  { label: 'Missed',  color: '#EF4444', bg: '#FEF2F2', icon: AlertTriangle },
  pending: { label: 'Pending', color: '#6B7280', bg: '#F9FAFB', icon: Clock },
};

export default function LeaderContributionsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'missed' | 'late' | 'pending'>('all');
  const [communityFilter, setCommunityFilter] = useState('All');

  const filtered = contributions.filter(c => {
    const matchSearch = c.member.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchCommunity = communityFilter === 'All' || c.community === communityFilter;
    return matchSearch && matchStatus && matchCommunity;
  });

  const paid    = contributions.filter(c => c.status === 'paid').length;
  const missed  = contributions.filter(c => c.status === 'missed').length;
  const late    = contributions.filter(c => c.status === 'late').length;
  const pending = contributions.filter(c => c.status === 'pending').length;
  const rate    = Math.round((paid / contributions.length) * 100);

  const maxRate = Math.max(...rateData);

  return (
    <DashboardLayout>
      <Helmet>
        <title>Contribution Enforcement — PadiHub Leader Tools</title>
        <meta name="description" content="Track and enforce member contributions across your communities." />
        <link rel="canonical" href="https://www.padihub.com/leader/contributions" />
              <meta property="og:title" content="Contribution Enforcement — PadiHub Leader Tools" />
        <meta property="og:description" content="Track and enforce member contributions across your communities." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link to="/leader" className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600 mb-2 transition-colors">
              <ArrowLeft size={12} /> Leader Command Centre
            </Link>
            <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Contribution Enforcement</h1>
            <p className="text-sm text-gray-500 mt-0.5">June 2025 · {contributions.length} members · {rate}% on-time rate</p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold border transition-all hover:bg-gray-50"
              style={{ borderColor: '#E5E7EB', color: '#374151' }}>
              <Download size={15} /> Export
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #F59E0B, #d97706)' }}>
              <Bell size={15} /> Send Reminders
            </button>
          </div>
        </MotionDiv>

        {/* KPI Row */}
        <MotionDiv variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'On-Time Rate',  value: `${rate}%`,  color: '#2EAF6F', ring: rate,  icon: TrendingUp },
            { label: 'Paid',          value: paid,         color: '#2EAF6F', ring: (paid/contributions.length)*100,    icon: CheckCircle },
            { label: 'Missed',        value: missed,       color: '#EF4444', ring: (missed/contributions.length)*100,  icon: AlertTriangle },
            { label: 'Pending',       value: pending+late, color: '#F59E0B', ring: ((pending+late)/contributions.length)*100, icon: Clock },
          ].map((k, i) => (
            <MotionDiv key={i} variants={fadeUp}
              className="bg-white rounded-3xl p-5 flex items-center gap-4 shadow-sm border border-gray-100">
              <ProgressRing value={k.ring} size={52} strokeWidth={4} color={k.color}>
                <k.icon size={16} style={{ color: k.color }} />
              </ProgressRing>
              <div>
                <p className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{k.value}</p>
                <p className="text-xs text-gray-500">{k.label}</p>
              </div>
            </MotionDiv>
          ))}
        </MotionDiv>

        {/* Trend Chart */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible"
          className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>6-Month Contribution Rate</h2>
              <p className="text-xs text-gray-400">Across all communities</p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: '#F0FDF4', color: '#2EAF6F' }}>
              +3% vs last month
            </span>
          </div>
          <div className="flex items-end gap-3 h-28">
            {rateData.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-bold" style={{ color: '#6B7280' }}>{v}%</span>
                <MotionDiv className="w-full rounded-t-xl"
                  style={{ background: v === maxRate ? '#2EAF6F' : '#E5E7EB' }}
                  initial={{ height: 0 }} animate={{ height: `${(v / 100) * 80}px` }}
                  transition={{ duration: 0.6, delay: i * 0.08 }} />
                <span className="text-xs text-gray-400">{months[i]}</span>
              </div>
            ))}
          </div>
        </MotionDiv>

        {/* Filters */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border text-sm focus:outline-none"
              style={{ borderColor: '#E5E7EB' }} />
          </div>
          <select value={communityFilter} onChange={e => setCommunityFilter(e.target.value)}
            className="px-4 py-2.5 rounded-2xl border text-sm font-semibold bg-white focus:outline-none"
            style={{ borderColor: '#E5E7EB', color: '#374151' }}>
            {['All', 'Lagos Savers Circle', 'Family First Network', 'Diaspora Builders'].map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="flex gap-1 p-1 rounded-2xl bg-gray-100">
            {(['all', 'paid', 'missed', 'late', 'pending'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all"
                style={{ background: statusFilter === s ? '#fff' : 'transparent', color: statusFilter === s ? '#111827' : '#6B7280', boxShadow: statusFilter === s ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                {s}
              </button>
            ))}
          </div>
        </MotionDiv>

        {/* Missed/Late Alert Banner */}
        {(missed > 0 || late > 0) && (
          <MotionDiv variants={fadeUp} initial="hidden" animate="visible"
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <AlertTriangle size={18} style={{ color: '#EF4444', flexShrink: 0 }} />
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: '#991B1B' }}>
                {missed} missed · {late} late — Trust Score™ impact pending
              </p>
              <p className="text-xs" style={{ color: '#B91C1C' }}>
                Send reminders now to minimise Trust Score™ deductions for your members.
              </p>
            </div>
            <button className="px-3 py-1.5 rounded-xl text-xs font-bold text-white flex-shrink-0 transition-all hover:opacity-90"
              style={{ background: '#EF4444' }}>
              <Bell size={12} className="inline mr-1" />Send All
            </button>
          </MotionDiv>
        )}

        {/* Contributions List */}
        <MotionDiv variants={stagger} initial="hidden" animate="visible" className="space-y-2">
          <p className="text-sm font-extrabold text-gray-700" style={{ fontFamily: 'Nunito, sans-serif' }}>{filtered.length} records</p>
          {filtered.map((c, i) => {
            const meta = statusMeta[c.status];
            return (
              <MotionDiv key={i} variants={fadeUp}
                className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>{c.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 text-sm">{c.member}</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                  </div>
                  <p className="text-xs text-gray-400">{c.community} · Due {c.due} · {c.paid !== '—' ? `Paid ${c.paid}` : 'Not paid'}</p>
                </div>
                <div className="hidden sm:flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{c.amount}</p>
                    <p className="text-xs text-gray-400">Amount</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Shield size={11} style={{ color: '#8B5CF6' }} />
                      <p className="text-sm font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{c.trust}</p>
                    </div>
                    <p className="text-xs text-gray-400">Trust</p>
                  </div>
                </div>
                {c.status === 'missed' && (
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex-shrink-0 transition-all hover:opacity-90"
                    style={{ background: '#F59E0B' }}>
                    <Bell size={11} /> Remind
                  </button>
                )}
              </MotionDiv>
            );
          })}
        </MotionDiv>

      </div>
    </DashboardLayout>
  );
}
