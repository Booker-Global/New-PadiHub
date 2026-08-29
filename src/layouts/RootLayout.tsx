import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement } from 'react';
import { ScrollRestoration, useLocation } from 'react-router-dom';

import Footer from '@/layouts/parts/Footer';
import Header from '@/layouts/parts/Header';
import Website from '@/layouts/Website';
import { MotionReadyProvider } from '@/lib/motion-safe';

// Routes that manage their own full-screen layout (no shared header/footer)
const FULL_SCREEN_ROUTES = [
  '/login', '/get-started', '/forgot-password', '/verify-email', '/onboarding', '/reset-password',
  '/dashboard', '/savings-groups', '/trust',
  '/notifications', '/profile', '/subscription',
  '/settings', '/leader-dashboard', '/leader', '/help', '/admin',
  '/subscription/confirm', '/subscription/success', '/subscription/billing',
  '/subscription/manage', '/subscription/renew', '/subscription/cancel',
];

interface RootLayoutProps {
  children: ReactElement;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const location = useLocation();
  const isFullScreen = FULL_SCREEN_ROUTES.some(r => location.pathname === r || location.pathname.startsWith(r + '/'));

  if (isFullScreen) {
    return (
      <MotionReadyProvider>
        <Helmet>
          <title>PadiHub — Community Operating System</title>
          <meta name="description" content="PadiHub — Save Together. Grow Together. Belong." />
        </Helmet>
        <ScrollRestoration />
        {children}
      </MotionReadyProvider>
    );
  }

  return (
    <Website>
      <MotionReadyProvider>
        <Helmet>
          <title>PadiHub — Save Together. Grow Together. Belong.</title>
          <meta name="description" content="PadiHub is the world's first Community Operating System for savings. Build trust, save together and reach your goals." />
        </Helmet>
        <ScrollRestoration />
        <Header />
        {children}
        <Footer />
      </MotionReadyProvider>
    </Website>
  );
}
