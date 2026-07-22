import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, PiggyBank, Shield, CheckCircle, Users, ArrowRight } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const groupData: Record<string, { name: string; community: string; amount: string; freq: string; members: number; nextDue: string; color: string; pct: number; totalSaved: string; goal: string }> = {
  'monthly-ajo-pool': { name: 'Monthly Ajo Pool',    community: 'Lagos Savers Circle', amount: '₦5,000', freq: 'Monthly', members: 10, nextDue: 'Jun 21', color: '#2EAF6F', pct: 64, totalSaved: '₦320,000', goal: '₦500,000' },
  'emergency-fund':   { name: 'Emergency Fund',      community: 'Lagos Savers Circle', amount: '₦2,500', freq: 'Monthly', members: 8,  nextDue: 'Jul 1',  color: '#F59E0B', pct: 90, totalSaved: '₦180,000', goal: '₦200,000' },
  'uk-deposit-fund':  { name: 'UK Deposit Fund',     community: 'UK Homeowners Hub',   amount: '£150',   freq: 'Monthly', members: 12, nextDue: 'Jun 28', color: '#2eafaf', pct: 42, totalSaved: '£25,200',  goal: '£60,000' },
  'business-capital': { name: 'Business Capital Pool',community: 'Diaspora Builders',  amount: '£200',   freq: 'Monthly', members: 15, nextDue: 'Jul 5',  color: '#8B5CF6', pct: 28, totalSaved: '£16,800',  goal: '£60,000' },
};
const defaultGroup = groupData['monthly-ajo-pool'];

const steps = ['Contribution Due', 'Confirm', 'Recorded', 'Trust Updated', 'Karma Awarded'];

export default function ContributionConfirmPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const group = (id && groupData[id]) ? groupData[id] : defaultGroup;
  const groupId = id ?? 'monthly-ajo-pool';

  const [currentStep, setCurrentStep] = useState(0);

  const handleConfirm = () => {
    const advance = (s: number) => {
      if (s < steps.length) {
        setTimeout(() => { setCurrentStep(s); advance(s + 1); }, 700);
      } else {
        setTimeout(() => navigate('/savings-groups/contribution-success'), 600);
      }
    };
    advance(1);
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Contribute — {group.name} — PadiHub</title>
        <meta name="description" content={`Record your contribution to ${group.name} on PadiHub.`} />
        <link rel="canonical" href={`https://padihub.com/savings-groups/${groupId}/contribute`} />
              <meta property="og:title" content="Contribute — {group.name} — PadiHub" />
        <meta property="og:description" content="The trusted community savings platform. Save together, grow together and belong." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://padihub.com/savings-groups/[id]/contribute" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        {currentStep === 0 && (
          <div className="mb-5">
            <Link to={`/savings-groups/${groupId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back
            </Link>
          </div>
        )}

        <MotionDiv initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

          {/* Progress steps */}
          {currentStep > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-0">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                        style={{
                          background: currentStep > i ? '#2EAF6F' : currentStep === i ? `linear-gradient(135deg, ${group.color}, ${group.color}cc)` : '#F3F4F6',
                          color: currentStep >= i ? '#fff' : '#9CA3AF',
                        }}>
                        {currentStep > i ? <CheckCircle size={14} /> : i + 1}
                      </div>
                    </div>
                    {i < steps.length - 1 && (
                      <div className="flex-1 h-0.5 mx-0.5 rounded-full transition-all" style={{ background: currentStep > i ? '#2EAF6F' : '#E5E7EB' }} />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-gray-400 mt-2">{steps[Math.min(currentStep, steps.length - 1)]}</p>
            </div>
          )}

          {/* Step 0: Contribution due */}
          {currentStep === 0 && (
            <>
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: `${group.color}15` }}>
                  <PiggyBank size={28} style={{ color: group.color }} />
                </div>
                <h1 className="text-2xl font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Contribution Due
                </h1>
                <p className="text-gray-500 text-sm">Record your contribution to strengthen your community.</p>
              </div>

              {/* Group card */}
              <div className="rounded-3xl p-5 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
                <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20" style={{ background: group.color }} />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${group.color}, ${group.color}cc)` }}>
                      <PiggyBank size={18} color="#fff" />
                    </div>
                    <div>
                      <p className="font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.name}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{group.community}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { label: 'Amount',  value: group.amount,           color: group.color },
                      { label: 'Members', value: group.members.toString(),color: '#8B5CF6' },
                      { label: 'Due',     value: group.nextDue,          color: '#F59E0B' },
                    ].map(k => (
                      <div key={k.label} className="rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <p className="text-base font-black" style={{ color: k.color, fontFamily: 'Nunito, sans-serif' }}>{k.value}</p>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{k.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="rounded-2xl p-4 mb-5 bg-white" style={{ border: '1px solid #E5E7EB' }}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Group progress</span>
                  <span className="font-bold" style={{ color: group.color }}>{group.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 mb-1">
                  <div className="h-2 rounded-full" style={{ width: `${group.pct}%`, background: `linear-gradient(90deg, ${group.color}, #F59E0B)` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{group.totalSaved} saved</span>
                  <span>Goal: {group.goal}</span>
                </div>
              </div>

              {/* What happens */}
              <div className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #E5E7EB' }}>
                <h2 className="font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>When you contribute</h2>
                <div className="flex flex-col gap-2">
                  {[
                    { text: 'Contribution recorded in your Passport™', color: '#2EAF6F', icon: Shield },
                    { text: 'Trust Score™ updated positively',          color: '#2EAF6F', icon: Shield },
                    { text: 'Community Karma™ awarded',                 color: '#F59E0B', icon: CheckCircle },
                    { text: 'Group progress advances',                  color: '#8B5CF6', icon: Users },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: `${item.color}06` }}>
                      <item.icon size={14} style={{ color: item.color, flexShrink: 0 }} />
                      <p className="text-sm text-gray-700">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl p-3 mb-5 flex items-center gap-2" style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.15)' }}>
                <Shield size={14} style={{ color: '#2EAF6F' }} />
                <p className="text-xs text-gray-600">PadiHub records participation only. No money is transferred through this platform.</p>
              </div>

              <div className="flex gap-3">
                <Link to={`/savings-groups/${groupId}`} className="px-5 py-3.5 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  style={{ border: '1px solid #E5E7EB' }}>
                  Cancel
                </Link>
                <button onClick={handleConfirm}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{ background: `linear-gradient(135deg, ${group.color}, ${group.color}cc)`, boxShadow: `0 4px 16px ${group.color}40` }}>
                  <ArrowRight size={16} /> Confirm contribution
                </button>
              </div>
            </>
          )}

          {/* Processing steps */}
          {currentStep > 0 && (
            <div className="text-center py-8">
              <MotionDiv
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1, repeat: currentStep < steps.length ? Infinity : 0 }}
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                style={{ background: `linear-gradient(135deg, ${group.color}, ${group.color}cc)`, boxShadow: `0 0 30px ${group.color}40` }}>
                <PiggyBank size={32} color="#fff" />
              </MotionDiv>
              <p className="text-lg font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {steps[Math.min(currentStep - 1, steps.length - 1)]}…
              </p>
              <p className="text-sm text-gray-400">Please wait while we record your contribution.</p>
            </div>
          )}
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
