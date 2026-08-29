import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { motion } from 'motion/react';
import { CheckCircle, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const billing = [
  { date: 'Jun 1, 2026', amount: '£4.99', status: 'Paid', method: 'Visa •••• 4242' },
  { date: 'May 1, 2026', amount: '£4.99', status: 'Paid', method: 'Visa •••• 4242' },
  { date: 'Apr 1, 2026', amount: '£4.99', status: 'Paid', method: 'Visa •••• 4242' },
  { date: 'Mar 1, 2026', amount: '£4.99', status: 'Paid', method: 'Visa •••• 4242' },
];

export default function SubscriptionPage() {
  return (
    <DashboardLayout>
      <Helmet><title>Subscription & Billing — PadiHub</title><meta name="description" content="Manage your PadiHub subscription, billing history and plan details." /><link rel="canonical" href="https://padihub.com/subscription" />        <meta property="og:title" content="Subscription & Billing — PadiHub" />
        <meta property="og:description" content="Manage your PadiHub subscription, billing history and plan details." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>
          <h1 className="sr-only">Subscription & Billing — PadiHub</h1>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv as="h1" variants={fadeUp} className="text-2xl font-extrabold text-gray-900 mb-6" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Subscription & Billing
          </MotionDiv>

          {/* Current plan */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: '#2EAF6F' }} />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(46,175,111,0.2)', color: '#2EAF6F' }}>
                    ✓ Active
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-white mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>PadiHub UK Plan</h2>
                <p className="text-gray-400 text-sm">£4.99/month · Renews Jul 1, 2026</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>£4.99</p>
                <p className="text-gray-400 text-xs">per month</p>
              </div>
            </div>
          </MotionDiv>

          {/* Features included */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-6" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>What's included</h3>
            <div className="grid grid-cols-2 gap-2">
              {['Full Community Access', 'Trust Score™', 'PadiHub Passport™', 'Unlimited Savings Groups', 'Community DNA™', 'Governance & Voting', 'Priority Support'].map(f => (
                <div key={f} className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle size={14} style={{ color: '#2EAF6F' }} /> {f}
                </div>
              ))}
            </div>
          </MotionDiv>

          {/* Billing history */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-6" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Billing History</h3>
            <div className="flex flex-col gap-3">
              {billing.map((b, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(46,175,111,0.1)' }}>
                      <CreditCard size={16} style={{ color: '#2EAF6F' }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{b.date}</p>
                      <p className="text-xs text-gray-400">{b.method}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black" style={{ color: '#2EAF6F', fontFamily: 'Nunito, sans-serif' }}>{b.amount}</p>
                    <span className="text-xs font-semibold" style={{ color: '#2EAF6F' }}>✓ {b.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </MotionDiv>

          {/* Actions */}
          <MotionDiv variants={fadeUp} className="flex flex-col gap-3">
            <Button className="w-full rounded-2xl font-bold" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
              Upgrade to Annual — Save 17%
            </Button>
            <button className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-400 hover:bg-gray-50 transition-colors"
              style={{ border: '1px solid #E5E7EB' }}>
              Cancel subscription
            </button>
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
