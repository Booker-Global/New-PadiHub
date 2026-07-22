import { Helmet } from '@dr.pogodin/react-helmet';
import { useState } from 'react';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  Search, Shield, Star, Crown, AlertTriangle,
  Clock, UserPlus, Mail, MoreHorizontal,
  TrendingUp, TrendingDown, Award, ArrowLeft
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

const communities = ['All Communities', 'Lagos Savers Circle', 'Family First Network', 'Diaspora Builders'];

const members = [
  { name: 'Amara Okafor',   avatar: 'A', color: '#2EAF6F', trust: 920, karma: 2340, status: 'active',  role: 'member',  contributions: 100, joined: 'Jan 2025', community: 'Lagos Savers Circle',  trend: 'up',   lastActive: '2h ago' },
  { name: 'Tunde Bello',    avatar: 'T', color: '#F59E0B', trust: 880, karma: 1890, status: 'active',  role: 'leader',  contributions: 95,  joined: 'Feb 2025', community: 'Lagos Savers Circle',  trend: 'up',   lastActive: '5h ago' },
  { name: 'Chidi Nwosu',    avatar: 'C', color: '#EF4444', trust: 760, karma: 1240, status: 'warning', role: 'member',  contributions: 78,  joined: 'Mar 2025', community: 'Family First Network', trend: 'down', lastActive: '3d ago' },
  { name: 'Fatima Aliyu',   avatar: 'F', color: '#8B5CF6', trust: 910, karma: 2100, status: 'active',  role: 'member',  contributions: 100, joined: 'Jan 2025', community: 'Family First Network', trend: 'up',   lastActive: '1h ago' },
  { name: 'Yemi Oladele',   avatar: 'Y', color: '#2eafaf', trust: 840, karma: 1650, status: 'active',  role: 'member',  contributions: 92,  joined: 'Apr 2025', community: 'Diaspora Builders',    trend: 'up',   lastActive: '4h ago' },
  { name: 'Ngozi Eze',      avatar: 'N', color: '#2EAF6F', trust: 870, karma: 1780, status: 'active',  role: 'member',  contributions: 97,  joined: 'Feb 2025', community: 'Diaspora Builders',    trend: 'up',   lastActive: '1d ago' },
  { name: 'Emeka Obi',      avatar: 'E', color: '#F59E0B', trust: 720, karma: 980,  status: 'warning', role: 'member',  contributions: 65,  joined: 'May 2025', community: 'Lagos Savers Circle',  trend: 'down', lastActive: '5d ago' },
  { name: 'Kemi Adeyemi',   avatar: 'K', color: '#8B5CF6', trust: 950, karma: 2890, status: 'active',  role: 'leader',  contributions: 100, joined: 'Jan 2025', community: 'Diaspora Builders',    trend: 'up',   lastActive: '30m ago' },
  { name: 'Bola Ogundimu',  avatar: 'B', color: '#2eafaf', trust: 800, karma: 1420, status: 'active',  role: 'member',  contributions: 88,  joined: 'Mar 2025', community: 'Family First Network', trend: 'up',   lastActive: '2d ago' },
  { name: 'Seun Adesanya',  avatar: 'S', color: '#EF4444', trust: 680, karma: 820,  status: 'at-risk', role: 'member',  contributions: 55,  joined: 'Jun 2025', community: 'Family First Network', trend: 'down', lastActive: '7d ago' },
];

const joinRequests = [
  { name: 'Adaeze Okonkwo', community: 'Lagos Savers Circle', time: '2h ago', trust: 720 },
  { name: 'Femi Adebayo',   community: 'Diaspora Builders',   time: '1d ago', trust: 810 },
];

export default function LeaderMembersPage() {
  const [search, setSearch] = useState('');
  const [community, setCommunity] = useState('All Communities');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'warning' | 'at-risk'>('all');
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const filtered = members.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const matchCommunity = community === 'All Communities' || m.community === community;
    const matchStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchSearch && matchCommunity && matchStatus;
  });

  const statusColor = (s: string) => s === 'active' ? '#2EAF6F' : s === 'warning' ? '#F59E0B' : '#EF4444';
  const statusBg   = (s: string) => s === 'active' ? '#F0FDF4' : s === 'warning' ? '#FFFBEB' : '#FEF2F2';

  return (
    <DashboardLayout>
      <Helmet>
        <title>Member Management — PadiHub Leader Tools</title>
        <meta name="description" content="Manage your community members, review join requests and track member health." />
        <link rel="canonical" href="https://www.padihub.com/leader/members" />
              <meta property="og:title" content="Member Management — PadiHub Leader Tools" />
        <meta property="og:description" content="Manage your community members, review join requests and track member health." />
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
            <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Member Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">{members.length} members across 3 communities · {joinRequests.length} join requests</p>
          </div>
          <div className="flex gap-3">
            <Link to="/savings-groups"
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
              <UserPlus size={15} /> Invite Member
            </Link>
          </div>
        </MotionDiv>

        {/* Join Requests */}
        {joinRequests.length > 0 && (
          <MotionDiv variants={fadeUp} initial="hidden" animate="visible"
            className="rounded-3xl p-5 border" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} style={{ color: '#F59E0B' }} />
              <h2 className="text-sm font-extrabold" style={{ color: '#92400E', fontFamily: 'Nunito, sans-serif' }}>
                Pending Join Requests ({joinRequests.length})
              </h2>
            </div>
            <div className="flex flex-col gap-2">
              {joinRequests.map((r, i) => (
                <div key={i} className="flex items-center justify-between bg-white rounded-2xl p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm"
                      style={{ background: '#F59E0B' }}>{r.name[0]}</div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.community} · Trust {r.trust} · {r.time}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                      style={{ background: '#2EAF6F' }}>Approve</button>
                    <button className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:bg-gray-50"
                      style={{ borderColor: '#E5E7EB', color: '#6B7280' }}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          </MotionDiv>
        )}

        {/* Filters */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border text-sm focus:outline-none focus:ring-2 transition-all"
              style={{ borderColor: '#E5E7EB', focusRingColor: '#2EAF6F' } as React.CSSProperties} />
          </div>
          <select value={community} onChange={e => setCommunity(e.target.value)}
            className="px-4 py-2.5 rounded-2xl border text-sm font-semibold bg-white focus:outline-none"
            style={{ borderColor: '#E5E7EB', color: '#374151' }}>
            {communities.map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="flex gap-1 p-1 rounded-2xl bg-gray-100">
            {(['all', 'active', 'warning', 'at-risk'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all"
                style={{ background: statusFilter === s ? '#fff' : 'transparent', color: statusFilter === s ? '#111827' : '#6B7280', boxShadow: statusFilter === s ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                {s}
              </button>
            ))}
          </div>
        </MotionDiv>

        {/* Summary stats */}
        <MotionDiv variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active',  value: members.filter(m => m.status === 'active').length,  color: '#2EAF6F', bg: '#F0FDF4' },
            { label: 'Warning', value: members.filter(m => m.status === 'warning').length, color: '#F59E0B', bg: '#FFFBEB' },
            { label: 'At Risk', value: members.filter(m => m.status === 'at-risk').length, color: '#EF4444', bg: '#FEF2F2' },
          ].map((s, i) => (
            <MotionDiv key={i} variants={fadeUp}
              className="rounded-2xl p-4 text-center" style={{ background: s.bg }}>
              <p className="text-2xl font-extrabold" style={{ color: s.color, fontFamily: 'Nunito, sans-serif' }}>{s.value}</p>
              <p className="text-xs font-bold" style={{ color: s.color }}>{s.label}</p>
            </MotionDiv>
          ))}
        </MotionDiv>

        {/* Member Table */}
        <MotionDiv variants={stagger} initial="hidden" animate="visible" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-gray-700" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {filtered.length} members
            </h2>
          </div>
          {filtered.map((m, i) => (
            <MotionDiv key={i} variants={fadeUp}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedMember(selectedMember === m.name ? null : m.name)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${m.color}, ${m.color}cc)` }}>{m.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 text-sm">{m.name}</p>
                    {m.role === 'leader' && <Crown size={12} style={{ color: '#F59E0B' }} />}
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
                      style={{ background: statusBg(m.status), color: statusColor(m.status) }}>{m.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{m.community} · Joined {m.joined} · Active {m.lastActive}</p>
                </div>
                <div className="hidden sm:flex items-center gap-6">
                  <div className="text-center">
                    <div className="flex items-center gap-1">
                      <Shield size={11} style={{ color: '#8B5CF6' }} />
                      <p className="text-sm font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{m.trust}</p>
                    </div>
                    <p className="text-xs text-gray-400">Trust</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1">
                      <Star size={11} style={{ color: '#F59E0B' }} />
                      <p className="text-sm font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{m.karma.toLocaleString()}</p>
                    </div>
                    <p className="text-xs text-gray-400">Karma</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1">
                      {m.trend === 'up' ? <TrendingUp size={11} style={{ color: '#2EAF6F' }} /> : <TrendingDown size={11} style={{ color: '#EF4444' }} />}
                      <p className="text-sm font-extrabold" style={{ color: m.contributions >= 90 ? '#2EAF6F' : m.contributions >= 75 ? '#F59E0B' : '#EF4444', fontFamily: 'Nunito, sans-serif' }}>{m.contributions}%</p>
                    </div>
                    <p className="text-xs text-gray-400">Contrib.</p>
                  </div>
                </div>
                <button className="p-1.5 rounded-lg hover:bg-gray-50 transition-all flex-shrink-0">
                  <MoreHorizontal size={16} style={{ color: '#9CA3AF' }} />
                </button>
              </div>

              {/* Expanded actions */}
              {selectedMember === m.name && (
                <MotionDiv initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:bg-gray-50"
                    style={{ borderColor: '#E5E7EB', color: '#374151' }}>
                    <Mail size={12} /> Send Message
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:bg-gray-50"
                    style={{ borderColor: '#E5E7EB', color: '#374151' }}>
                    <Award size={12} /> View Passport™
                  </button>
                  {m.status !== 'active' && (
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 text-white"
                      style={{ background: '#F59E0B' }}>
                      <AlertTriangle size={12} /> Send Reminder
                    </button>
                  )}
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:bg-red-50"
                    style={{ borderColor: '#FECACA', color: '#EF4444' }}>
                    Remove Member
                  </button>
                </MotionDiv>
              )}
            </MotionDiv>
          ))}
        </MotionDiv>

      </div>
    </DashboardLayout>
  );
}
