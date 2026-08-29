import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  ChevronLeft, CreditCard, CheckCircle, Shield, RefreshCw,
  XCircle, ArrowRight, Smartphone, Edit3
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const planFeatures = [
  'Unlimited Communities & Savings Groups',
  'Trust Score™',
  'PadiHub Passport™ & Community DNA™',
  'Analytics, Governance & Voting',
  'Priority Support & AI Onboarding',
];

export default function ManageMembershipPage() {
  const [editCard, setEditCard] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setEditCard(false);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Manage Membership — PadiHub</title>
        <meta name="description" content="Manage your PadiHub membership, update payment method and change your plan." />
        <link rel="canonical" href="https://padihub.com/subscription/manage" />
              <meta property="og:title" content="Manage Membership — PadiHub" />
        <meta property="og:description" content="Manage your PadiHub membership, update payment method and change your plan." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          {/* Header */}
          <MotionDiv variants={fadeUp} className="flex items-center gap-3 mb-6">
            <Link to="/subscription" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back
            </Link>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Manage Membership</h1>
              <p className="text-gray-500 text-sm">Update your plan, payment method and billing details</p>
            </div>
          </MotionDiv>

          {/* Success toast */}
          {saved && (
            <MotionDiv initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-2xl p-4 flex items-center gap-3"
              style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.2)' }}>
              <CheckCircle size={18} style={{ color: '#2EAF6F' }} />
              <p className="text-sm font-bold" style={{ color: '#2EAF6F' }}>Payment method updated successfully!</p>
            </MotionDiv>
          )}

          {/* Current plan */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: '#2EAF6F' }} />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full mb-2 inline-block"
                    style={{ background: 'rgba(46,175,111,0.2)', color: '#2EAF6F' }}>✓ Active</span>
                  <h2 className="text-xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>PadiHub UK Monthly</h2>
                  <p className="text-gray-400 text-sm">£4.99/month · Renews Jul 1, 2026</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>£4.99</p>
                  <p className="text-gray-400 text-xs">per month</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {planFeatures.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle size={12} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </MotionDiv>

          {/* Upgrade to annual */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 flex items-center justify-between"
            style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.2)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(46,175,111,0.15)' }}>
                <RefreshCw size={18} style={{ color: '#2EAF6F' }} />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">Switch to Annual — Save 17%</p>
                <p className="text-xs text-gray-500">£49.99/year instead of £59.88. Save £9.89.</p>
              </div>
            </div>
            <Link to="/subscription/renew?plan=uk-annual"
              className="flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-xl transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
              Switch <ArrowRight size={14} />
            </Link>
          </MotionDiv>

          {/* Payment method */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-5" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Payment method</h2>
              <button onClick={() => setEditCard(!editCard)}
                className="flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-xl transition-colors hover:bg-gray-50"
                style={{ color: '#2EAF6F', border: '1px solid rgba(46,175,111,0.2)' }}>
                <Edit3 size={13} /> {editCard ? 'Cancel' : 'Update'}
              </button>
            </div>

            {!editCard ? (
              <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: '#F9FAFB' }}>
                <div className="w-12 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1A1A2E' }}>
                  <CreditCard size={16} color="#fff" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">Visa ending in 4242</p>
                  <p className="text-xs text-gray-400">Expires 08/2028</p>
                </div>
                <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F' }}>
                  Default
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex gap-3 mb-2">
                  {[
                    { key: 'card',   label: 'Card',         icon: CreditCard },
                    { key: 'mobile', label: 'Mobile Money', icon: Smartphone },
                  ].map(m => (
                    <button key={m.key}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold"
                      style={{ background: m.key === 'card' ? 'rgba(46,175,111,0.08)' : '#F9FAFB', border: m.key === 'card' ? '2px solid #2EAF6F' : '2px solid #E5E7EB', color: m.key === 'card' ? '#2EAF6F' : '#6B7280' }}>
                      <m.icon size={15} /> {m.label}
                    </button>
                  ))}
                </div>
                <input className="w-full px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                  placeholder="Card number" />
                <div className="grid grid-cols-2 gap-4">
                  <input className="px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                    placeholder="MM / YY" />
                  <input className="px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                    placeholder="CVV" />
                </div>
                <input className="w-full px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                  placeholder="Name on card" />
                <button onClick={handleSave}
                  className="w-full py-3 rounded-2xl font-bold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                  Save payment method
                </button>
              </div>
            )}
          </MotionDiv>

          {/* Billing address */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-5" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Billing address</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input className="px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                placeholder="First name" defaultValue="Adaeze" />
              <input className="px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                placeholder="Last name" defaultValue="Okonkwo" />
              <input className="sm:col-span-2 px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                placeholder="Address line 1" defaultValue="123 Community Lane" />
              <input className="px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                placeholder="City" defaultValue="London" />
              <input className="px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                placeholder="Postcode" defaultValue="EC1A 1BB" />
            </div>
            <button className="mt-4 px-6 py-2.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
              Save address
            </button>
          </MotionDiv>

          {/* Danger zone */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 flex items-center justify-between"
            style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <div className="flex items-center gap-3">
              <XCircle size={20} style={{ color: '#EF4444' }} />
              <div>
                <p className="font-bold text-gray-900 text-sm">Cancel membership</p>
                <p className="text-xs text-gray-500">You'll keep access until Jul 1, 2026.</p>
              </div>
            </div>
            <Link to="/subscription/cancel"
              className="text-sm font-bold px-4 py-2 rounded-xl transition-colors hover:bg-red-50"
              style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              Cancel
            </Link>
          </MotionDiv>

          {/* Trust signal */}
          <MotionDiv variants={fadeUp} className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Shield size={12} style={{ color: '#2EAF6F' }} />
            Secured with 256-bit SSL encryption · PadiHub never stores your full card details
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
