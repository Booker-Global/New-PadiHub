import { ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { MotionDiv } from '@/lib/motion-safe';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmColor = variant === 'danger' ? '#EF4444' : '#2EAF6F';

  return (
    <AnimatePresence>
      {open && (
        <>
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onCancel}
          />
          <MotionDiv
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-sm pointer-events-auto relative">
              <button onClick={onCancel} className="absolute top-4 right-4 p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <X size={16} className="text-gray-400" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'rgba(46,175,111,0.1)' }}>
                  {icon || <AlertTriangle size={26} style={{ color: confirmColor }} />}
                </div>
                <h3 className="text-lg font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>{title}</h3>
                {description && <p className="text-sm text-gray-500 leading-relaxed mb-6">{description}</p>}
                <div className="flex gap-3 w-full">
                  <Button variant="outline" onClick={onCancel} className="flex-1 rounded-2xl font-semibold">
                    {cancelLabel}
                  </Button>
                  <Button onClick={onConfirm} className="flex-1 rounded-2xl font-bold"
                    style={{ background: confirmColor, color: '#fff' }}>
                    {confirmLabel}
                  </Button>
                </div>
              </div>
            </div>
          </MotionDiv>
        </>
      )}
    </AnimatePresence>
  );
}
