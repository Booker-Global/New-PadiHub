import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { MotionDiv } from '@/lib/motion-safe';
import {
  ArrowRight, ArrowLeft, CheckCircle, Globe, Shield, Award,
  Camera, Bell, Smartphone, Mail, Check, Star, Zap, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Step config ─────────────────────────────────────────────────────────────

const STEPS = [
  'Welcome',
  'Country',
  'Subscription',
  'Photo',
  'Profile',
  'Interests',
  'Notifications',
  'Success',
];

// ─── Data ─────────────────────────────────────────────────────────────────────

const countryCards = [
  {
    key: 'UK',
    flag: '🇬🇧',
    name: 'United Kingdom',
    desc: 'Join UK-based communities and save in GBP',
    color: '#2EAF6F',
  },
  {
    key: 'NG',
    flag: '🇳🇬',
    name: 'Nigeria',
    desc: 'Join Nigerian communities and save in Naira',
    color: '#F59E0B',
  },
];

const plans = {
  UK: [
    {
      key: 'UK_MONTHLY',
      label: 'Monthly',
      price: '£4.99',
      period: '/month',
      saving: null,
      recommended: false,
      features: ['All communities', 'Marketplace access', 'Trust Score™', 'Community Karma™', 'Passport™', 'Analytics'],
    },
    {
      key: 'UK_ANNUAL',
      label: 'Annual',
      price: '£49.99',
      period: '/year',
      saving: 'Save £9.89 (17%)',
      recommended: true,
      features: ['All communities', 'Marketplace access', 'Trust Score™', 'Community Karma™', 'Passport™', 'Analytics'],
    },
  ],
  NG: [
    {
      key: 'NG_MONTHLY',
      label: 'Monthly',
      price: '₦3,500',
      period: '/month',
      saving: null,
      recommended: false,
      features: ['All communities', 'Marketplace access', 'Trust Score™', 'Community Karma™', 'Passport™', 'Analytics'],
    },
    {
      key: 'NG_ANNUAL',
      label: 'Annual',
      price: '₦35,000',
      period: '/year',
      saving: 'Save ₦7,000 (17%)',
      recommended: true,
      features: ['All communities', 'Marketplace access', 'Trust Score™', 'Community Karma™', 'Passport™', 'Analytics'],
    },
  ],
};

const interestOptions = [
  { label: 'Home Ownership',       icon: '🏠' },
  { label: 'Travel & Holidays',    icon: '✈️' },
  { label: 'Education',            icon: '📚' },
  { label: 'Business',             icon: '💼' },
  { label: 'Family Goals',         icon: '👨‍👩‍👧' },
  { label: "Children's Future",    icon: '🎓' },
  { label: 'Community Impact',     icon: '🌍' },
  { label: 'Health & Wellness',    icon: '🏥' },
  { label: 'Vehicle Purchase',     icon: '🚗' },
  { label: 'Emergency Fund',       icon: '💡' },
  { label: 'Events & Celebrations',icon: '🎉' },
  { label: 'Sustainable Living',   icon: '🌱' },
  { label: 'Faith Community',      icon: '🕊️' },
  { label: 'Professional Network', icon: '🤝' },
  { label: 'Diaspora Connection',  icon: '🌐' },
  { label: 'Social Club',          icon: '🎭' },
];

const communityTypes = ['Professional', 'Faith', 'Family', 'Social', 'Education', 'Business', 'Diaspora', 'Neighbourhood'];

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = ((step) / (total - 1)) * 100;
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <MotionDiv
        className="h-full rounded-full"
        style={{ background: 'linear-gradient(90deg, #2EAF6F, #F59E0B)' }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  );
}

// ─── Auth layout wrapper (inline, no import needed) ───────────────────────────

function OnboardingShell({ children, step, totalSteps }: { children: React.ReactNode; step: number; totalSteps: number }) {
  return (
    <div className="min-h-screen flex" style={{ background: '#F9FAFB' }}>
      {/* Left panel — desktop only */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-15" style={{ background: '#2EAF6F' }} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full blur-3xl opacity-10" style={{ background: '#F59E0B' }} />
        <div className="relative">
          <img src="/airo-assets/images/logo/horizontal" alt="PadiHub" className="r-logo" />
        </div>
        <div className="relative">
          <div className="flex flex-col gap-6 mb-12">
            {[
              { icon: Shield, label: 'Trust Score™', desc: 'Build your community reputation', color: '#2EAF6F' },
              { icon: Award,  label: 'Community Karma™', desc: 'Earn recognition for positive participation', color: '#F59E0B' },
              { icon: Globe,  label: 'PadiHub Passport™', desc: 'Your portable digital community identity', color: '#2eafaf' },
              { icon: Users,  label: 'Savings Groups', desc: 'Save together, grow together', color: '#8B5CF6' },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${f.color}20`, border: `1px solid ${f.color}30` }}>
                  <f.icon size={20} style={{ color: f.color }} />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{f.label}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <blockquote className="border-l-2 pl-4" style={{ borderColor: '#2EAF6F' }}>
            <p className="text-gray-300 text-sm italic leading-relaxed">
              "PadiHub transformed how our community saves together. The Trust Score™ keeps everyone accountable."
            </p>
            <footer className="mt-2 text-xs font-semibold" style={{ color: '#2EAF6F' }}>— Amara O., Lagos Savers Circle</footer>
          </blockquote>
        </div>
        <p className="text-xs relative" style={{ color: 'rgba(255,255,255,0.3)' }}>
          © 2026 PadiHub · Trust · Transparency · Community · Progress
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center justify-center pt-8 pb-4">
          <img src="/airo-assets/images/logo/horizontal" alt="PadiHub" className="r-logo" />
        </div>

        {/* Progress */}
        <div className="px-6 lg:px-12 pt-6 lg:pt-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Step {step} of {totalSteps - 1}
            </span>
            <span className="text-xs font-bold" style={{ color: '#2EAF6F' }}>
              {Math.round(((step - 1) / (totalSteps - 2)) * 100)}% complete
            </span>
          </div>
          <ProgressBar step={step - 1} total={totalSteps - 1} />
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-center px-6 lg:px-12 py-8 max-w-lg w-full mx-auto lg:mx-0">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const slideVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -30, transition: { duration: 0.2, ease: 'easeIn' as const } },
};

export default function OnboardingPage() {
  const [step, setStep]                           = useState(0);
  const [country, setCountry]                     = useState<'UK' | 'NG' | ''>('');
  const [selectedPlan, setSelectedPlan]           = useState('');
  const [photoPreview, setPhotoPreview]           = useState<string | null>(null);
  const [profile, setProfile]                     = useState({ displayName: '', bio: '', location: '' });
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes]         = useState<string[]>([]);
  const [notifs, setNotifs]                       = useState({ email: true, push: true, sms: false });
  const fileRef                                   = useRef<HTMLInputElement>(null);

  const totalSteps = STEPS.length;
  const next = () => setStep(s => Math.min(s + 1, totalSteps - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  const toggleInterest = (label: string) =>
    setSelectedInterests(p => p.includes(label) ? p.filter(x => x !== label) : [...p, label]);
  const toggleType = (t: string) =>
    setSelectedTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const currentPlans = country ? plans[country] : plans.UK;

  return (
    <>
      <Helmet>
        <title>Set up your account — PadiHub</title>
        <meta name="description" content="Complete your PadiHub profile and start your community savings journey." />
        <link rel="canonical" href="https://padihub.com/onboarding" />
              <meta property="og:title" content="Set up your account — PadiHub" />
        <meta property="og:description" content="Complete your PadiHub profile and start your community savings journey." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>
      <h1 className="sr-only">Set up your PadiHub account</h1>

      <OnboardingShell step={step + 1} totalSteps={totalSteps}>
        <AnimatePresence mode="wait">
          <MotionDiv key={step} variants={slideVariants} initial="enter" animate="center" exit="exit">

            {/* ── Step 0: Welcome ── */}
            {step === 0 && (
              <div>
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
                  style={{ background: 'linear-gradient(135deg, rgba(46,175,111,0.15), rgba(245,158,11,0.15))', border: '1px solid rgba(46,175,111,0.2)' }}>
                  <span className="text-4xl">🚀</span>
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Welcome to PadiHub™
                </h2>
                <p className="text-gray-500 text-center mb-8 leading-relaxed">
                  You're about to join a trusted community platform built for transparency, collaboration and growth.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[
                    { icon: Shield, title: 'Trust Score™',    desc: 'Build your reputation',       color: '#2EAF6F' },
                    { icon: Award,  title: 'Karma™',          desc: 'Earn recognition',             color: '#F59E0B' },
                    { icon: Globe,  title: 'Passport™',       desc: 'Your digital identity',        color: '#2eafaf' },
                    { icon: Zap,    title: 'Savings Groups',  desc: 'Save together',                color: '#8B5CF6' },
                  ].map(f => (
                    <div key={f.title} className="rounded-2xl p-4 text-left" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: `${f.color}15` }}>
                        <f.icon size={17} style={{ color: f.color }} />
                      </div>
                      <p className="font-bold text-sm text-gray-900">{f.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                    </div>
                  ))}
                </div>

                <Button onClick={next} className="w-full rounded-2xl py-4 font-bold text-base gap-2"
                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}>
                  Let's get started <ArrowRight size={18} />
                </Button>
                <p className="text-center text-xs text-gray-400 mt-4">Takes about 3 minutes · Cancel anytime</p>
              </div>
            )}

            {/* ── Step 1: Country ── */}
            {step === 1 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Where are you joining from? 🌍
                </h2>
                <p className="text-gray-500 text-sm mb-8">We'll show you the right pricing and communities for your location.</p>

                <div className="flex flex-col gap-4 mb-8">
                  {countryCards.map(c => (
                    <button key={c.key} onClick={() => setCountry(c.key as 'UK' | 'NG')}
                      className="flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all"
                      style={{
                        borderColor: country === c.key ? c.color : '#E5E7EB',
                        background: country === c.key ? `${c.color}06` : '#fff',
                      }}>
                      <span className="text-4xl flex-shrink-0">{c.flag}</span>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{c.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{c.desc}</p>
                      </div>
                      <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: country === c.key ? c.color : '#D1D5DB', background: country === c.key ? c.color : 'transparent' }}>
                        {country === c.key && <Check size={13} className="text-white" />}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prev} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button onClick={next} disabled={!country} className="flex-1 rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                    Continue <ArrowRight size={18} />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 2: Subscription ── */}
            {step === 2 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Choose your membership 💳
                </h2>
                <p className="text-gray-500 text-sm mb-6">Start free for 30 days. Cancel anytime.</p>

                <div className="flex flex-col gap-4 mb-8">
                  {currentPlans.map(plan => (
                    <button key={plan.key} onClick={() => setSelectedPlan(plan.key)}
                      className="relative p-5 rounded-2xl border-2 text-left transition-all"
                      style={{
                        borderColor: selectedPlan === plan.key ? '#2EAF6F' : '#E5E7EB',
                        background: selectedPlan === plan.key ? 'rgba(46,175,111,0.04)' : '#fff',
                      }}>
                      {plan.recommended && (
                        <span className="absolute -top-3 left-5 px-3 py-1 rounded-full text-xs font-bold text-white"
                          style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                          ⭐ Recommended
                        </span>
                      )}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-gray-900">{plan.label}</p>
                          {plan.saving && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block"
                              style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F' }}>
                              {plan.saving}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black" style={{ color: '#2EAF6F', fontFamily: 'Nunito, sans-serif' }}>{plan.price}</span>
                          <span className="text-gray-400 text-sm">{plan.period}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {plan.features.map(f => (
                          <div key={f} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <CheckCircle size={11} style={{ color: '#2EAF6F', flexShrink: 0 }} /> {f}
                          </div>
                        ))}
                      </div>
                      {selectedPlan === plan.key && (
                        <div className="absolute top-4 right-4">
                          <CheckCircle size={20} style={{ color: '#2EAF6F' }} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prev} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button onClick={next} disabled={!selectedPlan} className="flex-1 rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                    Start free trial <ArrowRight size={18} />
                  </Button>
                </div>
                <p className="text-center text-xs text-gray-400 mt-3">No card required for trial · Cancel anytime</p>
              </div>
            )}

            {/* ── Step 3: Photo ── */}
            {step === 3 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Add a profile photo 📸
                </h2>
                <p className="text-gray-500 text-sm mb-8">Help your community recognise you. You can always change this later.</p>

                <div className="flex flex-col items-center mb-8">
                  <div className="relative mb-4">
                    <div className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center"
                      style={{ background: photoPreview ? 'transparent' : 'linear-gradient(135deg, #2EAF6F, #F59E0B)' }}>
                      {photoPreview
                        ? <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                        : <span className="text-5xl text-white">👤</span>
                      }
                    </div>
                    <button onClick={() => fileRef.current?.click()}
                      className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
                      style={{ background: '#2EAF6F' }}>
                      <Camera size={15} className="text-white" />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                  </div>
                  <button onClick={() => fileRef.current?.click()}
                    className="text-sm font-bold hover:underline" style={{ color: '#2EAF6F' }}>
                    Upload photo
                  </button>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prev} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button variant="outline" onClick={next} className="flex-1 rounded-2xl py-4 font-semibold border-gray-200 text-gray-600">
                    Skip for now
                  </Button>
                  {photoPreview && (
                    <Button onClick={next} className="flex-1 rounded-2xl py-4 font-bold gap-2"
                      style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                      Continue <ArrowRight size={18} />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 4: Profile ── */}
            {step === 4 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Tell us about yourself ✨
                </h2>
                <p className="text-gray-500 text-sm mb-6">This appears on your PadiHub Passport™ and community profile.</p>

                <div className="flex flex-col gap-4 mb-8">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Display name <span className="text-red-400">*</span>
                    </label>
                    <input type="text" value={profile.displayName}
                      onChange={e => setProfile(p => ({ ...p, displayName: e.target.value }))}
                      placeholder="How should the community know you?"
                      className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 transition-all"
                      style={{ '--tw-ring-color': '#2EAF6F' } as React.CSSProperties} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Location <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input type="text" value={profile.location}
                      onChange={e => setProfile(p => ({ ...p, location: e.target.value }))}
                      placeholder="e.g. London, UK or Lagos, Nigeria"
                      className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 transition-all"
                      style={{ '--tw-ring-color': '#2EAF6F' } as React.CSSProperties} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Short bio <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea value={profile.bio}
                      onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                      placeholder="Tell your community a little about yourself..."
                      rows={3}
                      maxLength={160}
                      className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 transition-all resize-none"
                      style={{ '--tw-ring-color': '#2EAF6F' } as React.CSSProperties} />
                    <p className="text-xs text-gray-400 text-right mt-1">{profile.bio.length}/160</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prev} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button onClick={next} disabled={!profile.displayName.trim()} className="flex-1 rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                    Continue <ArrowRight size={18} />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 5: Interests ── */}
            {step === 5 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  What are you saving for? 🎯
                </h2>
                <p className="text-gray-500 text-sm mb-6">Select all that apply — we'll match you with the right communities.</p>

                <div className="flex flex-wrap gap-2 mb-5">
                  {interestOptions.map(({ label, icon }) => {
                    const active = selectedInterests.includes(label);
                    return (
                      <button key={label} onClick={() => toggleInterest(label)}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold transition-all border-2"
                        style={{
                          borderColor: active ? '#2EAF6F' : '#E5E7EB',
                          background: active ? 'rgba(46,175,111,0.08)' : '#fff',
                          color: active ? '#2EAF6F' : '#374151',
                        }}>
                        <span>{icon}</span> {label}
                        {active && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-400 mb-4">Community types you're interested in:</p>
                <div className="flex flex-wrap gap-2 mb-8">
                  {communityTypes.map(t => {
                    const active = selectedTypes.includes(t);
                    return (
                      <button key={t} onClick={() => toggleType(t)}
                        className="px-3.5 py-2 rounded-full text-sm font-semibold transition-all border-2"
                        style={{
                          borderColor: active ? '#F59E0B' : '#E5E7EB',
                          background: active ? 'rgba(245,158,11,0.08)' : '#fff',
                          color: active ? '#F59E0B' : '#374151',
                        }}>
                        {t}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-400 mb-6">{selectedInterests.length} saving goals · {selectedTypes.length} community types selected</p>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prev} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button onClick={next} disabled={selectedInterests.length === 0} className="flex-1 rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                    Continue <ArrowRight size={18} />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 6: Notifications ── */}
            {step === 6 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Stay in the loop 🔔
                </h2>
                <p className="text-gray-500 text-sm mb-8">Choose how you'd like to receive updates from your communities.</p>

                <div className="flex flex-col gap-4 mb-8">
                  {[
                    { key: 'email' as const, icon: Mail,       label: 'Email notifications',  desc: 'Contribution reminders, governance updates, community news', color: '#2EAF6F' },
                    { key: 'push'  as const, icon: Bell,       label: 'Push notifications',   desc: 'Real-time alerts on your device', color: '#8B5CF6' },
                    { key: 'sms'   as const, icon: Smartphone, label: 'SMS notifications',    desc: 'Critical alerts via text message', color: '#F59E0B' },
                  ].map(n => (
                    <div key={n.key} className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${n.color}12` }}>
                        <n.icon size={18} style={{ color: n.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">{n.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{n.desc}</p>
                      </div>
                      <button
                        role="switch"
                        aria-checked={notifs[n.key]}
                        onClick={() => setNotifs(p => ({ ...p, [n.key]: !p[n.key] }))}
                        className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
                        style={{ background: notifs[n.key] ? '#2EAF6F' : '#D1D5DB' }}>
                        <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                          style={{ transform: notifs[n.key] ? 'translateX(20px)' : 'translateX(0)' }} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prev} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button onClick={next} className="flex-1 rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                    Complete setup <ArrowRight size={18} />
                  </Button>
                </div>
                <p className="text-center text-xs text-gray-400 mt-3">You can change these anytime in Settings</p>
              </div>
            )}

            {/* ── Step 7: Success ── */}
            {step === 7 && (
              <div className="text-center">
                {/* Celebration */}
                <MotionDiv
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6"
                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', boxShadow: '0 8px 40px rgba(46,175,111,0.4)' }}>
                  <span className="text-5xl">🎉</span>
                </MotionDiv>

                <h2 className="text-3xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Welcome to PadiHub™!
                </h2>
                <p className="text-gray-500 mb-8 leading-relaxed">
                  Your community journey starts today. Here's what's waiting for you:
                </p>

                {/* Preview cards */}
                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[
                    { icon: Shield, label: 'Trust Score™',    value: '0 / 1000',  color: '#2EAF6F', desc: 'Start building' },
                    { icon: Award,  label: 'Karma™',          value: '0 pts',     color: '#F59E0B', desc: 'Earn your first' },
                    { icon: Globe,  label: 'Passport™',       value: 'Active',    color: '#2eafaf', desc: 'Share it' },
                    { icon: Star,   label: 'Communities',     value: '0 joined',  color: '#8B5CF6', desc: 'Explore now' },
                  ].map(c => (
                    <div key={c.label} className="rounded-2xl p-4 text-left" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2" style={{ background: `${c.color}15` }}>
                        <c.icon size={15} style={{ color: c.color }} />
                      </div>
                      <p className="text-xs text-gray-500">{c.label}</p>
                      <p className="font-extrabold text-gray-900 text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>{c.value}</p>
                      <p className="text-xs mt-0.5 font-semibold" style={{ color: c.color }}>{c.desc}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  <Button asChild className="w-full rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}>
                    <Link to="/dashboard">Go to my dashboard <ArrowRight size={18} /></Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full rounded-2xl py-4 font-semibold border-gray-200">
                    <Link to="/savings-groups">Explore savings groups</Link>
                  </Button>
                </div>
              </div>
            )}

          </MotionDiv>
        </AnimatePresence>
      </OnboardingShell>
    </>
  );
}
