import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  Bell, Shield, Users, CheckCircle, Star, TrendingUp, Globe,
  Award, Zap, Calendar, PiggyBank, Settings, ArrowRight, X
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

const kpis = [
  { label: 'Unread',          value: '7',  color: '#EF4444', icon: Bell },
  { label: 'Priority Actions',value: '3',  color: '#F59E0B', icon: Zap },
  { label: 'Achievements',    value: '2',  color: '#8B5CF6', icon: Award },
  { label: 'Reminders',       value: '4',  color: '#2EAF6F', icon: Calendar },
];

type Notif = {
  id: string; title: string; body: string; time: string; read: boolean;
  color: string; icon: typeof Bell; category: string; action?: string; actionLink?: string;
};

const allNotifications: Notif[] = [
  // Priority
  { id: 'n1', title: 'Contribution Due Tomorrow',    body: 'Your ₦5,000 contribution to Lagos Savers Circle is due tomorrow.',    time: '2h ago',  read: false, color: '#F59E0B', icon: PiggyBank, category: 'priority', action: 'Contribute now', actionLink: '/savings-groups/monthly-ajo/contribute' },
  { id: 'n2', title: 'Trust Score™ Review',          body: 'Your Trust Score™ is due for review. Complete your profile to maintain your score.', time: '3h ago', read: false, color: '#2EAF6F', icon: Shield, category: 'priority', action: 'Review now', actionLink: '/trust' },
  { id: 'n3', title: 'Subscription Renewal',         body: 'Your PadiHub membership renews in 14 days.',                        time: '5h ago',  read: false, color: '#F59E0B', icon: Calendar, category: 'priority', action: 'Manage subscription', actionLink: '/subscription/manage' },
  // Today
  { id: 'n4', title: 'New Member Joined',             body: 'Ngozi Adeyemi joined Lagos Savers Circle.',                           time: '1h ago',  read: false, color: '#2EAF6F', icon: Users,    category: 'today' },
  { id: 'n5', title: 'Achievement Unlocked',          body: 'You earned the "Reliable Member" badge for 6 months of contributions.', time: '4h ago', read: false, color: '#F59E0B', icon: Award,    category: 'today', action: 'View Trust Score™', actionLink: '/trust' },
  { id: 'n6', title: 'Savings Group Update',          body: 'Monthly Ajo Pool has reached 65% of its monthly target.',            time: '8h ago',  read: false, color: '#2EAF6F', icon: TrendingUp,category: 'today' },
  { id: 'n7', title: 'Contribution Recorded',         body: 'Your contribution to UK Deposit Fund was recorded successfully.',    time: '10h ago', read: false, color: '#2EAF6F', icon: CheckCircle,category:'today' },
  // Community
  { id: 'n8', title: 'Savings Group Announcement',    body: 'Lagos Savers Circle: Monthly meeting scheduled for June 25.',        time: '1d ago',  read: true,  color: '#2EAF6F', icon: Bell,     category: 'community', action: 'View group', actionLink: '/savings-groups' },
  { id: 'n9', title: 'New Group Opening',             body: 'A new savings group is opening for applications next week.',         time: '2d ago',  read: true,  color: '#8B5CF6', icon: Star,     category: 'community', action: 'Browse groups', actionLink: '/savings-groups' },
  { id: 'n10',title: 'Group Milestone',               body: 'Monthly Ajo Pool has completed 100 contributions!',                  time: '3d ago',  read: true,  color: '#8B5CF6', icon: Users,    category: 'community' },
  // Achievements
  { id: 'n11',title: 'New Achievement Available',     body: 'Complete 12 consecutive contributions to earn "Consistent Saver".',  time: '2d ago',  read: true,  color: '#F59E0B', icon: Award,    category: 'achievements', action: 'View Trust Score™', actionLink: '/trust' },
  { id: 'n12',title: 'Trust Tier Upgrade',            body: 'You\'re 53 points away from reaching the "Leader" Trust Tier.',     time: '4d ago',  read: true,  color: '#2EAF6F', icon: Shield,   category: 'achievements', action: 'View Trust Score™', actionLink: '/trust' },
  // Reminders
  { id: 'n13',title: 'Complete Your Profile',         body: 'Add a profile photo to increase your Trust Score™ by 15 points.',   time: '3d ago',  read: true,  color: '#2EAF6F', icon: CheckCircle,category:'reminders', action: 'Update profile', actionLink: '/profile/edit' },
  { id: 'n14',title: 'Subscription Renewal',          body: 'Your PadiHub membership renews in 14 days.',                        time: '5d ago',  read: true,  color: '#F59E0B', icon: Calendar, category: 'reminders', action: 'Manage subscription', actionLink: '/subscription/manage' },
  // Governance (kept as category label, links to savings groups)
  { id: 'n15',title: 'Group Vote Result',             body: 'The "Community Event Fund" proposal was approved with 82% participation.', time: '1w ago', read: true, color: '#2EAF6F', icon: CheckCircle, category: 'governance' },
  { id: 'n16',title: 'Group Meeting Scheduled',       body: 'Monthly review session scheduled for July 2.',                      time: '1w ago',  read: true,  color: '#8B5CF6', icon: Calendar, category: 'governance' },
];

const tabs = ['All', 'Priority', 'Today', 'Community', 'Achievements', 'Reminders', 'Governance'];

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('All');
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [read, setRead] = useState<string[]>(allNotifications.filter(n => n.read).map(n => n.id));

  const visible = allNotifications.filter(n => {
    if (dismissed.includes(n.id)) return false;
    if (activeTab === 'All') return true;
    return n.category === activeTab.toLowerCase();
  });

  const unread = visible.filter(n => !read.includes(n.id)).length;

  const markAllRead = () => setRead(allNotifications.map(n => n.id));

  return (
    <DashboardLayout>
      <Helmet>
        <title>Activity Centre — PadiHub</title>
        <meta name="description" content="Stay on top of your community activity, contributions and achievements on PadiHub." />
        <link rel="canonical" href="https://padihub.com/notifications" />
              <meta property="og:title" content="Activity Centre — PadiHub" />
        <meta property="og:description" content="Stay on top of your community activity, contributions and achievements on PadiHub." />
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
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Activity Centre</h1>
              <p className="text-gray-500 text-sm mt-1">
                {unread > 0 ? `${unread} unread notification${unread > 1 ? 's' : ''}` : 'All caught up!'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {unread > 0 && (
                <button onClick={markAllRead}
                  className="px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold transition-all hover:bg-gray-100 whitespace-nowrap"
                  style={{ background: '#F3F4F6', color: '#6B7280' }}>
                  Mark all read
                </button>
              )}
              <Link to="/notifications/settings"
                className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:bg-gray-100 flex-shrink-0"
                style={{ background: '#F3F4F6' }}>
                <Settings size={16} style={{ color: '#6B7280' }} />
              </Link>
            </div>
          </MotionDiv>

          {/* KPIs */}
          <MotionDiv variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {kpis.map(k => (
              <div key={k.label} className="rounded-2xl p-3 sm:p-4 bg-white text-center"
                style={{ border: '1px solid #F3F4F6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <k.icon size={16} style={{ color: k.color, margin: '0 auto 6px' }} />
                <p className="text-xl font-black" style={{ color: k.color, fontFamily: 'Nunito, sans-serif' }}>{k.value}</p>
                <p className="text-xs text-gray-500 leading-tight">{k.label}</p>
              </div>
            ))}
          </MotionDiv>

          {/* Tabs */}
          <MotionDiv variants={fadeUp} className="flex gap-2 overflow-x-auto pb-1 mb-5">
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all flex-shrink-0"
                style={{ background: activeTab === tab ? '#2EAF6F' : '#F3F4F6', color: activeTab === tab ? '#fff' : '#6B7280' }}>
                {tab}
              </button>
            ))}
          </MotionDiv>

          {/* Notification list */}
          {visible.length === 0 ? (
            <MotionDiv variants={fadeUp} className="rounded-3xl p-12 text-center bg-white" style={{ border: '1px solid #F3F4F6' }}>
              <Bell size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="font-extrabold text-gray-400" style={{ fontFamily: 'Nunito, sans-serif' }}>No notifications here</p>
              <p className="text-sm text-gray-400">You're all caught up in this category.</p>
            </MotionDiv>
          ) : (
            <MotionDiv initial="hidden" animate="visible" variants={stagger} className="flex flex-col gap-3">
              {visible.map(n => {
                const isRead = read.includes(n.id);
                return (
                  <MotionDiv key={n.id} variants={fadeUp} layout
                    className="rounded-2xl p-4 bg-white flex items-start gap-3 relative"
                    style={{
                      border: isRead ? '1px solid #F3F4F6' : `1px solid ${n.color}20`,
                      background: isRead ? '#fff' : `${n.color}04`,
                      boxShadow: isRead ? '0 1px 4px rgba(0,0,0,0.04)' : `0 2px 12px ${n.color}10`,
                    }}>
                    {/* Unread dot */}
                    {!isRead && (
                      <div className="absolute top-4 right-4 w-2 h-2 rounded-full" style={{ background: n.color }} />
                    )}

                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${n.color}12` }}>
                      <n.icon size={16} style={{ color: n.color }} />
                    </div>

                    <div className="flex-1 min-w-0 pr-6">
                      <p className="font-bold text-gray-900 text-sm">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-400">{n.time}</span>
                        {n.action && n.actionLink && (
                          <Link to={n.actionLink} onClick={() => setRead(prev => [...prev, n.id])}
                            className="text-xs font-bold flex items-center gap-1 transition-colors"
                            style={{ color: n.color }}>
                            {n.action} <ArrowRight size={10} />
                          </Link>
                        )}
                        {!isRead && (
                          <button onClick={() => setRead(prev => [...prev, n.id])}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>

                    <button onClick={() => setDismissed(prev => [...prev, n.id])}
                      className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity group-hover:opacity-100"
                      style={{ background: '#F3F4F6' }}>
                      <X size={10} style={{ color: '#9CA3AF' }} />
                    </button>
                  </MotionDiv>
                );
              })}
            </MotionDiv>
          )}

          {/* Four pillars */}
          <MotionDiv variants={fadeUp} className="flex flex-wrap justify-center gap-3 mt-8">
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
