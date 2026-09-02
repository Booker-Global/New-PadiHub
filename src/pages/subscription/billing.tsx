import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { CreditCard, Download, ChevronLeft, CheckCircle, AlertCircle, Filter } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { MotionDiv } from '@/lib/motion-safe';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

type InvoiceStatus = 'paid' | 'failed';

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: InvoiceStatus;
  method: string;
  plan: string;
  period: string;
}

const invoices: Invoice[] = [
  { id: 'INV-2026-006', date: 'Jun 1, 2026', amount: '£14.99', status: 'paid', method: 'Visa •••• 4242', plan: 'Premium', period: 'Jun 2026' },
  { id: 'INV-2026-005', date: 'May 1, 2026', amount: '£14.99', status: 'paid', method: 'Visa •••• 4242', plan: 'Premium', period: 'May 2026' },
  { id: 'INV-2026-004', date: 'Apr 1, 2026', amount: '£4.99', status: 'paid', method: 'Visa •••• 4242', plan: 'Basic', period: 'Apr 2026' },
  { id: 'INV-2026-003', date: 'Mar 1, 2026', amount: '£4.99', status: 'paid', method: 'Visa •••• 4242', plan: 'Basic', period: 'Mar 2026' },
  { id: 'INV-2026-002', date: 'Feb 1, 2026', amount: '£4.99', status: 'failed', method: 'Visa •••• 4242', plan: 'Basic', period: 'Feb 2026' },
  { id: 'INV-2026-001', date: 'Jan 1, 2026', amount: '£4.99', status: 'paid', method: 'Visa •••• 4242', plan: 'Basic', period: 'Jan 2026' },
];

const statusConfig: Record<InvoiceStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  paid: { label: 'Paid', color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)', icon: CheckCircle },
  failed: { label: 'Failed', color: '#EF4444', bg: 'rgba(239,68,68,0.1)', icon: AlertCircle },
};

const summary = [
  { label: 'Total paid', value: '£34.95', color: '#2EAF6F' },
  { label: 'Invoices', value: '6', color: '#2eafaf' },
  { label: 'Current plan', value: 'Elite', color: '#8B5CF6' },
  { label: 'Billing cadence', value: 'Monthly', color: '#F59E0B' },
];

export default function BillingHistoryPage() {
  const [filter, setFilter] = useState<'all' | InvoiceStatus>('all');
  const filtered = filter === 'all' ? invoices : invoices.filter((invoice) => invoice.status === filter);

  return (
    <DashboardLayout>
      <Helmet>
        <title>Billing History — PadiHub</title>
        <meta name="description" content="View your PadiHub billing history and monthly invoices." />
        <link rel="canonical" href="https://padihub.com/subscription/billing" />
        <meta property="og:title" content="Billing History — PadiHub" />
        <meta property="og:description" content="View your PadiHub billing history and monthly invoices." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="flex items-center gap-3 mb-6">
            <Link to="/subscription" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Billing History</h1>
              <p className="text-gray-500 text-sm">Recent monthly invoices and payment records</p>
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-2xl p-4 mb-6" style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.16)' }}>
            <p className="text-sm font-bold text-gray-900">Monthly memberships only</p>
            <p className="text-xs text-gray-500 mt-1">This page reflects current Basic and Premium monthly pricing. Invoice downloads will use the existing payments flow as more billing endpoints are connected.</p>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {summary.map((item) => (
              <div key={item.label} className="rounded-2xl p-4 bg-white text-center" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <p className="text-2xl font-extrabold mb-1" style={{ color: item.color, fontFamily: 'Nunito, sans-serif' }}>{item.value}</p>
                <p className="text-xs text-gray-500">{item.label}</p>
              </div>
            ))}
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="flex gap-2 mb-5">
            <Filter size={16} className="text-gray-400 mt-2" />
            {(['all', 'paid', 'failed'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className="px-4 py-1.5 rounded-full text-xs font-bold capitalize transition-all"
                style={{ background: filter === value ? '#2EAF6F' : '#F3F4F6', color: filter === value ? '#fff' : '#6B7280' }}
                type="button"
              >
                {value}
              </button>
            ))}
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl overflow-hidden bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div className="grid grid-cols-12 px-5 py-3 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wide" style={{ background: '#F9FAFB' }}>
              <div className="col-span-3">Invoice</div>
              <div className="col-span-2">Date</div>
              <div className="col-span-2">Plan</div>
              <div className="col-span-2">Method</div>
              <div className="col-span-1 text-right">Amount</div>
              <div className="col-span-1 text-center">Status</div>
              <div className="col-span-1 text-center">PDF</div>
            </div>

            {filtered.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">No invoices found for this filter.</div>
            ) : (
              filtered.map((invoice) => {
                const statusInfo = statusConfig[invoice.status];
                const StatusIcon = statusInfo.icon;
                return (
                  <div key={invoice.id} className="grid grid-cols-12 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors items-center">
                    <div className="col-span-3 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(46,175,111,0.08)' }}>
                        <CreditCard size={14} style={{ color: '#2EAF6F' }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700">{invoice.id}</span>
                    </div>
                    <div className="col-span-2 text-xs text-gray-600">{invoice.date}</div>
                    <div className="col-span-2 text-xs text-gray-600">{invoice.plan}</div>
                    <div className="col-span-2 text-xs text-gray-500">{invoice.method}</div>
                    <div className="col-span-1 text-right text-sm font-extrabold" style={{ color: '#111827', fontFamily: 'Nunito, sans-serif' }}>{invoice.amount}</div>
                    <div className="col-span-1 flex justify-center">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold" style={{ background: statusInfo.bg, color: statusInfo.color }}>
                        <StatusIcon size={10} /> {statusInfo.label}
                      </span>
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {invoice.status === 'paid' ? (
                        <button className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" title="Download PDF" type="button">
                          <Download size={13} style={{ color: '#6B7280' }} />
                        </button>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </MotionDiv>

          {invoices.some((invoice) => invoice.status === 'failed') && (
            <MotionDiv variants={fadeUp} className="mt-4 rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={18} style={{ color: '#EF4444', flexShrink: 0 }} />
              <div>
                <p className="text-sm font-bold" style={{ color: '#EF4444' }}>A payment failed in February 2026</p>
                <p className="text-xs text-gray-500 mt-0.5">Update your payment method from membership settings to avoid interruption to your monthly plan.</p>
              </div>
              <Link to="/subscription/manage" className="ml-auto text-xs font-bold px-3 py-1.5 rounded-xl flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
                Update card
              </Link>
            </MotionDiv>
          )}
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
