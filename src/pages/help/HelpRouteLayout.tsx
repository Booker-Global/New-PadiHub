import { type ReactNode, useEffect, useState } from 'react';

import DashboardLayout from '@/components/DashboardLayout';
import Footer from '@/layouts/parts/Footer';
import Header from '@/layouts/parts/Header';
import Website from '@/layouts/Website';
import { getValidSession } from '@/lib/session';

interface HelpRouteLayoutProps {
  children: ReactNode;
}

export default function HelpRouteLayout({ children }: HelpRouteLayoutProps) {
  const [useDashboardLayout, setUseDashboardLayout] = useState(false);

  useEffect(() => {
    setUseDashboardLayout(Boolean(getValidSession()));
  }, []);

  if (useDashboardLayout) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  return (
    <Website>
      <Header />
      {children}
      <Footer />
    </Website>
  );
}
