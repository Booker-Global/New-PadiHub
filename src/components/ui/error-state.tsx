import { AlertTriangle, RefreshCw, Home, HelpCircle } from 'lucide-react';
import { Button } from './button';
import { Link } from 'react-router-dom';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this content right now. Please try again.",
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}>
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
        <AlertTriangle size={32} style={{ color: '#EF4444' }} />
      </div>
      <h3 className="text-lg font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs mb-6 leading-relaxed">{description}</p>
      <div className="flex flex-col sm:flex-row gap-3">
        {onRetry && (
          <Button onClick={onRetry} className="rounded-2xl font-bold px-6 gap-2"
            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
            <RefreshCw size={15} /> Try again
          </Button>
        )}
        <Button asChild variant="outline" className="rounded-2xl font-semibold px-6 gap-2">
          <Link to="/dashboard"><Home size={15} /> Return home</Link>
        </Button>
        <Button asChild variant="ghost" className="rounded-2xl font-semibold px-6 gap-2 text-gray-500">
          <Link to="/help"><HelpCircle size={15} /> Get support</Link>
        </Button>
      </div>
    </div>
  );
}
