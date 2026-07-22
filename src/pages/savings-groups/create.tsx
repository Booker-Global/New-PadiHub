import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight, ArrowLeft, CheckCircle, Users, PiggyBank,
  Calendar, RotateCcw, Shield, Mail, Eye, Sparkles
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';

const fadeSlide = {
  hidden:  { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
  exit:    { opacity: 0, x: -24, transition: { duration: 0.2 } },
};

const TOTAL_STEPS = 7;

interface GroupData {
  name: string;
  description: string;
  amount: string;
  currency: string;
  frequency: 'monthly' | 'weekly';
  memberCount: number;
  rotationOrder: 'random' | 'manual' | 'fcfs';
  maxMissed: number;
  gracePeriod: number;
  votingRequired: boolean;
  allowSwaps: boolean;
  inviteEmails: string;
}

const defaultData: GroupData = {
  name: '', description: '', amount: '', currency: 'GBP',
  frequency: 'monthly', memberCount: 6,
  rotationOrder: 'random', maxMissed: 2, gracePeriod: 48,
  votingRequired: false, allowSwaps: true,
  inviteEmails: '',
};

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-1.5 rounded-full transition-all duration-300"
          style={{ background: i < current ? '#2EAF6F' : i === current ? '#2EAF6F' : '#E5E7EB', opacity: i === current ? 1 : i < current ? 1 : 0.4 }} />
      ))}
    </div>
  );
}

function OptionCard({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        borderColor: selected ? '#2EAF6F' : '#E5E7EB',
        background: selected ? 'rgba(46,175,111,0.05)' : '#fff',
      }}>
      {children}
      {selected && <CheckCircle size={16} className="float-right mt-0.5" style={{ color: '#2EAF6F' }} />}
    </button>
  );
}

export default function CreateGroupWizard() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<GroupData>(defaultData);
  const [done, setDone] = useState(false);

  const set = <K extends keyof GroupData>(k: K, v: GroupData[K]) => setData(d => ({ ...d, [k]: v }));

  const next = () => { if (step < TOTAL_STEPS - 1) setStep(s => s + 1); };
  const back = () => { if (step > 0) setStep(s => s - 1); };
  const finish = () => setDone(true);

  const rotationDuration = data.frequency === 'monthly'
    ? `${data.memberCount} months`
    : `${data.memberCount} weeks`;

  const stepTitles = [
    'Group Details', 'Contribution Rules', 'Group Size',
    'Rotation Rules', 'Group Rules', 'Invite Members', 'Review',
  ];

  if (done) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center p-6">
          <MotionDiv initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
            className="max-w-md w-full text-center">
            <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 40px rgba(46,175,111,0.4)' }}>
              <Sparkles size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Group Created!
            </h1>
            <p className="text-gray-500 mb-2 text-lg font-semibold">{data.name}</p>
            <p className="text-gray-400 mb-8">Your savings group has been created successfully. Start inviting members to get going.</p>
            <div className="flex flex-col gap-3">
              <Button asChild className="w-full rounded-2xl font-bold py-3"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                <Link to="/savings-groups">Invite Members</Link>
              </Button>
              <Button asChild variant="outline" className="w-full rounded-2xl font-bold py-3">
                <Link to="/dashboard">Return to Dashboard</Link>
              </Button>
            </div>
          </MotionDiv>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Create Savings Group — PadiHub</title>
        <meta name="description" content="Set up your rotating savings group on PadiHub in a few simple steps." />
        <link rel="canonical" href="https://padihub.com/savings-groups/create" />
              <meta property="og:title" content="Create Savings Group — PadiHub" />
        <meta property="og:description" content="Set up your rotating savings group on PadiHub in a few simple steps." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-lg">

          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-4"
              style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F', border: '1px solid rgba(46,175,111,0.2)' }}>
              <PiggyBank size={12} /> Step {step + 1} of {TOTAL_STEPS}
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {stepTitles[step]}
            </h1>
          </div>

          <StepIndicator current={step} total={TOTAL_STEPS} />

          {/* Step content */}
          <div className="rounded-3xl bg-white p-7 mb-5" style={{ border: '1px solid #F3F4F6', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <AnimatePresence mode="wait">
              <MotionDiv key={step} variants={fadeSlide} initial="hidden" animate="visible" exit="exit">

                {/* Step 1 — Group Details */}
                {step === 0 && (
                  <div className="space-y-4">
                    <p className="text-gray-500 text-sm mb-5">Give your savings group a name and an optional description.</p>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">Group Name <span className="text-red-400">*</span></label>
                      <input value={data.name} onChange={e => set('name', e.target.value)}
                        placeholder="e.g. Lagos Savers Circle"
                        className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                      <textarea value={data.description} onChange={e => set('description', e.target.value)}
                        placeholder="What is this group saving for?"
                        rows={3}
                        className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Step 2 — Contribution Rules */}
                {step === 1 && (
                  <div className="space-y-4">
                    <p className="text-gray-500 text-sm mb-5">Set how much each member contributes and how often.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-bold text-gray-700 block mb-1.5">Amount <span className="text-red-400">*</span></label>
                        <input value={data.amount} onChange={e => set('amount', e.target.value)}
                          placeholder="e.g. 150"
                          type="number"
                          className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-bold text-gray-700 block mb-1.5">Currency</label>
                        <select value={data.currency} onChange={e => set('currency', e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors bg-white">
                          <option value="GBP">GBP (£)</option>
                          <option value="NGN">NGN (₦)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-2">Frequency</label>
                      <div className="grid grid-cols-2 gap-3">
                        {(['monthly', 'weekly'] as const).map(f => (
                          <OptionCard key={f} selected={data.frequency === f} onClick={() => set('frequency', f)}>
                            <p className="font-bold text-gray-900 capitalize">{f}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{f === 'monthly' ? 'Default — most common' : 'Every week'}</p>
                          </OptionCard>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3 — Group Size */}
                {step === 2 && (
                  <div className="space-y-5">
                    <p className="text-gray-500 text-sm mb-5">How many members will be in this group?</p>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-2">Number of Members</label>
                      <div className="flex items-center gap-4">
                        <button onClick={() => set('memberCount', Math.max(2, data.memberCount - 1))}
                          className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-lg font-bold hover:bg-gray-50 transition-colors">−</button>
                        <span className="text-4xl font-black w-16 text-center" style={{ fontFamily: 'Nunito, sans-serif', color: '#2EAF6F' }}>{data.memberCount}</span>
                        <button onClick={() => set('memberCount', Math.min(50, data.memberCount + 1))}
                          className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-lg font-bold hover:bg-gray-50 transition-colors">+</button>
                      </div>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.15)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar size={15} style={{ color: '#2EAF6F' }} />
                        <p className="text-sm font-bold" style={{ color: '#2EAF6F' }}>Estimated rotation duration</p>
                      </div>
                      <p className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{rotationDuration}</p>
                      <p className="text-xs text-gray-500 mt-1">{data.memberCount} members × 1 {data.frequency} payout cycle each</p>
                    </div>
                  </div>
                )}

                {/* Step 4 — Rotation Rules */}
                {step === 3 && (
                  <div className="space-y-3">
                    <p className="text-gray-500 text-sm mb-5">How should the payout order be determined?</p>
                    {[
                      { value: 'random', label: 'Random Order', desc: 'Payout order is randomly assigned when the group starts' },
                      { value: 'manual', label: 'Manual Order', desc: 'You as leader assign the payout order manually' },
                      { value: 'fcfs',   label: 'First Come, First Served', desc: 'Members who join first get earlier payout positions' },
                    ].map(opt => (
                      <OptionCard key={opt.value} selected={data.rotationOrder === opt.value as GroupData['rotationOrder']}
                        onClick={() => set('rotationOrder', opt.value as GroupData['rotationOrder'])}>
                        <div className="flex items-start gap-3">
                          <RotateCcw size={16} style={{ color: '#2EAF6F', marginTop: 2 }} />
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{opt.label}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                          </div>
                        </div>
                      </OptionCard>
                    ))}
                  </div>
                )}

                {/* Step 5 — Group Rules */}
                {step === 4 && (
                  <div className="space-y-5">
                    <p className="text-gray-500 text-sm mb-5">Set the rules for missed payments and group governance.</p>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-2">Maximum missed payments before removal</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map(n => (
                          <OptionCard key={n} selected={data.maxMissed === n} onClick={() => set('maxMissed', n)}>
                            <p className="font-black text-2xl text-center" style={{ fontFamily: 'Nunito, sans-serif', color: data.maxMissed === n ? '#2EAF6F' : '#9CA3AF' }}>{n}</p>
                          </OptionCard>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-2">Late payment grace period</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[24, 48, 72].map(h => (
                          <OptionCard key={h} selected={data.gracePeriod === h} onClick={() => set('gracePeriod', h)}>
                            <p className="font-bold text-sm text-center text-gray-900">{h}h</p>
                          </OptionCard>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <OptionCard selected={data.votingRequired} onClick={() => set('votingRequired', !data.votingRequired)}>
                        <div className="flex items-center gap-3">
                          <Shield size={16} style={{ color: '#8B5CF6' }} />
                          <div>
                            <p className="font-bold text-sm text-gray-900">Require voting for key decisions</p>
                            <p className="text-xs text-gray-400">Members vote on removing members, admitting new ones and payout swaps</p>
                          </div>
                        </div>
                      </OptionCard>
                      <OptionCard selected={data.allowSwaps} onClick={() => set('allowSwaps', !data.allowSwaps)}>
                        <div className="flex items-center gap-3">
                          <RotateCcw size={16} style={{ color: '#F59E0B' }} />
                          <div>
                            <p className="font-bold text-sm text-gray-900">Allow payout swap requests</p>
                            <p className="text-xs text-gray-400">Members can request to swap their payout position with another member</p>
                          </div>
                        </div>
                      </OptionCard>
                    </div>
                  </div>
                )}

                {/* Step 6 — Invite Members */}
                {step === 5 && (
                  <div className="space-y-5">
                    <p className="text-gray-500 text-sm mb-5">Invite people to join your group by email or share a link.</p>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">Invite by email</label>
                      <textarea value={data.inviteEmails} onChange={e => set('inviteEmails', e.target.value)}
                        placeholder="Enter email addresses, one per line"
                        rows={4}
                        className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors resize-none"
                      />
                      <p className="text-xs text-gray-400 mt-1">Invitations will be sent once the group is created.</p>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Mail size={15} style={{ color: '#2EAF6F' }} />
                        <p className="text-sm font-bold text-gray-700">Or share an invite link</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-400 truncate">
                          padihub.com/join/abc123xyz
                        </div>
                        <button className="px-3 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0"
                          style={{ background: '#2EAF6F' }}>
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 7 — Review */}
                {step === 6 && (
                  <div className="space-y-4">
                    <p className="text-gray-500 text-sm mb-5">Review your group settings before creating.</p>
                    {[
                      { icon: PiggyBank, label: 'Group Name',         value: data.name || '—' },
                      { icon: PiggyBank, label: 'Contribution',       value: `${data.currency === 'GBP' ? '£' : '₦'}${data.amount} / ${data.frequency}` },
                      { icon: Users,     label: 'Members',            value: `${data.memberCount} members` },
                      { icon: Calendar,  label: 'Rotation duration',  value: rotationDuration },
                      { icon: RotateCcw, label: 'Payout order',       value: data.rotationOrder === 'random' ? 'Random' : data.rotationOrder === 'manual' ? 'Manual' : 'First come, first served' },
                      { icon: Shield,    label: 'Max missed payments', value: `${data.maxMissed} missed` },
                      { icon: Eye,       label: 'Grace period',       value: `${data.gracePeriod} hours` },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2">
                          <row.icon size={14} style={{ color: '#2EAF6F' }} />
                          <span className="text-sm text-gray-500">{row.label}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900">{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}

              </MotionDiv>
            </AnimatePresence>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3">
            {step > 0 ? (
              <Button variant="outline" onClick={back} className="rounded-2xl px-5 gap-2 font-bold">
                <ArrowLeft size={16} /> Back
              </Button>
            ) : (
              <Button variant="outline" asChild className="rounded-2xl px-5 font-bold">
                <Link to="/dashboard">Cancel</Link>
              </Button>
            )}
            <Button
              onClick={step === TOTAL_STEPS - 1 ? finish : next}
              disabled={step === 0 && !data.name.trim()}
              className="flex-1 rounded-2xl font-bold gap-2"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
              {step === TOTAL_STEPS - 1 ? (
                <><CheckCircle size={16} /> Create Group</>
              ) : (
                <>Continue <ArrowRight size={16} /></>
              )}
            </Button>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
