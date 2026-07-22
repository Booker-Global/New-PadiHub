import { ReactNode } from 'react';
import { Button } from './button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}>
      {icon && (
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
          style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.12)' }}>
          <div style={{ color: '#2EAF6F', opacity: 0.7 }}>{icon}</div>
        </div>
      )}
      <h3 className="text-lg font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>{title}</h3>
      {description && <p className="text-sm text-gray-500 max-w-xs mb-6 leading-relaxed">{description}</p>}
      <div className="flex flex-col sm:flex-row gap-3">
        {primaryAction && (
          <Button onClick={primaryAction.onClick} className="rounded-2xl font-bold px-6"
            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
            {primaryAction.label}
          </Button>
        )}
        {secondaryAction && (
          <Button variant="outline" onClick={secondaryAction.onClick} className="rounded-2xl font-semibold px-6">
            {secondaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}
