import { Helmet } from '@dr.pogodin/react-helmet';
import { useState } from 'react';
import { MotionDiv } from '@/lib/motion-safe';
import {
  Bell, Shield, Globe, Moon, Smartphone, Lock, Eye, EyeOff,
  ChevronRight, Check, Trash2, Download, LogOut
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SuccessToast, useSuccessToast } from '@/components/ui/success-toast';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
      style={{ background: value ? '#2EAF6F' : '#D1D5DB' }}
    >
      <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: value ? 'translateX(20px)' : 'translateX(0)' }} />
    </button>
  );
}

function SettingRow({ icon: Icon, label, description, children, color = '#2EAF6F' }: {
  icon: typeof Bell; label: string; description?: string; children: React.ReactNode; color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}12` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">{label}</p>
          {description && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [notifs, setNotifs] = useState({ contributions: true, groupActivity: true, invitations: true, voting: false, email: true, sms: false });
  const [privacy, setPrivacy] = useState({ showTrust: true, publicProfile: true, dataPreferences: false });
  const [darkMode, setDarkMode] = useState(false);
  const [twoFA, setTwoFA] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const { toastState, show: showToast, hide: hideToast } = useSuccessToast();

  const handleSave = () => showToast('Settings saved', 'Your preferences have been updated.', 'default');

  return (
    <DashboardLayout>
      <Helmet>
        <title>Settings — PadiHub</title>
        <meta name="description" content="Manage your PadiHub notification preferences, privacy settings, security and account options." />
        <link rel="canonical" href="https://padihub.com/settings" />
              <meta property="og:title" content="Settings — PadiHub" />
        <meta property="og:description" content="Manage your PadiHub notification preferences, privacy settings, security and account options." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          <MotionDiv variants={fadeUp} className="mb-8">
            <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Settings</h1>
            <p className="text-gray-500 text-sm mt-1">Manage your preferences, privacy and security</p>
          </MotionDiv>

          {/* Notifications */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-4" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h2 className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Notifications</h2>
            <p className="text-xs text-gray-400 mb-4">Choose what you want to be notified about</p>
            <SettingRow icon={Bell} label="Contribution reminders" description="Get reminded before contributions are due" color="#2EAF6F">
              <Toggle value={notifs.contributions} onChange={v => setNotifs(n => ({ ...n, contributions: v }))} />
            </SettingRow>
            <SettingRow icon={Bell} label="Group activity" description="New members, payments and group updates" color="#2eafaf">
              <Toggle value={notifs.groupActivity} onChange={v => setNotifs(n => ({ ...n, groupActivity: v }))} />
            </SettingRow>
            <SettingRow icon={Bell} label="Invitations" description="When you're invited to join a group" color="#8B5CF6">
              <Toggle value={notifs.invitations} onChange={v => setNotifs(n => ({ ...n, invitations: v }))} />
            </SettingRow>
            <SettingRow icon={Bell} label="Voting & governance" description="New votes and voting deadlines" color="#F59E0B">
              <Toggle value={notifs.voting} onChange={v => setNotifs(n => ({ ...n, voting: v }))} />
            </SettingRow>
            <SettingRow icon={Bell} label="Email notifications" description="Receive reminders and updates by email" color="#EF4444">
              <Toggle value={notifs.email} onChange={v => setNotifs(n => ({ ...n, email: v }))} />
            </SettingRow>
            <SettingRow icon={Smartphone} label="SMS notifications" description="Critical alerts via text message (coming soon)" color="#6B7280">
              <Toggle value={notifs.sms} onChange={v => setNotifs(n => ({ ...n, sms: v }))} />
            </SettingRow>
          </MotionDiv>

          {/* Privacy */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-4" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h2 className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Privacy</h2>
            <p className="text-xs text-gray-400 mb-4">Control what others can see about you</p>
            <SettingRow icon={Eye} label="Show Trust Score™" description="Visible to other group members" color="#2EAF6F">
              <Toggle value={privacy.showTrust} onChange={v => setPrivacy(p => ({ ...p, showTrust: v }))} />
            </SettingRow>
            <SettingRow icon={EyeOff} label="Public profile" description="Allow others to find your profile" color="#8B5CF6">
              <Toggle value={privacy.publicProfile} onChange={v => setPrivacy(p => ({ ...p, publicProfile: v }))} />
            </SettingRow>
            <SettingRow icon={Globe} label="Data preferences" description="Manage how your data is used" color="#2eafaf">
              <Toggle value={privacy.dataPreferences} onChange={v => setPrivacy(p => ({ ...p, dataPreferences: v }))} />
            </SettingRow>
          </MotionDiv>

          {/* Appearance */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-4" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h2 className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Appearance</h2>
            <p className="text-xs text-gray-400 mb-4">Personalise your PadiHub experience</p>
            <SettingRow icon={Moon} label="Dark mode" description="Switch to a darker interface" color="#1A1A2E">
              <Toggle value={darkMode} onChange={setDarkMode} />
            </SettingRow>
            <SettingRow icon={Globe} label="Language" description="English (UK)" color="#2eafaf">
              <button className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors">
                Change <ChevronRight size={14} />
              </button>
            </SettingRow>
          </MotionDiv>

          {/* Security */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-4" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h2 className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Security</h2>
            <p className="text-xs text-gray-400 mb-4">Keep your account safe</p>
            <SettingRow icon={Lock} label="Two-factor authentication" description="Add an extra layer of security" color="#2EAF6F">
              <Toggle value={twoFA} onChange={setTwoFA} />
            </SettingRow>
            <SettingRow icon={Shield} label="Change password" color="#8B5CF6">
              <button className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors">
                Update <ChevronRight size={14} />
              </button>
            </SettingRow>
            <SettingRow icon={Smartphone} label="Active sessions" description="2 devices" color="#2eafaf">
              <button className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors">
                Manage <ChevronRight size={14} />
              </button>
            </SettingRow>
          </MotionDiv>

          {/* Account */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-6" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h2 className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Account</h2>
            <p className="text-xs text-gray-400 mb-4">Manage your account data</p>
            <SettingRow icon={Download} label="Export my data" description="Download a copy of all your PadiHub data" color="#2eafaf">
              <button className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors">
                Export <ChevronRight size={14} />
              </button>
            </SettingRow>
            <SettingRow icon={LogOut} label="Sign out" description="Sign out of this device" color="#6B7280">
              <button onClick={() => setShowLogoutDialog(true)} className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors">
                Sign out <ChevronRight size={14} />
              </button>
            </SettingRow>
            <SettingRow icon={Trash2} label="Delete account" description="Permanently delete your account and all data" color="#EF4444">
              <button onClick={() => setShowDeleteDialog(true)} className="text-sm font-semibold text-red-500 hover:text-red-700 transition-colors">
                Delete
              </button>
            </SettingRow>
          </MotionDiv>

          {/* Save */}
          <MotionDiv variants={fadeUp}>
            <button onClick={handleSave}
              className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-98"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}>
              <Check size={18} /> Save all settings
            </button>
          </MotionDiv>

        </MotionDiv>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete your account?"
        description="This will permanently delete your account, Trust Score™ and all group data. This cannot be undone."
        confirmLabel="Yes, delete"
        cancelLabel="Keep my account"
        variant="danger"
        onConfirm={() => setShowDeleteDialog(false)}
        onCancel={() => setShowDeleteDialog(false)}
      />

      <ConfirmDialog
        open={showLogoutDialog}
        title="Sign out?"
        description="You'll need to sign back in to access your communities and savings groups."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={() => setShowLogoutDialog(false)}
        onCancel={() => setShowLogoutDialog(false)}
      />

      <SuccessToast {...toastState} onClose={hideToast} />
    </DashboardLayout>
  );
}
