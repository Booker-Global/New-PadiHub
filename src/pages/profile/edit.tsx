import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Camera, CheckCircle, User,
  Globe, Bell, Shield, Star, Sparkles
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const steps = [
  { id: 1, title: 'Profile Photo',   icon: Camera,   color: '#2EAF6F' },
  { id: 2, title: 'Personal Info',   icon: User,     color: '#8B5CF6' },
  { id: 3, title: 'Bio & Interests', icon: Star,     color: '#F59E0B' },
  { id: 4, title: 'Location',        icon: Globe,    color: '#2eafaf' },
  { id: 5, title: 'Notifications',   icon: Bell,     color: '#F59E0B' },
  { id: 6, title: 'Privacy',         icon: Shield,   color: '#EF4444' },
  { id: 7, title: 'Review',          icon: Sparkles, color: '#2EAF6F' },
];

const interests = [
  'Savings', 'Property', 'Entrepreneurship', 'Diaspora', 'Community Building',
  'Investment', 'Family Finance', 'Faith', 'Education', 'Technology',
  'Health & Wellness', 'Travel', 'Food & Culture', 'Sports', 'Arts',
];

const countries = ['United Kingdom', 'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Canada', 'USA', 'Other'];

const notifItems = [
  { label: 'Contribution reminders',  desc: 'Before your contributions are due',     defaultOn: true },
  { label: 'Community updates',        desc: 'Activity in your communities',          defaultOn: true },
  { label: 'Governance votes',         desc: 'New proposals and vote reminders',      defaultOn: true },
  { label: 'Achievement alerts',       desc: 'When you earn badges and milestones',   defaultOn: true },
  { label: 'Trust Score™ changes',     desc: 'When your Trust Score™ updates',        defaultOn: true },
  { label: 'Marketing & promotions',   desc: 'PadiHub news and feature updates',      defaultOn: false },
];

function NotifPrefsStep() {
  const [ons, setOns] = useState(notifItems.map(i => i.defaultOn));
  return (
    <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
      <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Notification Preferences</h2>
      <p className="text-sm text-gray-500 mb-5">Choose what matters most to you.</p>
      <div className="flex flex-col gap-3">
        {notifItems.map((item, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
            <div>
              <p className="text-sm font-bold text-gray-900">{item.label}</p>
              <p className="text-xs text-gray-400">{item.desc}</p>
            </div>
            <button onClick={() => setOns(prev => prev.map((v, idx) => idx === i ? !v : v))}
              className="relative w-10 h-5 rounded-full transition-all flex-shrink-0"
              style={{ background: ons[i] ? '#2EAF6F' : '#D1D5DB' }}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                style={{ left: ons[i] ? '22px' : '2px' }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const privacyItems = [
  { label: 'Public Passport™',      desc: 'Anyone can view your Passport™ via link', defaultOn: true },
  { label: 'Show communities',       desc: 'Display your communities publicly',        defaultOn: true },
  { label: 'Show achievements',      desc: 'Display your achievements publicly',       defaultOn: true },
  { label: 'Show Trust Score™',      desc: 'Display your Trust Score™ publicly',       defaultOn: true },
  { label: 'Show activity',          desc: 'Show your activity timeline publicly',     defaultOn: false },
  { label: 'Discoverable in search', desc: 'Allow members to find you via search',     defaultOn: true },
];

function PrivacyStep() {
  const [ons, setOns] = useState(privacyItems.map(i => i.defaultOn));
  return (
    <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
      <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Privacy Settings</h2>
      <p className="text-sm text-gray-500 mb-5">Control who can see your profile and activity.</p>
      <div className="flex flex-col gap-3">
        {privacyItems.map((item, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
            <div>
              <p className="text-sm font-bold text-gray-900">{item.label}</p>
              <p className="text-xs text-gray-400">{item.desc}</p>
            </div>
            <button onClick={() => setOns(prev => prev.map((v, idx) => idx === i ? !v : v))}
              className="relative w-10 h-5 rounded-full transition-all flex-shrink-0"
              style={{ background: ons[i] ? '#2EAF6F' : '#D1D5DB' }}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                style={{ left: ons[i] ? '22px' : '2px' }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EditProfilePage() {
  const [step, setStep] = useState(1);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(['Savings', 'Property', 'Entrepreneurship', 'Diaspora', 'Community Building']);
  const [country, setCountry] = useState('United Kingdom');
  const [displayName, setDisplayName] = useState('Amara Okonkwo');
  const [username, setUsername] = useState('amara.okonkwo');
  const [bio, setBio] = useState('Community builder and diaspora entrepreneur passionate about collective savings and financial empowerment. Based in London, connected to Lagos.');
  const [completed, setCompleted] = useState(false);

  const toggleInterest = (i: string) => {
    setSelectedInterests(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    );
  };

  const handleNext = () => {
    if (step < steps.length) setStep(s => s + 1);
    else setCompleted(true);
  };

  if (completed) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-lg mx-auto flex flex-col items-center justify-center min-h-96">
          <MotionDiv initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 40px rgba(46,175,111,0.4)' }}>
            <CheckCircle size={36} color="#fff" />
          </MotionDiv>
          <h2 className="text-2xl font-extrabold text-gray-900 text-center mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Profile Updated!</h2>
          <p className="text-gray-500 text-center mb-6">Your profile has been saved and your Passport™ has been updated.</p>
          <div className="flex gap-3 w-full max-w-xs">
            <Link to="/profile" className="flex-1 py-3.5 rounded-2xl font-bold text-white text-center transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
              View Profile
            </Link>
            <Link to="/profile" className="flex-1 py-3.5 rounded-2xl font-bold text-center hover:bg-gray-50 transition-colors"
              style={{ border: '1px solid #E5E7EB', color: '#6B7280' }}>
              View Passport™
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Edit Profile — PadiHub</title>
        <meta name="description" content="Update your PadiHub profile information." />
        <link rel="canonical" href="https://padihub.com/profile/edit" />
              <meta property="og:title" content="Edit Profile — PadiHub" />
        <meta property="og:description" content="Update your PadiHub profile information." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-xl mx-auto">
        {/* Back */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/profile" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft size={16} /> Back
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Edit Profile</h1>
            <p className="text-gray-500 text-sm">Step {step} of {steps.length}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 mb-6">
          {steps.map(s => (
            <div key={s.id} className="flex-1 h-1.5 rounded-full transition-all"
              style={{ background: s.id <= step ? '#2EAF6F' : '#E5E7EB' }} />
          ))}
        </div>

        {/* Step indicators */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
          {steps.map(s => (
            <button key={s.id} onClick={() => setStep(s.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0 transition-all"
              style={{
                background: s.id === step ? `${s.color}12` : '#F3F4F6',
                border: s.id === step ? `1.5px solid ${s.color}` : '1.5px solid transparent',
                color: s.id === step ? s.color : s.id < step ? '#2EAF6F' : '#9CA3AF',
              }}>
              {s.id < step ? <CheckCircle size={11} style={{ color: '#2EAF6F' }} /> : <s.icon size={11} />}
              {s.title}
            </button>
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <MotionDiv key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}>

            {step === 1 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Profile Photo</h2>
                <p className="text-sm text-gray-500 mb-6">A profile photo helps community members recognise you and increases your Trust Score™ by 15 points.</p>
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-2xl flex items-center justify-center font-black text-4xl text-white"
                      style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 30px rgba(46,175,111,0.3)' }}>
                      A
                    </div>
                    <button className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: '#2EAF6F', border: '2px solid #fff' }}>
                      <Camera size={14} color="#fff" />
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button className="px-5 py-2.5 rounded-2xl font-bold text-white text-sm transition-all hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                      Upload Photo
                    </button>
                    <button className="px-5 py-2.5 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-colors"
                      style={{ background: '#F3F4F6', color: '#6B7280' }}>
                      Remove
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">JPG, PNG or GIF · Max 5MB</p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Personal Information</h2>
                <p className="text-sm text-gray-500 mb-5">This information appears on your public Passport™.</p>
                <div className="flex flex-col gap-4">
                  {[
                    { label: 'Display Name', value: displayName, onChange: setDisplayName, placeholder: 'Your full name' },
                    { label: 'Username',     value: username,    onChange: setUsername,    placeholder: 'your.username' },
                  ].map((field, i) => (
                    <div key={i}>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">{field.label}</label>
                      <input type="text" value={field.value} onChange={e => field.onChange(e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-4 py-3 rounded-2xl text-sm font-semibold text-gray-900 outline-none transition-all"
                        style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                        onFocus={e => e.target.style.borderColor = '#2EAF6F'}
                        onBlur={e => e.target.style.borderColor = '#E5E7EB'} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Bio & Interests</h2>
                <p className="text-sm text-gray-500 mb-5">Tell your community about yourself.</p>
                <div className="mb-5">
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Bio</label>
                  <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4}
                    placeholder="Tell your community about yourself…"
                    className="w-full px-4 py-3 rounded-2xl text-sm font-semibold text-gray-900 outline-none transition-all resize-none"
                    style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                    onFocus={e => e.target.style.borderColor = '#2EAF6F'}
                    onBlur={e => e.target.style.borderColor = '#E5E7EB'} />
                  <p className="text-xs text-gray-400 mt-1">{bio.length}/300 characters</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">Interests ({selectedInterests.length} selected)</label>
                  <div className="flex flex-wrap gap-2">
                    {interests.map(interest => (
                      <button key={interest} onClick={() => toggleInterest(interest)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                        style={{
                          background: selectedInterests.includes(interest) ? 'rgba(46,175,111,0.12)' : '#F3F4F6',
                          border: selectedInterests.includes(interest) ? '1.5px solid #2EAF6F' : '1.5px solid transparent',
                          color: selectedInterests.includes(interest) ? '#2EAF6F' : '#6B7280',
                        }}>
                        {selectedInterests.includes(interest) && '✓ '}{interest}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Location</h2>
                <p className="text-sm text-gray-500 mb-5">Your location helps us show relevant communities and pricing.</p>
                <div className="flex flex-col gap-3">
                  {countries.map(c => (
                    <button key={c} onClick={() => setCountry(c)}
                      className="flex items-center justify-between p-4 rounded-2xl text-left transition-all"
                      style={{
                        background: country === c ? 'rgba(46,175,111,0.06)' : '#F9FAFB',
                        border: country === c ? '2px solid #2EAF6F' : '2px solid transparent',
                      }}>
                      <span className="text-sm font-semibold text-gray-700">{c}</span>
                      {country === c && <CheckCircle size={16} style={{ color: '#2EAF6F' }} />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 5 && <NotifPrefsStep />}

            {step === 6 && <PrivacyStep />}

            {step === 7 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Review Your Profile</h2>
                <p className="text-sm text-gray-500 mb-5">Everything looks good? Save your changes.</p>
                <div className="flex flex-col gap-3">
                  {[
                    { label: 'Display Name', value: displayName,                                    color: '#2EAF6F' },
                    { label: 'Username',     value: `@${username}`,                                 color: '#8B5CF6' },
                    { label: 'Interests',    value: `${selectedInterests.length} selected`,         color: '#F59E0B' },
                    { label: 'Location',     value: country,                                        color: '#2eafaf' },
                    { label: 'Notifications',value: 'Configured',                                   color: '#2EAF6F' },
                    { label: 'Privacy',      value: 'Public Passport™ enabled',                     color: '#8B5CF6' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                      <p className="text-sm font-bold text-gray-700">{item.label}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: item.color }}>{item.value}</span>
                        <CheckCircle size={14} style={{ color: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </MotionDiv>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex gap-3 mt-5">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              style={{ border: '1px solid #E5E7EB' }}>
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <button onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 16px rgba(46,175,111,0.3)' }}>
            {step === steps.length ? 'Save Profile' : 'Continue'}
            {step < steps.length && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
