import { dashboard } from 'virtual:content';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { motion } from 'motion/react';
import {
  Shield, Users, Calendar, ArrowRight,
  ChevronRight, Plus, Bell, CheckCircle,
  PiggyBank, AlertCircle, Clock
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [greeting, setGreeting] = useState('Welcome back');
  const [firstName, setFirstName] = useState('');
  const [trustScore, setTrustScore] = useState(0);

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
    try {
      const raw = localStorage.getItem('padihub_user') || sessionStorage.getItem('padihub_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        const name = parsed?.name || '';
        // Use first word of name as first name for greeting
        setFirstName(name.split(' ')[0] || '');
        setTrustScore(parsed?.trust ?? 0);
      }
    } catch { /* ignore */ }
  }, []);

  return (
    <DashboardLayout>
      <Helmet>
        <title>Dashboard — PadiHub</title>
        <meta name="description" content="Your PadiHub savings dashboard — groups, payments and Trust Score." />
        <link rel="canonical" href="https://padihub.com/dashboard" />
              <meta property="og:title" content="Dashboard — PadiHub" />
        <meta property="og:description" content="Your PadiHub savings dashboard — groups, payments and Trust Score." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Welcome header ─────────────────────────────────────────── */}
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-gray-500 text-sm font-medium">{greeting},</p>
              <h1 className="text-3xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {firstName || 'there'} 👋
              </h1>
              <p className="text-gray-400 text-sm mt-1">Here's what's happening with your groups today.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/notifications" className="relative p-2.5 rounded-2xl hover:bg-gray-100 transition-colors" style={{ border: '1px solid #E5E7EB' }}>
                <Bell size={18} className="text-gray-500" />
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold text-white flex items-center justify-center" style={{ background: '#EF4444' }}>3</span>
              </Link>
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
                style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F', border: '1px solid rgba(46,175,111,0.2)' }}>
                <Shield size={14} /> <span>Trust Score™ {trustScore}</span>
              </div>
            </div>
          </MotionDiv>
        </MotionDiv>

        {/* ── Top row: Payment Due + Current Payout ──────────────────── */}
        <MotionDiv initial="hidden" animate="visible" variants={stagger}
          className="r-grid-2">

          {/* Payment Due Card */}
          <MotionDiv variants={fadeUp}
            className="rounded-3xl p-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: '#EF4444' }} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.2)' }}>
                  <AlertCircle size={18} style={{ color: '#EF4444' }} />
                </div>
                <p className="text-gray-300 text-sm font-semibold">Payment due</p>
              </div>
              <p className="text-white font-bold text-base mb-1">Lagos Savers Circle</p>
              <p className="text-4xl font-black text-white mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>₦35,000</p>
              <div className="flex items-center gap-2 mb-5">
                <Clock size={13} style={{ color: '#F59E0B' }} />
                <p className="text-sm font-semibold" style={{ color: '#F59E0B' }}>Due 10 July 2026</p>
              </div>
              <Button asChild className="w-full rounded-2xl font-bold"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                <Link to="/savings-groups/lagos-savers-circle">Make Payment</Link>
              </Button>
            </div>
          </MotionDiv>

          {/* Current Payout Card */}
          <MotionDiv variants={fadeUp}
            className="rounded-3xl p-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)', border: '1px solid #BBF7D0' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(46,175,111,0.15)' }}>
                <PiggyBank size={18} style={{ color: '#2EAF6F' }} />
              </div>
              <p className="text-gray-600 text-sm font-semibold">This month's payout recipient</p>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-white text-lg flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>K</div>
              <div>
                <p className="font-bold text-gray-900 text-base">Kofi Asante</p>
                <p className="text-sm text-gray-500">Lagos Savers Circle</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-2xl" style={{ background: 'rgba(46,175,111,0.1)' }}>
              <Calendar size={14} style={{ color: '#2EAF6F' }} />
              <p className="text-sm font-semibold" style={{ color: '#2EAF6F' }}>Expected payout: 15 July 2026</p>
            </div>
          </MotionDiv>
        </MotionDiv>

        {/* ── Trust Score ────────────────────────────────────────────── */}
        <MotionDiv initial="hidden" animate="visible" variants={fadeUp}
          className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(46,175,111,0.1)' }}>
                <Shield size={20} style={{ color: '#2EAF6F' }} />
              </div>
              <div>
                <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>My Trust Score™</h2>
                <p className="text-xs text-gray-400">Your savings reputation</p>
              </div>
            </div>
            <Link to="/trust" className="text-sm font-semibold flex items-center gap-1" style={{ color: '#2EAF6F' }}>
              Details <ChevronRight size={14} />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-5xl font-black" style={{ fontFamily: 'Nunito, sans-serif', color: '#2EAF6F' }}>847</p>
            <div className="flex-1">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Trusted Member</span>
                <span>1000</span>
              </div>
              <div className="h-3 rounded-full bg-gray-100">
                <div className="h-3 rounded-full transition-all" style={{ width: '84.7%', background: 'linear-gradient(90deg, #2EAF6F, #F59E0B)' }} />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Your Trust Score increases when you make successful on-time payments.</p>
            </div>
          </div>
        </MotionDiv>

        {/* ── My Groups ──────────────────────────────────────────────── */}
        <MotionDiv initial="hidden" animate="visible" variants={stagger}
          className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>My Groups</h2>
            <Link to="/savings-groups" className="text-sm font-semibold flex items-center gap-1" style={{ color: '#2EAF6F' }}>
              View all <ChevronRight size={14} />
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {dashboard.myGroups.map(g => (
              <MotionDiv key={g.id} variants={fadeUp}>
                <Link to={`/savings-groups/${g.id}`}
                  className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl hover:-translate-y-0.5 transition-transform"
                  style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white text-base flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${g.color}, ${g.color}cc)` }}>
                    {g.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{g.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1"><Users size={11} /> {g.members} members</span>
                      <span className="flex items-center gap-1"><PiggyBank size={11} /> {g.contribution}/mo</span>
                      <span className="flex sm:hidden items-center gap-1 font-semibold" style={{ color: g.color }}>Next: {g.nextPayment}</span>
                    </div>
                  </div>
                  <div className="hidden sm:block text-right flex-shrink-0 min-w-0">
                    <p className="text-xs text-gray-400">Next payment</p>
                    <p className="text-sm font-bold" style={{ color: g.color }}>{g.nextPayment}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                </Link>
              </MotionDiv>
            ))}
          </div>
        </MotionDiv>

        {/* ── Notifications Preview ──────────────────────────────────── */}
        <MotionDiv initial="hidden" animate="visible" variants={stagger}
          className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Notifications</h2>
            <Link to="/notifications" className="text-sm font-semibold flex items-center gap-1" style={{ color: '#2EAF6F' }}>
              View all <ChevronRight size={14} />
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {dashboard.notifications.map((n, i) => (
              <MotionDiv key={i} variants={fadeUp}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm"
                style={{
                  background: n.type === 'warning' ? 'rgba(245,158,11,0.06)' : n.type === 'success' ? 'rgba(46,175,111,0.06)' : 'rgba(46,175,175,0.06)',
                  border: `1px solid ${n.type === 'warning' ? 'rgba(245,158,11,0.15)' : n.type === 'success' ? 'rgba(46,175,111,0.15)' : 'rgba(46,175,175,0.15)'}`,
                }}>
                <span className="flex-shrink-0">
                  {n.type === 'warning' ? <AlertCircle size={15} style={{ color: '#F59E0B' }} />
                    : n.type === 'success' ? <CheckCircle size={15} style={{ color: '#2EAF6F' }} />
                    : <Bell size={15} style={{ color: '#2eafaf' }} />}
                </span>
                <span className="flex-1 text-gray-700 font-medium">{n.text}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{n.time}</span>
              </MotionDiv>
            ))}
          </div>
        </MotionDiv>

        {/* ── Quick Actions ──────────────────────────────────────────── */}
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <motion.h2 variants={fadeUp} className="text-lg font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Quick Actions
          </motion.h2>
          <MotionDiv variants={stagger} className="r-grid-3">
            {[
              { icon: Plus,      label: 'Create Group',  href: '/savings-groups/create', color: '#2EAF6F', desc: 'Start a new rotating savings group' },
              { icon: Users,     label: 'Join Group',    href: '/savings-groups',         color: '#2eafaf', desc: 'Find and join an existing group' },
              { icon: PiggyBank, label: 'Make Payment',  href: '/savings-groups',         color: '#F59E0B', desc: 'Contribute to your active groups' },
            ].map(a => (
              <MotionDiv key={a.label} variants={fadeUp}>
                <Link to={a.href}
                  className="flex flex-col items-center text-center p-6 rounded-3xl hover:-translate-y-1 transition-transform duration-300"
                  style={{ background: `${a.color}08`, border: `2px solid ${a.color}20` }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                    style={{ background: `${a.color}15` }}>
                    <a.icon size={24} style={{ color: a.color }} />
                  </div>
                  <p className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>{a.label}</p>
                  <p className="text-xs text-gray-500">{a.desc}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-semibold" style={{ color: a.color }}>
                    Get started <ArrowRight size={12} />
                  </div>
                </Link>
              </MotionDiv>
            ))}
          </MotionDiv>
        </MotionDiv>

      </div>
    </DashboardLayout>
  );
}
