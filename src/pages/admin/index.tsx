import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import {
  Users, PiggyBank, CreditCard, AlertTriangle,
  HelpCircle, Activity, Shield, ChevronRight,
  Search, Bell, LogOut, BarChart2,
  CheckCircle, Clock, XCircle, Eye
} from 'lucide-react';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

type Section = 'dashboard' | 'users' | 'groups' | 'subscriptions' | 'tickets' | 'audit' | 'announcements';

const kpis = [
  { label: 'Total Users',           value: '2,847',  change: '+124 this month', color: '#2EAF6F', icon: Users },
  { label: 'Active Groups',         value: '312',    change: '+18 this week',   color: '#2eafaf', icon: PiggyBank },
  { label: 'Active Subscriptions',  value: '2,104',  change: '74% of users',    color: '#8B5CF6', icon: CreditCard },
  { label: 'Monthly Revenue',       value: '£8,420', change: '+12% vs last mo', color: '#F59E0B', icon: BarChart2 },
  { label: 'Failed Payments',       value: '23',     change: '1.1% failure rate',color: '#EF4444', icon: AlertTriangle },
  { label: 'Open Support Tickets',  value: '7',      change: '3 urgent',        color: '#F59E0B', icon: HelpCircle },
];

const recentUsers = [
  { name: 'Amara Okafor',  email: 'amara@email.com',  country: 'NG', status: 'active',   joined: '2 days ago',  trust: 847 },
  { name: 'Kofi Asante',   email: 'kofi@email.com',   country: 'UK', status: 'active',   joined: '5 days ago',  trust: 920 },
  { name: 'Temi Balogun',  email: 'temi@email.com',   country: 'NG', status: 'pending',  joined: '1 week ago',  trust: 0 },
  { name: 'James Okafor',  email: 'james@email.com',  country: 'UK', status: 'suspended',joined: '2 weeks ago', trust: 340 },
  { name: 'Ngozi Eze',     email: 'ngozi@email.com',  country: 'NG', status: 'active',   joined: '3 weeks ago', trust: 680 },
];

const recentGroups = [
  { name: 'Lagos Savers Circle',  members: 12, status: 'active',  leader: 'Amara O.',  created: '1 Jan 2026' },
  { name: 'UK Homeowners Hub',    members: 8,  status: 'active',  leader: 'Kofi A.',   created: '15 Jan 2026' },
  { name: 'Family First Network', members: 6,  status: 'active',  leader: 'Temi B.',   created: '1 Feb 2026' },
  { name: 'Diaspora Builders',    members: 15, status: 'paused',  leader: 'James O.',  created: '10 Feb 2026' },
];

const tickets = [
  { id: 'TKT-001', user: 'Amara O.',  subject: 'Payment not reflecting',  priority: 'urgent', status: 'open',   time: '2h ago' },
  { id: 'TKT-002', user: 'Kofi A.',   subject: 'Cannot join group',        priority: 'normal', status: 'open',   time: '5h ago' },
  { id: 'TKT-003', user: 'Ngozi E.',  subject: 'Trust Score not updating', priority: 'normal', status: 'open',   time: '1d ago' },
  { id: 'TKT-004', user: 'Temi B.',   subject: 'Subscription billing issue',priority: 'urgent', status: 'open',  time: '2d ago' },
];

const auditLog = [
  { action: 'User suspended',       actor: 'Admin',       target: 'James Okafor',  time: '1h ago' },
  { action: 'Group paused',         actor: 'Admin',       target: 'Diaspora Builders', time: '3h ago' },
  { action: 'Subscription refunded',actor: 'Admin',       target: 'Temi Balogun',  time: '1d ago' },
  { action: 'Announcement sent',    actor: 'Admin',       target: 'All users',     time: '2d ago' },
  { action: 'User verified',        actor: 'System',      target: 'Ngozi Eze',     time: '3d ago' },
];

const navItems: { id: Section; icon: typeof Users; label: string }[] = [
  { id: 'dashboard',     icon: BarChart2,    label: 'Dashboard' },
  { id: 'users',         icon: Users,        label: 'Users' },
  { id: 'groups',        icon: PiggyBank,    label: 'Groups' },
  { id: 'subscriptions', icon: CreditCard,   label: 'Subscriptions' },
  { id: 'tickets',       icon: HelpCircle,   label: 'Support Tickets' },
  { id: 'audit',         icon: Activity,     label: 'Audit Log' },
  { id: 'announcements', icon: Bell,         label: 'Announcements' },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active:    { bg: 'rgba(46,175,111,0.1)',  color: '#2EAF6F', label: 'Active' },
    pending:   { bg: 'rgba(245,158,11,0.1)',  color: '#F59E0B', label: 'Pending' },
    suspended: { bg: 'rgba(239,68,68,0.1)',   color: '#EF4444', label: 'Suspended' },
    paused:    { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', label: 'Paused' },
    open:      { bg: 'rgba(245,158,11,0.1)',  color: '#F59E0B', label: 'Open' },
    urgent:    { bg: 'rgba(239,68,68,0.1)',   color: '#EF4444', label: 'Urgent' },
    normal:    { bg: 'rgba(46,175,175,0.1)',  color: '#2eafaf', label: 'Normal' },
  };
  const s = map[status] ?? map.normal;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

export default function AdminPortal() {
  const [section, setSection] = useState<Section>('dashboard');

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F8FAFC' }}>
      <Helmet>
        <title>Admin Portal — PadiHub</title>
        <meta name="description" content="PadiHub platform administration — manage users, groups, subscriptions and support tickets." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://padihub.com/admin" />
              <meta property="og:title" content="Admin Portal — PadiHub" />
        <meta property="og:description" content="PadiHub platform administration — manage users, groups, subscriptions and support tickets." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      {/* Sidebar */}
      <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col h-full"
        style={{ background: 'linear-gradient(180deg, #0F172A 0%, #1A1A2E 100%)', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.2)' }}>
              <Shield size={16} style={{ color: '#EF4444' }} />
            </div>
            <div>
              <p className="text-white text-sm font-extrabold" style={{ fontFamily: 'Nunito, sans-serif' }}>Admin Portal</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>PadiHub Platform</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setSection(item.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-200"
              style={{
                background: section === item.id ? 'rgba(239,68,68,0.15)' : 'transparent',
                color: section === item.id ? '#EF4444' : 'rgba(255,255,255,0.6)',
              }}>
              <item.icon size={16} style={{ color: section === item.id ? '#EF4444' : 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
              {item.label}
              {section === item.id && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: '#EF4444' }} />}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold text-red-400 hover:bg-red-400/10 transition-colors">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center gap-3 px-6 bg-white border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <Search size={15} className="text-gray-400" />
            <input placeholder="Search users, groups, tickets…"
              className="flex-1 text-sm text-gray-700 placeholder-gray-400 outline-none bg-transparent" />
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
              Admin
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}>A</div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <MotionDiv initial="hidden" animate="visible" variants={stagger}>

            {/* Dashboard */}
            {section === 'dashboard' && (
              <div className="space-y-6">
                <MotionDiv variants={fadeUp}>
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Platform Overview</h1>
                  <p className="text-gray-400 text-sm mt-1">Real-time platform health and key metrics</p>
                </MotionDiv>

                <MotionDiv variants={stagger} className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {kpis.map(kpi => (
                    <MotionDiv key={kpi.label} variants={fadeUp}
                      className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${kpi.color}15` }}>
                          <kpi.icon size={16} style={{ color: kpi.color }} />
                        </div>
                        <ChevronRight size={14} className="text-gray-300" />
                      </div>
                      <p className="text-2xl font-black text-gray-900 mb-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>{kpi.value}</p>
                      <p className="text-xs font-semibold text-gray-500 mb-1">{kpi.label}</p>
                      <p className="text-xs" style={{ color: kpi.color }}>{kpi.change}</p>
                    </MotionDiv>
                  ))}
                </MotionDiv>

                {/* Recent activity */}
                <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Recent Audit Activity</h2>
                  <div className="space-y-3">
                    {auditLog.slice(0, 4).map((log, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.08)' }}>
                          <Activity size={14} style={{ color: '#EF4444' }} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900">{log.action}</p>
                          <p className="text-xs text-gray-400">{log.target} · by {log.actor}</p>
                        </div>
                        <span className="text-xs text-gray-400">{log.time}</span>
                      </div>
                    ))}
                  </div>
                </MotionDiv>
              </div>
            )}

            {/* Users */}
            {section === 'users' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp} className="flex items-center justify-between">
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Users</h1>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-gray-200 bg-white">
                    <Search size={14} className="text-gray-400" />
                    <input placeholder="Search users…" className="text-sm outline-none text-gray-700 placeholder-gray-400 w-40" />
                  </div>
                </MotionDiv>
                <MotionDiv variants={fadeUp} className="rounded-3xl bg-white overflow-hidden" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-50">
                        {['Name', 'Country', 'Trust Score', 'Status', 'Joined', 'Actions'].map(h => (
                          <th key={h} className="text-left text-xs font-bold text-gray-400 px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentUsers.map((u, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>{u.name[0]}</div>
                              <div>
                                <p className="text-sm font-bold text-gray-900">{u.name}</p>
                                <p className="text-xs text-gray-400">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3"><span className="text-sm text-gray-600">{u.country}</span></td>
                          <td className="px-5 py-3"><span className="text-sm font-bold" style={{ color: '#2EAF6F' }}>{u.trust || '—'}</span></td>
                          <td className="px-5 py-3"><StatusBadge status={u.status} /></td>
                          <td className="px-5 py-3"><span className="text-xs text-gray-400">{u.joined}</span></td>
                          <td className="px-5 py-3">
                            <button className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Eye size={14} className="text-gray-400" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </MotionDiv>
              </div>
            )}

            {/* Groups */}
            {section === 'groups' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp}>
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Groups</h1>
                </MotionDiv>
                <MotionDiv variants={fadeUp} className="rounded-3xl bg-white overflow-hidden" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-50">
                        {['Group Name', 'Members', 'Leader', 'Status', 'Created', 'Actions'].map(h => (
                          <th key={h} className="text-left text-xs font-bold text-gray-400 px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentGroups.map((g, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3"><p className="text-sm font-bold text-gray-900">{g.name}</p></td>
                          <td className="px-5 py-3"><span className="text-sm text-gray-600">{g.members}</span></td>
                          <td className="px-5 py-3"><span className="text-sm text-gray-600">{g.leader}</span></td>
                          <td className="px-5 py-3"><StatusBadge status={g.status} /></td>
                          <td className="px-5 py-3"><span className="text-xs text-gray-400">{g.created}</span></td>
                          <td className="px-5 py-3">
                            <button className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Eye size={14} className="text-gray-400" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </MotionDiv>
              </div>
            )}

            {/* Support Tickets */}
            {section === 'tickets' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp}>
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Support Tickets</h1>
                  <p className="text-gray-400 text-sm mt-1">{tickets.length} open tickets</p>
                </MotionDiv>
                <div className="space-y-3">
                  {tickets.map((t, i) => (
                    <MotionDiv key={i} variants={fadeUp}
                      className="rounded-3xl p-5 bg-white flex items-center gap-4" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: t.priority === 'urgent' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)' }}>
                        {t.priority === 'urgent' ? <AlertTriangle size={18} style={{ color: '#EF4444' }} /> : <Clock size={18} style={{ color: '#F59E0B' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-gray-400">{t.id}</span>
                          <StatusBadge status={t.priority} />
                        </div>
                        <p className="text-sm font-bold text-gray-900">{t.subject}</p>
                        <p className="text-xs text-gray-400">{t.user} · {t.time}</p>
                      </div>
                      <button className="px-4 py-2 rounded-2xl text-xs font-bold text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                        Respond
                      </button>
                    </MotionDiv>
                  ))}
                </div>
              </div>
            )}

            {/* Audit Log */}
            {section === 'audit' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp}>
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Audit Log</h1>
                </MotionDiv>
                <MotionDiv variants={fadeUp} className="rounded-3xl bg-white overflow-hidden" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  {auditLog.map((log, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.08)' }}>
                        <Activity size={14} style={{ color: '#EF4444' }} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">{log.action}</p>
                        <p className="text-xs text-gray-400">Target: {log.target} · Actor: {log.actor}</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{log.time}</span>
                    </div>
                  ))}
                </MotionDiv>
              </div>
            )}

            {/* Subscriptions */}
            {section === 'subscriptions' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp}>
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Subscriptions</h1>
                </MotionDiv>
                <MotionDiv variants={stagger} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Active UK',    value: '1,204', color: '#2EAF6F', icon: CheckCircle },
                    { label: 'Active NG',    value: '900',   color: '#F59E0B', icon: CheckCircle },
                    { label: 'Failed / Lapsed', value: '23', color: '#EF4444', icon: XCircle },
                  ].map(s => (
                    <MotionDiv key={s.label} variants={fadeUp}
                      className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ background: `${s.color}15` }}>
                        <s.icon size={20} style={{ color: s.color }} />
                      </div>
                      <p className="text-3xl font-black text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{s.value}</p>
                      <p className="text-sm text-gray-500 mt-1">{s.label}</p>
                    </MotionDiv>
                  ))}
                </MotionDiv>
              </div>
            )}

            {/* Announcements */}
            {section === 'announcements' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp}>
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Platform Announcements</h1>
                </MotionDiv>
                <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <h2 className="font-bold text-gray-900 mb-4">Send Announcement</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">Title</label>
                      <input placeholder="Announcement title" className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors" />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">Message</label>
                      <textarea rows={4} placeholder="Write your announcement…" className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors resize-none" />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">Send to</label>
                      <select className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors bg-white">
                        <option>All users</option>
                        <option>UK users only</option>
                        <option>Nigeria users only</option>
                        <option>Group leaders only</option>
                      </select>
                    </div>
                    <button className="w-full py-3 rounded-2xl font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                      Send Announcement
                    </button>
                  </div>
                </MotionDiv>
              </div>
            )}

          </MotionDiv>
        </main>
      </div>
    </div>
  );
}
