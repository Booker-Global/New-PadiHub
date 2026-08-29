import { AnimatePresence } from 'motion/react';
import { MotionDiv } from '@/lib/motion-safe';
import { CheckCircle, X, Trophy, Shield } from 'lucide-react';

export type SuccessType = 'default' | 'trust' | 'badge' | 'contribution' | 'joined';

interface SuccessToastProps {
  visible: boolean;
  type?: SuccessType;
  title: string;
  description?: string;
  onClose: () => void;
}

const typeConfig: Record<SuccessType, { icon: typeof CheckCircle; color: string; bg: string }> = {
  default:      { icon: CheckCircle, color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)' },
  trust:        { icon: Shield,      color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)' },
  badge:        { icon: Trophy,      color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  contribution: { icon: CheckCircle, color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)' },
  joined:       { icon: CheckCircle, color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)' },
};

export function SuccessToast({ visible, type = 'default', title, description, onClose }: SuccessToastProps) {
  const cfg = typeConfig[type];
  const Icon = cfg.icon;

  return (
    <AnimatePresence>
      {visible && (
        <MotionDiv
          initial={{ opacity: 0, y: 60, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-24 left-1/2 z-50 flex items-center gap-4 px-5 py-4 rounded-3xl shadow-2xl"
          style={{
            transform: 'translateX(-50%)',
            background: '#fff',
            border: `1px solid ${cfg.color}30`,
            boxShadow: `0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px ${cfg.color}20`,
            minWidth: 280,
            maxWidth: 360,
          }}
        >
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: cfg.bg }}>
            <Icon size={20} style={{ color: cfg.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-gray-900 text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>{title}</p>
            {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0">
            <X size={14} className="text-gray-400" />
          </button>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}

// Hook for easy use
import { useState, useCallback } from 'react';

export function useSuccessToast() {
  const [state, setState] = useState<{ visible: boolean; type: SuccessType; title: string; description?: string }>({
    visible: false, type: 'default', title: '',
  });

  const show = useCallback((title: string, description?: string, type: SuccessType = 'default') => {
    setState({ visible: true, type, title, description });
    setTimeout(() => setState(s => ({ ...s, visible: false })), 3500);
  }, []);

  const hide = useCallback(() => setState(s => ({ ...s, visible: false })), []);

  return { toastState: state, show, hide };
}
