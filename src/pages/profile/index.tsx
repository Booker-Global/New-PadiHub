import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  Shield, Users, TrendingUp, Globe, Award, Bell, Lock,
  Eye, Palette, CreditCard, ChevronRight, Edit,
  CheckCircle, Star, Camera, LogOut, Trash2, Settings
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className="relative w-10 h-5 rounded-full transition-all flex-shrink-0"
      style={{ background: on ? '#2EAF6F' : '#D1D5DB' }}>
      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
        style={{ left: on ? '22px' : '2px' }} />
    </button>
  );
}

const quickActions = [
  { label: 'Edit Profile',    icon: Edit,    color: '#2EAF6F', link: '/profile/edit' },
  { label: 'Trust Score™',   icon: Shield,  color: '#8B5CF6', link: '/trust' },
  { label: 'Notifications',  icon: Bell,    color: '#2eafaf', link: '/notifications' },
  { label: 'Settings',       icon: Settings,color: '#F59E0B', link: '/settings' },
];

const accountSections = [
  {
    title: 'Subscription', icon: CreditCard, color: '#2EAF6F',
    items: [
      { label: 'Current Plan',      value: 'Premium · UK',  link: '/subscription/manage' },
      { label: 'Billing History',   value: 'View invoices', link: '/subscription/billing' },
      { label: 'Renew / Upgrade',   value: '',              link: '/subscription/renew' },
    ],
  },
  {
    title: 'Privacy', icon: Eye, color: '#8B5CF6',
    items: [
      { label: 'Activity Visibility',  value: 'Members',  link: '/settings' },
      { label: 'Search Visibility',    value: 'On',       link: '/settings' },
    ],
  },
  {
    title: 'Notifications', icon: Bell, color: '#F59E0B',
    items: [
      { label: 'Push Notifications', value: 'On',  link: '/notifications/settings' },
      { label: 'Email Digest',       value: 'Daily',link: '/notifications/settings' },
      { label: 'Quiet Hours',        value: 'Off', link: '/notifications/settings' },
    ],
  },
  {
    title: 'Security', icon: Lock, color: '#EF4444',
    items: [
      { label: 'Change Password',     value: '',         link: '/settings' },
      { label: 'Two-Factor Auth',     value: 'Enabled',  link: '/settings' },
      { label: 'Active Sessions',     value: '2 devices',link: '/settings' },
    ],
  },
  {
    title: 'Appearance', icon: Palette, color: '#2eafaf',
    items: [
      { label: 'Theme',          value: 'Light',   link: '/settings' },
      { label: 'Language',       value: 'English', link: '/settings' },
      { label: 'Currency',       value: 'GBP (£)', link: '/settings' },
    ],
  },
];

const communities = [
  { name: 'Lagos Savers Circle',  role: 'Member',   color: '#2EAF6F', initial: 'L', id: 'lagos-savers-circle' },
  { name: 'UK Homeowners Hub',    role: 'Member',   color: '#2eafaf', initial: 'U', id: 'uk-homeowners-hub' },
  { name: 'Diaspora Builders',    role: 'Leader',   color: '#8B5CF6', initial: 'D', id: 'diaspora-builders' },
  { name: 'Family First Network', role: 'Moderator',color: '#F59E0B', initial: 'F', id: 'family-first-network' },
];

const achievements = [
  { title: 'First Contribution', color: '#CD7F32', icon: CheckCircle },
  { title: 'Reliable Member',    color: '#9CA3AF', icon: Shield },
  { title: 'Verified Member',    color: '#2EAF6F', icon: CheckCircle },
  { title: 'Early Adopter',      color: '#CD7F32', icon: Star },
];

export default function ProfilePage() {
  const [twoFactor, setTwoFactor] = useState(true);
  const [publicPassport, setPublicPassport] = useState(true);

  return (
    <DashboardLayout>
      <Helmet>
        <title>Personal Control Centre — PadiHub</title>
        <meta name="description" content="Manage your PadiHub profile, subscription, privacy and account settings." />
        <link rel="canonical" href="https://padihub.com/profile" />
              <meta property="og:title" content="Personal Control Centre — PadiHub" />
        <meta property="og:description" content="Manage your PadiHub profile, subscription, privacy and account settings." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          {/* Header */}
          <MotionDiv variants={fadeUp} className="flex items-start justify-between gap-3 mb-6">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Personal Control Centre</h1>
              <p className="text-gray-500 text-sm mt-1">Manage your identity, settings and preferences.</p>
            </div>
            <Link to="/profile/edit"
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
              <Edit size={14} /> <span className="hidden sm:inline">Edit Profile</span><span className="sm:hidden">Edit</span>
            </Link>
          </MotionDiv>

          {/* Profile hero */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-15" style={{ background: '#2EAF6F' }} />
            <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full blur-3xl opacity-10" style={{ background: '#F59E0B' }} />

            <div className="relative flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-black text-2xl sm:text-3xl text-white"
                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 30px rgba(46,175,111,0.4)' }}>
                  A
                </div>
                <Link to="/profile/edit"
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: '#2EAF6F', border: '2px solid #1A1A2E' }}>
                  <Camera size={12} color="#fff" />
                </Link>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold text-white mb-0.5 truncate" style={{ fontFamily: 'Nunito, sans-serif' }}>Amara Okonkwo</h2>
                <p className="text-xs sm:text-sm mb-2 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>@amara.okonkwo · PP-2026-AO-8472</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: 'rgba(46,175,111,0.2)', color: '#2EAF6F' }}>
                    ✓ Verified
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: 'rgba(245,158,11,0.2)', color: '#F59E0B' }}>
                    Premium · UK
                  </span>
                  <span className="hidden sm:inline text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
                    Member since Jan 2026
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="relative grid grid-cols-3 gap-3 mt-5">
              {[
                { label: 'Trust Score™',     value: '847',   color: '#2EAF6F' },
                { label: 'Community Karma™', value: '1,240', color: '#F59E0B' },
                { label: 'Communities',      value: '4',     color: '#8B5CF6' },
              ].map(s => (
                <div key={s.label} className="rounded-2xl p-3 text-center"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <p className="text-xl font-black" style={{ color: s.color, fontFamily: 'Nunito, sans-serif' }}>{s.value}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </MotionDiv>

          {/* Quick actions */}
          <MotionDiv variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {quickActions.map((a, i) => (
              <Link key={i} to={a.link}
                className="rounded-2xl p-3 sm:p-4 text-center bg-white transition-all hover:-translate-y-0.5"
                style={{ border: '1px solid #F3F4F6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2"
                  style={{ background: `${a.color}12` }}>
                  <a.icon size={18} style={{ color: a.color }} />
                </div>
                <p className="text-xs font-bold text-gray-700 leading-tight">{a.label}</p>
              </Link>
            ))}
          </MotionDiv>

          {/* Bio */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>About Me</h2>
              <Link to="/profile/edit" className="text-xs font-bold" style={{ color: '#2EAF6F' }}>Edit</Link>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Community builder and diaspora entrepreneur passionate about collective savings and financial empowerment. Based in London, connected to Lagos.
            </p>
            <div className="flex flex-wrap gap-2">
              {['Savings', 'Property', 'Entrepreneurship', 'Diaspora', 'Community Building'].map(tag => (
                <span key={tag} className="text-xs font-bold px-3 py-1 rounded-full"
                  style={{ background: 'rgba(46,175,111,0.08)', color: '#2EAF6F' }}>
                  {tag}
                </span>
              ))}
            </div>
          </MotionDiv>

          {/* Achievements */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Achievements</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {achievements.map((a, i) => (
                <div key={i} className="rounded-2xl p-3 text-center"
                  style={{ background: `${a.color}10`, border: `1px solid ${a.color}20` }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center mx-auto mb-1.5"
                    style={{ background: `linear-gradient(135deg, ${a.color}, ${a.color}cc)` }}>
                    <a.icon size={14} color="#fff" />
                  </div>
                  <p className="text-xs font-bold text-gray-700 leading-tight">{a.title}</p>
                </div>
              ))}
            </div>
          </MotionDiv>

          {/* Communities */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>My Savings Groups</h2>
              <Link to="/savings-groups" className="text-xs font-bold" style={{ color: '#2EAF6F' }}>View all →</Link>
            </div>
            <div className="flex flex-col gap-2">
              {communities.map((c, i) => (
                <Link key={i} to={`/savings-groups`}
                  className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>
                    {c.initial}
                  </div>
                  <p className="flex-1 text-sm font-semibold text-gray-700">{c.name}</p>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: `${c.color}12`, color: c.color }}>
                    {c.role}
                  </span>
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                </Link>
              ))}
            </div>
          </MotionDiv>

          {/* Quick toggles */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Quick Settings</h2>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                <div>
                  <p className="text-sm font-bold text-gray-900">Public Passport™</p>
                  <p className="text-xs text-gray-400">Allow anyone to view your Passport™</p>
                </div>
                <Toggle on={publicPassport} onChange={setPublicPassport} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                <div>
                  <p className="text-sm font-bold text-gray-900">Two-Factor Authentication</p>
                  <p className="text-xs text-gray-400">Extra security for your account</p>
                </div>
                <Toggle on={twoFactor} onChange={setTwoFactor} />
              </div>
            </div>
          </MotionDiv>

          {/* Account sections */}
          {accountSections.map((section, si) => (
            <MotionDiv key={si} variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: `${section.color}12` }}>
                  <section.icon size={15} style={{ color: section.color }} />
                </div>
                <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{section.title}</h2>
              </div>
              <div className="flex flex-col gap-1">
                {section.items.map((item, ii) => (
                  <Link key={ii} to={item.link}
                    className="flex items-center justify-between p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                    <p className="text-sm font-semibold text-gray-700">{item.label}</p>
                    <div className="flex items-center gap-2">
                      {item.value && <span className="text-xs text-gray-400">{item.value}</span>}
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                  </Link>
                ))}
              </div>
            </MotionDiv>
          ))}

          {/* Danger zone */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-6 bg-white"
            style={{ border: '1px solid rgba(239,68,68,0.15)' }}>
            <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Account Actions</h2>
            <div className="flex flex-col gap-2">
              <button className="flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)' }}>
                  <LogOut size={15} style={{ color: '#F59E0B' }} />
                </div>
                <p className="text-sm font-bold text-gray-700">Sign Out</p>
              </button>
              <button className="flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-red-50 transition-colors">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <Trash2 size={15} style={{ color: '#EF4444' }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#EF4444' }}>Delete Account</p>
                  <p className="text-xs text-gray-400">Permanently remove your account and data</p>
                </div>
              </button>
            </div>
          </MotionDiv>

          {/* Four pillars */}
          <MotionDiv variants={fadeUp} className="flex flex-wrap justify-center gap-3">
            {[
              { label: 'Trust',        color: '#2EAF6F', icon: Shield },
              { label: 'Transparency', color: '#2eafaf', icon: Globe },
              { label: 'Community',    color: '#8B5CF6', icon: Users },
              { label: 'Progress',     color: '#F59E0B', icon: TrendingUp },
            ].map(pill => (
              <div key={pill.label} className="flex items-center gap-2 px-4 py-2 rounded-full"
                style={{ background: `${pill.color}08`, border: `1px solid ${pill.color}20` }}>
                <pill.icon size={13} style={{ color: pill.color }} />
                <span className="text-xs font-bold text-gray-600">{pill.label}</span>
              </div>
            ))}
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
