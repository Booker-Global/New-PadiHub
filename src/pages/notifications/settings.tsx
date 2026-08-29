import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  ChevronLeft, Bell, Shield, Users, Award, PiggyBank,
  Calendar, CheckCircle, Save, Smartphone, Mail
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
      style={{ background: on ? '#2EAF6F' : '#D1D5DB' }}>
      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
        style={{ left: on ? '22px' : '2px' }} />
    </button>
  );
}

const channels = [
  { key: 'push',  label: 'Push Notifications', desc: 'Receive notifications on your device', icon: Smartphone, color: '#2EAF6F' },
  { key: 'email', label: 'Email Notifications', desc: 'Receive notifications via email',       icon: Mail,       color: '#8B5CF6' },
  { key: 'inapp', label: 'In-App Notifications',desc: 'Show notifications inside PadiHub',     icon: Bell,       color: '#F59E0B' },
];

const groups = [
  {
    title: 'Contributions & Savings', icon: PiggyBank, color: '#2EAF6F',
    settings: [
      { key: 'contrib_due',     label: 'Contribution Due Reminders', desc: 'Remind me before contributions are due',     default: true },
      { key: 'contrib_confirm', label: 'Contribution Confirmations', desc: 'Confirm when contributions are processed',   default: true },
      { key: 'savings_update',  label: 'Savings Group Updates',      desc: 'Updates on savings group progress',          default: true },
      { key: 'payout_alert',    label: 'Payout Alerts',              desc: 'Notify when payouts are scheduled',          default: true },
    ],
  },
  {
    title: 'Community Activity', icon: Users, color: '#8B5CF6',
    settings: [
      { key: 'new_member',      label: 'New Members',                desc: 'When someone joins your community',          default: true },
      { key: 'community_ann',   label: 'Community Announcements',    desc: 'Important announcements from leaders',       default: true },
      { key: 'community_event', label: 'Community Events',           desc: 'Upcoming events and meetings',               default: true },
      { key: 'member_milestone',label: 'Member Milestones',          desc: 'When members reach achievements',            default: false },
    ],
  },
  {
    title: 'Governance', icon: Shield, color: '#2eafaf',
    settings: [
      { key: 'new_proposal',    label: 'New Proposals',              desc: 'When a new governance proposal is created',  default: true },
      { key: 'vote_reminder',   label: 'Vote Reminders',             desc: 'Remind me to vote before closing',           default: true },
      { key: 'vote_result',     label: 'Vote Results',               desc: 'When a governance vote concludes',           default: true },
      { key: 'meeting_reminder',label: 'Meeting Reminders',          desc: 'Remind me of upcoming community meetings',   default: true },
    ],
  },
  {
    title: 'Trust Score', icon: Shield, color: '#F59E0B',
    settings: [
      { key: 'trust_change',    label: 'Trust Score™ Changes',       desc: 'When your Trust Score™ changes',             default: true },
      { key: 'trust_tier',      label: 'Trust Tier Updates',         desc: 'When you reach a new Trust Tier',            default: true },
    ],
  },
  {
    title: 'Achievements & Passport™', icon: Award, color: '#8B5CF6',
    settings: [
      { key: 'badge_earned',    label: 'Badge Earned',               desc: 'When you earn a new achievement badge',      default: true },
      { key: 'passport_view',   label: 'Passport™ Views',            desc: 'When someone views your Passport™',          default: false },
      { key: 'passport_update', label: 'Passport™ Updates',          desc: 'When your Passport™ is updated',             default: true },
    ],
  },
  {
    title: 'Account & Subscription', icon: Calendar, color: '#EF4444',
    settings: [
      { key: 'sub_renewal',     label: 'Subscription Renewal',       desc: 'Before your subscription renews',            default: true },
      { key: 'payment_confirm', label: 'Payment Confirmations',      desc: 'When payments are processed',                default: true },
      { key: 'security_alert',  label: 'Security Alerts',            desc: 'Unusual account activity',                   default: true },
    ],
  },
];

const frequencies = ['Immediately', 'Hourly digest', 'Daily digest', 'Weekly digest'];
const quietHours = ['Off', '10pm – 7am', '11pm – 8am', 'Custom'];

export default function NotificationSettingsPage() {
  const initState: Record<string, boolean> = {};
  groups.forEach(g => g.settings.forEach(s => { initState[s.key] = s.default; }));
  channels.forEach(c => { initState[c.key] = true; });

  const [settings, setSettings] = useState(initState);
  const [frequency, setFrequency] = useState('Immediately');
  const [quietHour, setQuietHour] = useState('Off');
  const [saved, setSaved] = useState(false);

  const toggle = (key: string, val: boolean) => setSettings(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Notification Settings — PadiHub</title>
        <meta name="description" content="Manage your PadiHub notification preferences." />
        <link rel="canonical" href="https://padihub.com/notifications/settings" />
              <meta property="og:title" content="Notification Settings — PadiHub" />
        <meta property="og:description" content="Manage your PadiHub notification preferences." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          <MotionDiv variants={fadeUp} className="flex items-center gap-3 mb-6">
            <Link to="/notifications" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back
            </Link>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Notification Settings</h1>
              <p className="text-gray-500 text-sm">Control how and when PadiHub notifies you.</p>
            </div>
          </MotionDiv>

          {/* Channels */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Notification Channels</h2>
            <div className="flex flex-col gap-3">
              {channels.map(c => (
                <div key={c.key} className="flex items-center justify-between gap-3 p-3 rounded-2xl"
                  style={{ background: '#F9FAFB' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: `${c.color}12` }}>
                      <c.icon size={15} style={{ color: c.color }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{c.label}</p>
                      <p className="text-xs text-gray-400">{c.desc}</p>
                    </div>
                  </div>
                  <Toggle on={settings[c.key]} onChange={v => toggle(c.key, v)} />
                </div>
              ))}
            </div>
          </MotionDiv>

          {/* Frequency */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Notification Frequency</h2>
            <div className="grid grid-cols-2 gap-2">
              {frequencies.map(f => (
                <button key={f} onClick={() => setFrequency(f)}
                  className="p-3 rounded-2xl text-sm font-bold text-left transition-all"
                  style={{
                    background: frequency === f ? 'rgba(46,175,111,0.08)' : '#F9FAFB',
                    border: frequency === f ? '2px solid #2EAF6F' : '2px solid transparent',
                    color: frequency === f ? '#2EAF6F' : '#6B7280',
                  }}>
                  {frequency === f && <CheckCircle size={12} className="inline mr-1.5" style={{ color: '#2EAF6F' }} />}
                  {f}
                </button>
              ))}
            </div>
          </MotionDiv>

          {/* Quiet Hours */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <h2 className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Quiet Hours</h2>
            <p className="text-xs text-gray-400 mb-4">Pause non-urgent notifications during these hours.</p>
            <div className="grid grid-cols-2 gap-2">
              {quietHours.map(q => (
                <button key={q} onClick={() => setQuietHour(q)}
                  className="p-3 rounded-2xl text-sm font-bold text-left transition-all"
                  style={{
                    background: quietHour === q ? 'rgba(139,92,246,0.08)' : '#F9FAFB',
                    border: quietHour === q ? '2px solid #8B5CF6' : '2px solid transparent',
                    color: quietHour === q ? '#8B5CF6' : '#6B7280',
                  }}>
                  {quietHour === q && <CheckCircle size={12} className="inline mr-1.5" style={{ color: '#8B5CF6' }} />}
                  {q}
                </button>
              ))}
            </div>
          </MotionDiv>

          {/* Notification groups */}
          {groups.map((group, gi) => (
            <MotionDiv key={gi} variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: `${group.color}12` }}>
                  <group.icon size={15} style={{ color: group.color }} />
                </div>
                <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.title}</h2>
              </div>
              <div className="flex flex-col gap-3">
                {group.settings.map((s, si) => (
                  <div key={si} className="flex items-center justify-between gap-3 p-3 rounded-2xl"
                    style={{ background: '#F9FAFB' }}>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">{s.label}</p>
                      <p className="text-xs text-gray-400">{s.desc}</p>
                    </div>
                    <Toggle on={settings[s.key]} onChange={v => toggle(s.key, v)} />
                  </div>
                ))}
              </div>
            </MotionDiv>
          ))}

          {/* Save */}
          <MotionDiv variants={fadeUp}>
            <button onClick={handleSave}
              className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 16px rgba(46,175,111,0.3)' }}>
              {saved ? <><CheckCircle size={16} /> Saved!</> : <><Save size={16} /> Save Preferences</>}
            </button>
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
