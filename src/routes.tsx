import { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import HomePage from './pages/index';
import ProdNotFoundPage from './pages/_404';

// ── Statically imported: core public marketing pages ──────────────────────
import AboutPage from './pages/about';
import HowItWorksPage from './pages/how-it-works';
import PricingPage from './pages/pricing';
import TrustSecurityPage from './pages/trust-security';
import FAQPage from './pages/faq';
import ContactPage from './pages/contact';

const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : ProdNotFoundPage;

// ── Statically imported: auth pages ───────────────────────────────────────
import LoginPage from './pages/login';
import GetStartedPage from './pages/get-started';
import ForgotPasswordPage from './pages/forgot-password';
import ResetPasswordPage from './pages/reset-password';
import VerifyEmailPage from './pages/verify-email';

// ── Statically imported: core dashboard pages ──────────────────────────────
import TrustPage from './pages/trust';
import SavingsGroupsPage from './pages/savings-groups';

// ── Statically imported: legal pages ──────────────────────────────────────
import PrivacyPage from './pages/privacy';
import TermsPage from './pages/terms';

const OnboardingPage = lazy(() => import('./pages/onboarding'));

// App pages (authenticated)
import DashboardPage from './pages/dashboard';
const SubscriptionPage = lazy(() => import('./pages/subscription'));
const SettingsPage = lazy(() => import('./pages/settings'));
const LeaderDashboardPage = lazy(() => import('./pages/leader-dashboard'));

// Secondary public pages (lazy — less frequently visited)
const FeaturesPage = lazy(() => import('./pages/features'));
const MembershipPage = lazy(() => import('./pages/membership'));
const SubscriptionConfirmPage = lazy(() => import('./pages/subscription/confirm'));
const SubscriptionSuccessPage = lazy(() => import('./pages/subscription/success'));
const BillingHistoryPage = lazy(() => import('./pages/subscription/billing'));
const ManageMembershipPage = lazy(() => import('./pages/subscription/manage'));
const RenewMembershipPage = lazy(() => import('./pages/subscription/renew'));
const CancelMembershipPage = lazy(() => import('./pages/subscription/cancel'));

// Savings Groups sub-screens
const SavingsGroupDetailPage = lazy(() => import('./pages/savings-groups/[id]'));
const CreateSavingsGroupPage = lazy(() => import('./pages/savings-groups/create'));
const JoinSavingsGroupPage = lazy(() => import('./pages/savings-groups/[id]/join'));
const LeaveSavingsGroupPage = lazy(() => import('./pages/savings-groups/[id]/leave'));
const ContributionConfirmPage = lazy(() => import('./pages/savings-groups/[id]/contribute'));
const ContributionSuccessPage = lazy(() => import('./pages/savings-groups/contribution-success'));
const ContributionHistoryPage = lazy(() => import('./pages/savings-groups/history'));

// Trust Score™ sub-screens
const TrustHistoryPage = lazy(() => import('./pages/trust/history'));

// Notifications / Activity Centre
const NotificationsIndexPage = lazy(() => import('./pages/notifications/index'));
const NotificationSettingsPage = lazy(() => import('./pages/notifications/settings'));

// Profile / Personal Control Centre
const ProfileIndexPage = lazy(() => import('./pages/profile/index'));
const EditProfilePage = lazy(() => import('./pages/profile/edit'));

// Payments — payment method & payout destination setup
const AddPaymentMethodPage = lazy(() => import('./pages/payments/methods'));
const ConnectPayoutPage = lazy(() => import('./pages/payments/payout'));

// Leader Tools
const LeaderCommandCentrePage = lazy(() => import('./pages/leader/index'));
const LeaderMembersPage        = lazy(() => import('./pages/leader/members'));
const LeaderContributionsPage  = lazy(() => import('./pages/leader/contributions'));

// Help & Support
import HelpIndexPage from './pages/help/index';
const SubmitTicketPage = lazy(() => import('./pages/help/ticket'));
const HelpArticlePage  = lazy(() => import('./pages/help/article/[slug]'));

// Admin Portal
const AdminPortalPage = lazy(() => import('./pages/admin/index'));

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },

  // Auth
  { path: '/login', element: <LoginPage /> },
  { path: '/get-started', element: <GetStartedPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/onboarding', element: <OnboardingPage /> },

  // App (authenticated)
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/savings-groups', element: <SavingsGroupsPage /> },
  { path: '/trust', element: <TrustPage /> },
  { path: '/subscription', element: <SubscriptionPage /> },
  { path: '/settings', element: <SettingsPage /> },
  { path: '/leader-dashboard', element: <LeaderDashboardPage /> },

  // Public website
  { path: '/about', element: <AboutPage /> },
  { path: '/how-it-works', element: <HowItWorksPage /> },
  { path: '/features', element: <FeaturesPage /> },
  { path: '/pricing', element: <PricingPage /> },
  { path: '/trust-security', element: <TrustSecurityPage /> },
  { path: '/faq', element: <FAQPage /> },
  { path: '/contact', element: <ContactPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/membership', element: <MembershipPage /> },
  { path: '/subscription/confirm', element: <SubscriptionConfirmPage /> },
  { path: '/subscription/success', element: <SubscriptionSuccessPage /> },
  { path: '/subscription/billing', element: <BillingHistoryPage /> },
  { path: '/subscription/manage', element: <ManageMembershipPage /> },
  { path: '/subscription/renew', element: <RenewMembershipPage /> },
  { path: '/subscription/cancel', element: <CancelMembershipPage /> },

  // Savings Groups sub-screens
  { path: '/savings-groups/create', element: <CreateSavingsGroupPage /> },
  { path: '/savings-groups/contribution-success', element: <ContributionSuccessPage /> },
  { path: '/savings-groups/history', element: <ContributionHistoryPage /> },
  { path: '/savings-groups/:id', element: <SavingsGroupDetailPage /> },
  { path: '/savings-groups/:id/join', element: <JoinSavingsGroupPage /> },
  { path: '/savings-groups/:id/leave', element: <LeaveSavingsGroupPage /> },
  { path: '/savings-groups/:id/contribute', element: <ContributionConfirmPage /> },

  // Trust Score™ sub-screens
  { path: '/trust/history', element: <TrustHistoryPage /> },

  // Notifications / Activity Centre
  { path: '/notifications', element: <NotificationsIndexPage /> },
  { path: '/notifications/settings', element: <NotificationSettingsPage /> },

  // Profile / Personal Control Centre
  { path: '/profile', element: <ProfileIndexPage /> },
  { path: '/profile/edit', element: <EditProfilePage /> },

  // Payments — payment method & payout destination setup
  { path: '/payments/methods', element: <AddPaymentMethodPage /> },
  { path: '/payments/payout', element: <ConnectPayoutPage /> },

  // Leader Tools
  { path: '/leader',               element: <LeaderCommandCentrePage /> },
  { path: '/leader/members',       element: <LeaderMembersPage /> },
  { path: '/leader/contributions', element: <LeaderContributionsPage /> },

  // Help & Support
  { path: '/help',                 element: <HelpIndexPage /> },
  { path: '/help/ticket',          element: <SubmitTicketPage /> },
  { path: '/help/article/:slug',   element: <HelpArticlePage /> },

  // Admin Portal (hidden — platform admins only)
  { path: '/admin', element: <AdminPortalPage /> },

  { path: '*', element: <NotFoundPage /> },
];

export type Path = '/' | '/login' | '/get-started' | '/forgot-password' | '/verify-email' | '/onboarding' |
  '/dashboard' | '/savings-groups' | '/trust' |
  '/notifications' | '/profile' |
  '/about' | '/how-it-works' | '/features' | '/pricing' |
  '/trust-security' | '/faq' | '/contact';

export type Params = Record<string, string | undefined>;
