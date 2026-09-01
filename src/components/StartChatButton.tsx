import { MessageCircle } from 'lucide-react';
import { toggleTawkChat } from '@/lib/tawkto';

/**
 * Global floating "Start Chat" launcher for the Tawk.to widget, rendered
 * from RootLayout so it appears on every page. Positioned bottom-left to
 * avoid clashing with the mobile quick-actions FAB in DashboardLayout
 * (bottom-right).
 */
export default function StartChatButton() {
  return (
    <button
      type="button"
      onClick={toggleTawkChat}
      aria-label="Start live chat"
      title="Start live chat"
      style={{
        position: 'fixed',
        bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        left: 16,
        zIndex: 40,
        width: 56,
        height: 56,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)',
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(46,175,111,0.45)',
      }}
    >
      <MessageCircle size={24} style={{ color: '#fff' }} />
    </button>
  );
}
