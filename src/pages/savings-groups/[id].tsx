import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  PiggyBank,
  Users,
  Shield,
  Calendar,
  CheckCircle,
  Clock,
  TrendingUp,
  Share2,
  UserPlus,
  LogOut,
  AlertTriangle,
  Copy,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  PlayCircle,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

// Mirrors GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH in src/server/lib/constants.ts —
// a group can only move from "draft" to "active" once it has this many
// verified (active) members; the backend is the real gate, this is just for
// disabling the "Start Group" button and showing progress up front.
const GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH = 3;

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

type Tab = 'overview' | 'members' | 'activity' | 'rules';

interface SavingsGroup {
  id: string;
  name: string;
  description?: string | null;
  leader_id: string;
  country: 'GB' | 'NG';
  currency: 'GBP' | 'NGN';
  contribution_amount: string | number;
  contribution_frequency: 'daily' | 'weekly' | 'monthly';
  maximum_members: number;
  rotation_method: 'manual' | 'random' | 'trust_score';
  current_rotation_position: number;
  current_cycle: number;
  strike_threshold: number;
  suspension_threshold: number;
  voting_threshold: number;
  allow_payout_swaps: boolean;
  payment_provider: 'stripe' | 'flutterwave';
  status: 'draft' | 'active' | 'suspended' | 'closed' | 'expired';
  created_at: string;
  updated_at: string;
}

interface Membership {
  id: string;
  user_id: string;
  group_id: string;
  role: 'member' | 'leader';
  rotation_order?: number | null;
  status: 'pending' | 'active' | 'suspended' | 'removed';
  strike_count: number;
  join_date: string;
}

interface Contribution {
  id: string;
  group_id: string;
  member_id: string;
  cycle_number: number;
  amount_due: string | number;
  amount_paid?: string | number | null;
  due_date: string;
  paid_date?: string | null;
  payment_status: 'scheduled' | 'due' | 'paid' | 'failed' | 'missed' | 'pending_default' | 'defaulted';
  grace_period_ends_at?: string | null;
}

interface RotationInfo {
  cycle_number: number;
  recipient_id: string;
  scheduled_payout_date: string;
  payout_status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface NextRotationInfo {
  cycle_number: number;
  recipient_id: string;
  rotation_order: number;
}

interface InvitationResult {
  token?: string;
  inviteLink?: string;
}

interface Vote {
  id: string;
  group_id: string;
  proposal_type: 'payout_swap' | 'exceptional_request' | 'member_admission' | 'contribution_claim' | 'member_removal';
  proposer_id: string;
  proposal_text: string;
  target_member_id?: string | null;
  voting_deadline: string;
  status: 'open' | 'approved' | 'rejected' | 'expired';
  created_at: string;
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[] | undefined>;
}

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  const firstFieldError = json?.errors
    ? Object.values(json.errors).flat().find((value): value is string => Boolean(value))
    : undefined;
  return firstFieldError || json?.message || fallback;
}

function formatCurrency(amount: string | number, currency: 'GBP' | 'NGN') {
  const numericAmount = typeof amount === 'number' ? amount : Number.parseFloat(amount);
  const locale = currency === 'GBP' ? 'en-GB' : 'en-NG';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
}

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeRotationMethod(rotationMethod: SavingsGroup['rotation_method']) {
  return rotationMethod === 'manual' || rotationMethod === 'trust_score'
    ? 'Trust Score'
    : titleCase(rotationMethod);
}

function shortId(value: string) {
  return `${value.slice(0, 8)}…`;
}

function getGroupColor(group: SavingsGroup) {
  if (group.status === 'closed' || group.status === 'expired') return '#6B7280';
  if (group.status === 'suspended') return '#F59E0B';
  if (group.status === 'draft') return '#8B5CF6';
  return group.currency === 'NGN' ? '#2EAF6F' : '#2eafaf';
}

function getContributionMeta(status: Contribution['payment_status']) {
  switch (status) {
    case 'paid':
      return { color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)', icon: CheckCircle, label: 'Paid' };
    case 'pending_default':
      return { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', icon: Clock, label: 'Grace period' };
    case 'defaulted':
      return { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', icon: AlertTriangle, label: 'Defaulted' };
    case 'failed':
    case 'missed':
      return { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', icon: AlertTriangle, label: titleCase(status) };
    case 'due':
      return { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', icon: Clock, label: 'Due' };
    default:
      return { color: '#2eafaf', bg: 'rgba(46,175,175,0.1)', icon: Calendar, label: 'Scheduled' };
  }
}

function getMembershipBadge(status: Membership['status']) {
  switch (status) {
    case 'active':
      return { color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)' };
    case 'suspended':
      return { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' };
    case 'removed':
      return { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' };
    default:
      return { color: '#6B7280', bg: 'rgba(107,114,128,0.12)' };
  }
}

export default function SavingsGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [group, setGroup] = useState<SavingsGroup | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [currentRotation, setCurrentRotation] = useState<RotationInfo | null>(null);
  const [nextRotation, setNextRotation] = useState<NextRotationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteNotice, setInviteNotice] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [membershipActionId, setMembershipActionId] = useState<string | null>(null);
  const [membershipActionError, setMembershipActionError] = useState('');
  const [admissionVoteId, setAdmissionVoteId] = useState<string | null>(null);
  const [admissionVoteError, setAdmissionVoteError] = useState('');
  const [admissionVoteNotice, setAdmissionVoteNotice] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [claimNotice, setClaimNotice] = useState('');
  const [votes, setVotes] = useState<Vote[]>([]);
  const [swapTarget, setSwapTarget] = useState('');
  const [swapNote, setSwapNote] = useState('');
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [swapError, setSwapError] = useState('');
  const [swapNotice, setSwapNotice] = useState('');
  const [removalTarget, setRemovalTarget] = useState('');
  const [removalReason, setRemovalReason] = useState('');
  const [removalSubmitting, setRemovalSubmitting] = useState(false);
  const [removalError, setRemovalError] = useState('');
  const [removalNotice, setRemovalNotice] = useState('');
  const [voteActionId, setVoteActionId] = useState<string | null>(null);
  const [voteActionError, setVoteActionError] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState('');

  const loadData = useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to view this savings group.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setNotFound(false);

    try {
      const headers = { Authorization: 'Bearer ' + session.token };
      const groupResponse = await window.fetch(`/api/groups/${id}`, { headers });
      const groupJson = await groupResponse.json() as ApiResponse<SavingsGroup>;

      if (!groupResponse.ok) {
        const message = getErrorMessage(groupJson, 'Could not load this group.');
        if (groupResponse.status === 404) {
          setNotFound(true);
          setGroup(null);
          setMemberships([]);
          setContributions([]);
          setCurrentRotation(null);
          setNextRotation(null);
          return;
        }
        throw new Error(message);
      }

      const groupData = groupJson.data ?? null;
      setGroup(groupData);

      const [membershipsResult, contributionsResult, currentRotationResult, nextRotationResult, votesResult] = await Promise.allSettled([
        window.fetch(`/api/memberships?group_id=${id}`, { headers }),
        window.fetch(`/api/contributions?group_id=${id}`, { headers }),
        window.fetch(`/api/rotations/${id}/current`, { headers }),
        window.fetch(`/api/rotations/${id}/next`, { headers }),
        window.fetch(`/api/votes?group_id=${id}`, { headers }),
      ]);

      if (membershipsResult.status === 'fulfilled' && membershipsResult.value.ok) {
        const membershipsJson = await membershipsResult.value.json() as ApiResponse<Membership[]>;
        setMemberships(Array.isArray(membershipsJson.data) ? membershipsJson.data : []);
      } else {
        setMemberships([]);
      }

      if (contributionsResult.status === 'fulfilled' && contributionsResult.value.ok) {
        const contributionsJson = await contributionsResult.value.json() as ApiResponse<Contribution[]>;
        const rows = Array.isArray(contributionsJson.data) ? contributionsJson.data : [];
        setContributions(
          rows.sort((left, right) => {
            const leftDate = new Date(left.paid_date || left.due_date).getTime();
            const rightDate = new Date(right.paid_date || right.due_date).getTime();
            return rightDate - leftDate;
          }),
        );
      } else {
        setContributions([]);
      }

      if (currentRotationResult.status === 'fulfilled' && currentRotationResult.value.ok) {
        const currentRotationJson = await currentRotationResult.value.json() as ApiResponse<RotationInfo>;
        setCurrentRotation(currentRotationJson.data ?? null);
      } else {
        setCurrentRotation(null);
      }

      if (nextRotationResult.status === 'fulfilled' && nextRotationResult.value.ok) {
        const nextRotationJson = await nextRotationResult.value.json() as ApiResponse<NextRotationInfo>;
        setNextRotation(nextRotationJson.data ?? null);
      } else {
        setNextRotation(null);
      }

      if (votesResult.status === 'fulfilled' && votesResult.value.ok) {
        const votesJson = await votesResult.value.json() as ApiResponse<Vote[]>;
        setVotes(Array.isArray(votesJson.data) ? votesJson.data : []);
      } else {
        setVotes([]);
      }
    } catch (loadError) {
      setGroup(null);
      setMemberships([]);
      setContributions([]);
      setCurrentRotation(null);
      setNextRotation(null);
      setVotes([]);
      setError(loadError instanceof Error ? loadError.message : 'Could not load this group.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // getValidSession() may clear an expired session from storage as a side
  // effect; reading it via useMemo (rather than directly during render) keeps
  // that mutation out of React's render phase, e.g. under Strict Mode's
  // double-invocation of render functions.
  const session = useMemo(() => getValidSession(), []);
  const currentUserId = session?.userId;

  const activeMembers = useMemo(
    () => memberships.filter(member => member.status === 'active'),
    [memberships],
  );

  const membershipSummary = useMemo(() => ({
    active: activeMembers.length,
    pending: memberships.filter(member => member.status === 'pending').length,
    suspended: memberships.filter(member => member.status === 'suspended').length,
    removed: memberships.filter(member => member.status === 'removed').length,
  }), [memberships, activeMembers]);

  const orderedMembers = useMemo(
    () => [...memberships].sort((left, right) => {
      const leftRole = left.role === 'leader' ? 0 : 1;
      const rightRole = right.role === 'leader' ? 0 : 1;
      if (leftRole !== rightRole) return leftRole - rightRole;
      return (left.rotation_order ?? Number.MAX_SAFE_INTEGER) - (right.rotation_order ?? Number.MAX_SAFE_INTEGER);
    }),
    [memberships],
  );

  const getMemberDisplayName = useCallback((userId: string) => {
    if (userId === currentUserId) return 'You';
    const index = orderedMembers.findIndex(member => member.user_id === userId);
    return index >= 0 ? `Member ${index + 1}` : shortId(userId);
  }, [orderedMembers, currentUserId]);

  const currentMembership = useMemo(
    () => memberships.find(member => member.user_id === currentUserId),
    [memberships, currentUserId],
  );

  const swapCandidates = useMemo(
    () => activeMembers.filter(member => member.user_id !== currentUserId),
    [activeMembers, currentUserId],
  );

  const openPayoutSwapVotes = useMemo(
    () => votes.filter(vote => vote.proposal_type === 'payout_swap' && vote.status === 'open'),
    [votes],
  );

  const openGovernanceVotes = useMemo(
    () => votes.filter(vote => (vote.proposal_type === 'member_admission' || vote.proposal_type === 'contribution_claim' || vote.proposal_type === 'member_removal') && vote.status === 'open'),
    [votes],
  );

  function describeGovernanceVote(vote: Vote) {
    if (vote.proposal_type === 'member_admission') return 'New Member Admission — needs a unanimous accept from every active member';
    if (vote.proposal_type === 'contribution_claim') return 'Contribution Increase Request — needs a unanimous accept from every active member';
    if (vote.proposal_type === 'member_removal') return `Remove ${getMemberDisplayName(vote.target_member_id ?? '')} — needs a unanimous accept from every other active member`;
    return vote.proposal_text;
  }

  function parseSwapTarget(proposalText: string) {
    const match = /\[\[PAYOUT_SWAP:([^\]]+)\]\]\s*(.*)$/.exec(proposalText);
    if (!match) return { targetUserId: '', note: proposalText };
    return { targetUserId: match[1], note: match[2] };
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'members', label: 'Members' },
    { key: 'activity', label: 'Activity' },
    { key: 'rules', label: 'Rules' },
  ];

  const groupColor = group ? getGroupColor(group) : '#2EAF6F';
  const occupancyPercentage = group ? Math.min(100, Math.round((activeMembers.length / Math.max(group.maximum_members, 1)) * 100)) : 0;

  const closeInviteModal = () => {
    setInviteOpen(false);
    setInviteLoading(false);
    setInviteError('');
    setInviteNotice('');
    setInviteEmail('');
    setInviteLink('');
    setInviteToken('');
  };

  const openInviteModal = () => {
    setInviteOpen(true);
    setInviteError('');
    setInviteNotice('');
  };

  const handleCreateInvite = async () => {
    if (!group) return;

    const activeSession = getValidSession();
    if (!activeSession?.token) {
      setInviteError('Please log in to send invites.');
      return;
    }

    setInviteLoading(true);
    setInviteError('');
    setInviteNotice('');

    try {
      const response = await window.fetch(`/api/groups/${group.id}/invitations`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + activeSession.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: inviteEmail.trim() || undefined }),
      });

      const json = await response.json() as ApiResponse<InvitationResult>;
      if (!response.ok) {
        setInviteError(getErrorMessage(json, 'Could not create an invite right now.'));
        return;
      }

      const returnedInviteLink = json.data?.inviteLink || '';
      const returnedToken = json.data?.token || '';
      const queryToken = returnedInviteLink ? new window.URLSearchParams(returnedInviteLink.split('?')[1] || '').get('token') || '' : '';
      const effectiveToken = returnedToken || queryToken;
      const sharePath = effectiveToken
        ? `/savings-groups/${group.id}/join?invite_token=${effectiveToken}`
        : returnedInviteLink;
      const fullLink = sharePath ? new window.URL(sharePath, window.location.origin).toString() : '';

      setInviteToken(effectiveToken);
      setInviteLink(fullLink);
      setInviteNotice(inviteEmail.trim() ? `Invite created for ${inviteEmail.trim()}.` : 'Invite link created successfully.');
    } catch {
      setInviteError('Network error. Please check your connection and try again.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleActivateGroup = async () => {
    if (!id) return;
    const activeSession = getValidSession();
    if (!activeSession?.token) {
      setActivateError('Please log in to start this group.');
      return;
    }

    setActivating(true);
    setActivateError('');

    try {
      const response = await window.fetch(`/api/groups/${id}/activate`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + activeSession.token },
      });
      const json = await response.json() as ApiResponse<null>;
      if (!response.ok) {
        setActivateError(getErrorMessage(json, 'Could not start this group.'));
        return;
      }
      await loadData();
    } catch {
      setActivateError('Network error. Please check your connection and try again.');
    } finally {
      setActivating(false);
    }
  };

  const handleMembershipDecision = async (membershipId: string, decision: 'approve' | 'reject') => {
    const activeSession = getValidSession();
    if (!activeSession?.token) {
      setMembershipActionError('Please log in to manage join requests.');
      return;
    }

    setMembershipActionId(membershipId);
    setMembershipActionError('');

    try {
      const response = await window.fetch(`/api/memberships/${membershipId}/${decision}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + activeSession.token },
      });
      const json = await response.json() as ApiResponse<null>;
      if (!response.ok) {
        setMembershipActionError(getErrorMessage(json, `Could not ${decision} this join request.`));
        return;
      }
      await loadData();
    } catch {
      setMembershipActionError('Network error. Please check your connection and try again.');
    } finally {
      setMembershipActionId(null);
    }
  };

  const handleProposeAdmission = async (membershipId: string) => {
    const activeSession = getValidSession();
    if (!activeSession?.token) {
      setAdmissionVoteError('Please log in to start an admission vote.');
      return;
    }

    setAdmissionVoteId(membershipId);
    setAdmissionVoteError('');
    setAdmissionVoteNotice('');

    try {
      const response = await window.fetch('/api/votes/member-admission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + activeSession.token },
        body: JSON.stringify({ membership_id: membershipId }),
      });
      const json = await response.json() as ApiResponse<null>;
      if (!response.ok) {
        setAdmissionVoteError(getErrorMessage(json, 'Could not start an admission vote.'));
        return;
      }
      setAdmissionVoteNotice('Admission vote started. Every active member has 48 hours to accept via email.');
      await loadData();
    } catch {
      setAdmissionVoteError('Network error. Please check your connection and try again.');
    } finally {
      setAdmissionVoteId(null);
    }
  };

  const handleProposeClaim = async () => {
    if (!id) return;
    const amountValue = Number.parseFloat(claimAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setClaimError('Enter a valid contribution amount.');
      return;
    }
    const activeSession = getValidSession();
    if (!activeSession?.token) {
      setClaimError('Please log in to propose a contribution increase.');
      return;
    }

    setClaimSubmitting(true);
    setClaimError('');
    setClaimNotice('');

    try {
      const response = await window.fetch('/api/votes/contribution-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + activeSession.token },
        body: JSON.stringify({ group_id: id, amount: amountValue }),
      });
      const json = await response.json() as ApiResponse<null>;
      if (!response.ok) {
        setClaimError(getErrorMessage(json, 'Could not propose this contribution increase.'));
        return;
      }
      setClaimNotice('Proposal submitted. Every active member has 48 hours to accept via email.');
      setClaimAmount('');
      await loadData();
    } catch {
      setClaimError('Network error. Please check your connection and try again.');
    } finally {
      setClaimSubmitting(false);
    }
  };

  const handleProposeSwap = async () => {
    if (!id || !swapTarget) {
      setSwapError('Please choose a member to swap payout positions with.');
      return;
    }
    const activeSession = getValidSession();
    if (!activeSession?.token) {
      setSwapError('Please log in to propose a payout swap.');
      return;
    }

    setSwapSubmitting(true);
    setSwapError('');
    setSwapNotice('');

    try {
      const response = await window.fetch('/api/votes/payout-swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + activeSession.token,
        },
        body: JSON.stringify({ group_id: id, target_member_id: swapTarget, note: swapNote || undefined }),
      });
      const json = await response.json() as ApiResponse<{ id: string }>;
      if (!response.ok) {
        setSwapError(getErrorMessage(json, 'Could not propose this payout swap.'));
        return;
      }
      setSwapNotice('Swap proposal submitted. Group members have 3 days to vote.');
      setSwapTarget('');
      setSwapNote('');
      await loadData();
    } catch {
      setSwapError('Network error. Please check your connection and try again.');
    } finally {
      setSwapSubmitting(false);
    }
  };

  const handleProposeRemoval = async () => {
    if (!id || !removalTarget) {
      setRemovalError('Please choose a member to propose removing.');
      return;
    }
    const activeSession = getValidSession();
    if (!activeSession?.token) {
      setRemovalError('Please log in to propose a member removal.');
      return;
    }

    setRemovalSubmitting(true);
    setRemovalError('');
    setRemovalNotice('');

    try {
      const response = await window.fetch('/api/votes/member-removal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + activeSession.token,
        },
        body: JSON.stringify({ group_id: id, target_member_id: removalTarget, reason: removalReason || undefined }),
      });
      const json = await response.json() as ApiResponse<{ id: string }>;
      if (!response.ok) {
        setRemovalError(getErrorMessage(json, 'Could not propose this member removal.'));
        return;
      }
      setRemovalNotice('Removal vote started. Every other active member has 48 hours to respond — it only passes if all agree.');
      setRemovalTarget('');
      setRemovalReason('');
      await loadData();
    } catch {
      setRemovalError('Network error. Please check your connection and try again.');
    } finally {
      setRemovalSubmitting(false);
    }
  };

  const handleCastVote = async (voteId: string, decision: 'approve' | 'reject') => {
    const activeSession = getValidSession();
    if (!activeSession?.token) {
      setVoteActionError('Please log in to vote.');
      return;
    }

    setVoteActionId(voteId);
    setVoteActionError('');

    try {
      const response = await window.fetch(`/api/votes/${voteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + activeSession.token,
        },
        body: JSON.stringify({ decision }),
      });
      const json = await response.json() as ApiResponse<null>;
      if (!response.ok) {
        setVoteActionError(getErrorMessage(json, 'Could not record your vote.'));
        return;
      }
      await loadData();
    } catch {
      setVoteActionError('Network error. Please check your connection and try again.');
    } finally {
      setVoteActionId(null);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;

    try {
      await window.navigator.clipboard.writeText(inviteLink);
      setInviteNotice('Invite link copied.');
      setInviteError('');
    } catch {
      setInviteError('Could not copy the invite link. Please copy it manually.');
    }
  };

  if (loading) {
    return <DashboardLayout><SkeletonPage /></DashboardLayout>;
  }

  if (notFound) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-2xl mx-auto text-center py-16">
          <h1 className="text-2xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Group not found</h1>
          <p className="text-gray-500 mb-6">The savings group you&apos;re looking for doesn&apos;t exist or is no longer available.</p>
          <Link to="/savings-groups" className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
            <ChevronLeft size={16} /> Back to savings groups
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !group) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-2xl mx-auto text-center py-16">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertTriangle size={24} style={{ color: '#EF4444' }} />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Couldn&apos;t load this group</h1>
          <p className="text-gray-500 mb-6">{error || 'Could not load this group.'}</p>
          <button onClick={() => void loadData()} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>{group.name} — PadiHub</title>
        <meta name="description" content={group.description || `Manage ${group.name} on PadiHub.`} />
        <link rel="canonical" href={`https://padihub.com/savings-groups/${group.id}`} />
        <meta property="og:title" content={`${group.name} — PadiHub`} />
        <meta property="og:description" content="The trusted community savings platform. Save together, grow together and belong." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://padihub.com/savings-groups/${group.id}`} />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="mb-4">
            <Link to="/savings-groups" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back to my groups
            </Link>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-20" style={{ background: groupColor }} />
            <div className="relative">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-3xl flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)`, boxShadow: `0 4px 20px ${groupColor}40` }}>
                    <PiggyBank size={24} color="#fff" />
                  </div>
                  <div>
                    <h1 className="text-xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.name}</h1>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {titleCase(group.status)} · {group.currency} · Created {formatDate(group.created_at)}
                    </p>
                  </div>
                </div>
                {group.status === 'draft' ? (
                  group.leader_id === currentUserId ? (
                    <button
                      onClick={() => void handleActivateGroup()}
                      disabled={activating || activeMembers.length < GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                      style={{
                        background: activating || activeMembers.length < GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH ? '#4B5563' : `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)`,
                        cursor: activating || activeMembers.length < GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH ? 'not-allowed' : 'pointer',
                      }}
                      title={activeMembers.length < GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH
                        ? `Needs at least ${GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH} verified members (${activeMembers.length} of ${GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH} so far)`
                        : undefined}
                    >
                      <PlayCircle size={14} /> {activating ? 'Starting…' : `Start Group (${activeMembers.length}/${GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH})`}
                    </button>
                  ) : (
                    <span className="px-4 py-2.5 rounded-xl text-xs font-bold" style={{ background: 'rgba(139,92,246,0.15)', color: '#C4B5FD' }}>
                      Waiting to start · {activeMembers.length} of {GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH} verified members
                    </span>
                  )
                ) : (
                  <Link to={`/savings-groups/${group.id}/contribute`} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{ background: `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)` }}>
                    <PiggyBank size={14} /> Make Payment
                  </Link>
                )}
              </div>
              {group.status === 'draft' && activateError && (
                <div className="rounded-xl p-2.5 text-xs font-semibold flex items-center gap-2 mb-3" style={{ background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}>
                  <AlertTriangle size={13} /> {activateError}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Contribution', value: formatCurrency(group.contribution_amount, group.currency), color: groupColor },
                  { label: 'Frequency', value: titleCase(group.contribution_frequency), color: '#2eafaf' },
                  { label: 'Active members', value: `${activeMembers.length}/${group.maximum_members}`, color: '#8B5CF6' },
                  { label: 'Current cycle', value: group.current_cycle.toString(), color: '#F59E0B' },
                ].map(stat => (
                  <div key={stat.label} className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <p className="text-lg font-black" style={{ color: stat.color, fontFamily: 'Nunito, sans-serif' }}>{stat.value}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex justify-between text-xs mb-2">
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>Group occupancy</span>
                  <span className="font-bold" style={{ color: groupColor }}>{occupancyPercentage}% full</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${occupancyPercentage}%`, background: `linear-gradient(90deg, ${groupColor}, #F59E0B)` }} />
                </div>
                <div className="flex items-center justify-between mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <span>Rotation method: {describeRotationMethod(group.rotation_method)}</span>
                  <span>Position {group.current_rotation_position}</span>
                </div>
              </div>

              <div className="flex gap-2 mt-4 flex-wrap">
                <button onClick={openInviteModal} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)' }}>
                  <UserPlus size={12} /> Invite
                </button>
                <button onClick={openInviteModal} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)' }}>
                  <Share2 size={12} /> Share
                </button>
                <Link to={`/savings-groups/${group.id}/leave`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)' }}>
                  <LogOut size={12} /> Leave
                </Link>
              </div>
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="flex gap-1 p-1 rounded-2xl mb-6" style={{ background: '#F3F4F6' }}>
            {tabs.map(currentTab => (
              <button
                key={currentTab.key}
                onClick={() => setTab(currentTab.key)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: tab === currentTab.key ? '#fff' : 'transparent',
                  color: tab === currentTab.key ? '#1A1A2E' : '#6B7280',
                  boxShadow: tab === currentTab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {currentTab.label}
              </button>
            ))}
          </MotionDiv>

          <AnimatePresence mode="wait">
            <MotionDiv key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {tab === 'overview' && (
                <div className="flex flex-col gap-5">
                  <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Group Details</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { label: 'Description', value: group.description || 'No description added yet.' },
                        { label: 'Leader', value: group.leader_id === currentUserId ? 'You' : shortId(group.leader_id) },
                        { label: 'Country', value: group.country === 'NG' ? 'Nigeria' : 'United Kingdom' },
                        { label: 'Payment provider', value: titleCase(group.payment_provider) },
                        { label: 'Created', value: formatDate(group.created_at) },
                        { label: 'Last updated', value: formatDate(group.updated_at) },
                      ].map(row => (
                        <div key={row.label} className="rounded-2xl p-3" style={{ background: '#F9FAFB' }}>
                          <p className="text-xs text-gray-400 mb-1">{row.label}</p>
                          <p className="text-sm font-semibold text-gray-800 break-words">{row.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Rotation — Who&apos;s Next</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-2xl p-4" style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.15)' }}>
                        <p className="text-xs text-gray-400 mb-1">Receiving this cycle (cycle {group.current_cycle})</p>
                        {currentRotation ? (
                          <>
                            <p className="text-lg font-black text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                              {currentRotation.recipient_id === currentUserId ? 'You' : shortId(currentRotation.recipient_id)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {titleCase(currentRotation.payout_status)} · Scheduled {formatDate(currentRotation.scheduled_payout_date)}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-500">Not yet scheduled.</p>
                        )}
                      </div>
                      <div className="rounded-2xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                        <p className="text-xs text-gray-400 mb-1">Up next (cycle {nextRotation?.cycle_number ?? group.current_cycle + 1})</p>
                        {nextRotation ? (
                          <p className="text-lg font-black text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                            {nextRotation.recipient_id === currentUserId ? 'You' : shortId(nextRotation.recipient_id)}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500">Not enough active members yet.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Membership Summary</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      {[
                        { label: 'Active', value: membershipSummary.active.toString(), color: '#2EAF6F' },
                        { label: 'Pending', value: membershipSummary.pending.toString(), color: '#2eafaf' },
                        { label: 'Suspended', value: membershipSummary.suspended.toString(), color: '#F59E0B' },
                        { label: 'Removed', value: membershipSummary.removed.toString(), color: '#EF4444' },
                      ].map(summary => (
                        <div key={summary.label} className="rounded-2xl p-4 text-center" style={{ background: '#F9FAFB' }}>
                          <p className="text-2xl font-black mb-0.5" style={{ color: summary.color, fontFamily: 'Nunito, sans-serif' }}>{summary.value}</p>
                          <p className="text-xs text-gray-400">{summary.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl p-4" style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.15)' }}>
                        <p className="text-xs text-gray-400 mb-1">Current cycle</p>
                        <p className="text-lg font-black text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.current_cycle}</p>
                      </div>
                      <div className="rounded-2xl p-4" style={{ background: 'rgba(46,175,175,0.06)', border: '1px solid rgba(46,175,175,0.15)' }}>
                        <p className="text-xs text-gray-400 mb-1">Current rotation position</p>
                        <p className="text-lg font-black text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.current_rotation_position}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'members' && (
                <div className="flex flex-col gap-3">
                  {orderedMembers.length === 0 ? (
                    <div className="rounded-3xl p-6 bg-white text-center" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                      <Users size={24} className="mx-auto mb-3" style={{ color: '#9CA3AF' }} />
                      <h2 className="text-lg font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>No member records yet</h2>
                      <p className="text-sm text-gray-500">Members will appear here once the group has active memberships.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {membershipActionError && (
                        <div className="rounded-2xl p-3 text-sm font-semibold flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', color: '#B91C1C', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <AlertTriangle size={15} /> {membershipActionError}
                        </div>
                      )}
                      {orderedMembers.map((member, index) => {
                        const badge = getMembershipBadge(member.status);
                        const displayName = member.user_id === currentUserId ? 'You' : `Member ${index + 1}`;
                        const isLeaderViewing = group.leader_id === currentUserId;
                        const actionBusy = membershipActionId === member.id;

                        return (
                          <div key={member.id} className="rounded-2xl p-4 bg-white flex items-center gap-4 flex-wrap" style={{ border: '1px solid #F3F4F6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                            <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)` }}>
                              {displayName[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-gray-900 text-sm">{displayName}</p>
                                {member.role === 'leader' && <CheckCircle size={13} style={{ color: '#2EAF6F' }} />}
                              </div>
                              <p className="text-xs text-gray-400 break-all">
                                {titleCase(member.role)} · Position {member.rotation_order ?? '—'} · {shortId(member.user_id)}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>
                                {titleCase(member.status)}
                              </span>
                              <p className="text-xs text-gray-400 mt-1">{member.strike_count} strike{member.strike_count === 1 ? '' : 's'}</p>
                            </div>
                            {isLeaderViewing && member.status === 'pending' && (
                              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                                <button
                                  onClick={() => void handleMembershipDecision(member.id, 'approve')}
                                  disabled={actionBusy}
                                  className="flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-bold text-white"
                                  style={{ background: actionBusy ? '#D1D5DB' : 'linear-gradient(135deg, #2EAF6F, #1d8a55)', cursor: actionBusy ? 'not-allowed' : 'pointer' }}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => void handleMembershipDecision(member.id, 'reject')}
                                  disabled={actionBusy}
                                  className="flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-bold"
                                  style={{ background: '#FEE2E2', color: '#B91C1C', cursor: actionBusy ? 'not-allowed' : 'pointer' }}
                                >
                                  Decline
                                </button>
                                {activeMembers.length > 1 && (
                                  <button
                                    onClick={() => void handleProposeAdmission(member.id)}
                                    disabled={admissionVoteId === member.id}
                                    title="Put this admission to a unanimous vote of every active member instead of deciding yourself"
                                    className="flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-bold"
                                    style={{ background: 'rgba(139,92,246,0.12)', color: '#7C3AED', cursor: admissionVoteId === member.id ? 'not-allowed' : 'pointer' }}
                                  >
                                    {admissionVoteId === member.id ? 'Starting vote…' : 'Put to a vote'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {(admissionVoteError || admissionVoteNotice) && (
                        <p className="text-xs font-semibold" style={{ color: admissionVoteError ? '#B91C1C' : '#2EAF6F' }}>
                          {admissionVoteError || admissionVoteNotice}
                        </p>
                      )}
                    </div>
                  )}

                  {group.allow_payout_swaps && (
                    <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <RefreshCw size={16} style={{ color: '#2eafaf' }} />
                        <h2 className="font-extrabold text-gray-900 text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>Payout schedule swaps</h2>
                      </div>

                      {currentMembership?.status === 'active' && (
                        <div className="flex flex-col gap-3 mb-4">
                          <p className="text-xs text-gray-500">Propose swapping your payout position with another active member. Group members will vote to approve it.</p>
                          {swapError && (
                            <div className="rounded-xl p-2.5 text-xs font-semibold flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', color: '#B91C1C' }}>
                              <AlertTriangle size={13} /> {swapError}
                            </div>
                          )}
                          {swapNotice && (
                            <div className="rounded-xl p-2.5 text-xs font-semibold flex items-center gap-2" style={{ background: 'rgba(46,175,111,0.08)', color: '#1d8a55' }}>
                              <CheckCircle size={13} /> {swapNotice}
                            </div>
                          )}
                          <div className="flex flex-col sm:flex-row gap-2">
                            <select
                              value={swapTarget}
                              onChange={event => setSwapTarget(event.target.value)}
                              className="flex-1 px-3 py-2 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-teal-400"
                            >
                              <option value="">Choose a member…</option>
                              {swapCandidates.map(candidate => (
                                <option key={candidate.id} value={candidate.user_id}>
                                  {getMemberDisplayName(candidate.user_id)} (Position {candidate.rotation_order ?? '—'})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => void handleProposeSwap()}
                              disabled={swapSubmitting || !swapTarget}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white whitespace-nowrap"
                              style={{ background: swapSubmitting || !swapTarget ? '#D1D5DB' : 'linear-gradient(135deg, #2eafaf, #1d8a8a)', cursor: swapSubmitting || !swapTarget ? 'not-allowed' : 'pointer' }}
                            >
                              {swapSubmitting ? 'Submitting…' : 'Propose swap'}
                            </button>
                          </div>
                          <input
                            value={swapNote}
                            onChange={event => setSwapNote(event.target.value)}
                            placeholder="Optional note for the group (e.g. reason for swap)"
                            className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-teal-400"
                          />
                        </div>
                      )}

                      {voteActionError && (
                        <div className="rounded-xl p-2.5 mb-3 text-xs font-semibold flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', color: '#B91C1C' }}>
                          <AlertTriangle size={13} /> {voteActionError}
                        </div>
                      )}

                      {openPayoutSwapVotes.length === 0 ? (
                        <p className="text-xs text-gray-400">No open payout swap requests right now.</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {openPayoutSwapVotes.map(vote => {
                            const { targetUserId, note } = parseSwapTarget(vote.proposal_text);
                            const busy = voteActionId === vote.id;
                            return (
                              <div key={vote.id} className="rounded-2xl p-3" style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                                <p className="text-xs font-bold text-gray-900">
                                  {getMemberDisplayName(vote.proposer_id)} wants to swap with {getMemberDisplayName(targetUserId)}
                                </p>
                                {note && <p className="text-xs text-gray-500 mt-0.5">{note}</p>}
                                <p className="text-[11px] text-gray-400 mt-1">Voting closes {formatDate(vote.voting_deadline)}</p>
                                {currentMembership?.status === 'active' && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <button
                                      onClick={() => void handleCastVote(vote.id, 'approve')}
                                      disabled={busy}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                                      style={{ background: busy ? '#D1D5DB' : 'linear-gradient(135deg, #2EAF6F, #1d8a55)', cursor: busy ? 'not-allowed' : 'pointer' }}
                                    >
                                      <ThumbsUp size={12} /> Approve
                                    </button>
                                    <button
                                      onClick={() => void handleCastVote(vote.id, 'reject')}
                                      disabled={busy}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold"
                                      style={{ background: '#FEE2E2', color: '#B91C1C', cursor: busy ? 'not-allowed' : 'pointer' }}
                                    >
                                      <ThumbsDown size={12} /> Reject
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {currentMembership?.status === 'active' && (
                    <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <Shield size={16} style={{ color: '#8B5CF6' }} />
                        <h2 className="font-extrabold text-gray-900 text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>Governance votes</h2>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        New-member admissions, contribution-increase requests, and member-removal proposals require a unanimous accept from every other active member within 48 hours.
                      </p>

                      {currentMembership?.status === 'active' && (
                        <div className="rounded-2xl p-3 mb-4" style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                          <p className="text-xs font-bold text-gray-900 mb-2">Propose removing a member</p>
                          <p className="text-[11px] text-gray-400 mb-2">Every other active member must unanimously agree. The member currently due this cycle&apos;s payout can&apos;t be targeted until they&apos;ve received it.</p>
                          {removalError && (
                            <div className="rounded-xl p-2.5 mb-2 text-xs font-semibold flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', color: '#B91C1C' }}>
                              <AlertTriangle size={13} /> {removalError}
                            </div>
                          )}
                          {removalNotice && (
                            <div className="rounded-xl p-2.5 mb-2 text-xs font-semibold flex items-center gap-2" style={{ background: 'rgba(46,175,111,0.08)', color: '#1d8a55' }}>
                              <CheckCircle size={13} /> {removalNotice}
                            </div>
                          )}
                          <div className="flex flex-col sm:flex-row gap-2">
                            <select
                              value={removalTarget}
                              onChange={event => setRemovalTarget(event.target.value)}
                              className="flex-1 px-3 py-2 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-purple-400"
                            >
                              <option value="">Choose a member…</option>
                              {swapCandidates.map(candidate => (
                                <option key={candidate.id} value={candidate.user_id}>
                                  {getMemberDisplayName(candidate.user_id)}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => void handleProposeRemoval()}
                              disabled={removalSubmitting || !removalTarget}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white whitespace-nowrap"
                              style={{ background: removalSubmitting || !removalTarget ? '#D1D5DB' : 'linear-gradient(135deg, #8B5CF6, #6D28D9)', cursor: removalSubmitting || !removalTarget ? 'not-allowed' : 'pointer' }}
                            >
                              {removalSubmitting ? 'Submitting…' : 'Start removal vote'}
                            </button>
                          </div>
                          <input
                            value={removalReason}
                            onChange={event => setRemovalReason(event.target.value)}
                            placeholder="Optional reason for the group"
                            className="w-full mt-2 px-3 py-2 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-purple-400"
                          />
                        </div>
                      )}

                      {group.leader_id === currentUserId && (
                        <div className="rounded-2xl p-3 mb-4" style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                          <p className="text-xs font-bold text-gray-900 mb-2">Propose a contribution increase</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={claimAmount}
                              onChange={event => setClaimAmount(event.target.value)}
                              placeholder={`New amount (${group.currency})`}
                              className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-purple-400 transition-colors"
                            />
                            <button
                              onClick={() => void handleProposeClaim()}
                              disabled={claimSubmitting}
                              className="px-3 py-2 rounded-xl text-xs font-bold text-white"
                              style={{ background: claimSubmitting ? '#D1D5DB' : 'linear-gradient(135deg, #8B5CF6, #6D28D9)', cursor: claimSubmitting ? 'not-allowed' : 'pointer' }}
                            >
                              {claimSubmitting ? 'Submitting…' : 'Propose'}
                            </button>
                          </div>
                          {claimError && <p className="text-xs font-semibold mt-2" style={{ color: '#B91C1C' }}>{claimError}</p>}
                          {claimNotice && <p className="text-xs font-semibold mt-2" style={{ color: '#2EAF6F' }}>{claimNotice}</p>}
                        </div>
                      )}

                      {openGovernanceVotes.length === 0 ? (
                        <p className="text-xs text-gray-400">No open governance votes right now.</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {openGovernanceVotes.map(vote => {
                            const busy = voteActionId === vote.id;
                            const isTargetOfRemoval = vote.proposal_type === 'member_removal' && vote.target_member_id === currentUserId;
                            return (
                              <div key={vote.id} className="rounded-2xl p-3" style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                                <p className="text-xs font-bold text-gray-900">{describeGovernanceVote(vote)}</p>
                                <p className="text-[11px] text-gray-400 mt-1">Voting closes {formatDate(vote.voting_deadline)}</p>
                                {isTargetOfRemoval ? (
                                  <p className="text-[11px] font-semibold mt-2" style={{ color: '#B91C1C' }}>A vote to remove you from this group is open — you can&apos;t vote on your own removal.</p>
                                ) : (
                                  <div className="flex items-center gap-2 mt-2">
                                    <button
                                      onClick={() => void handleCastVote(vote.id, 'approve')}
                                      disabled={busy}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                                      style={{ background: busy ? '#D1D5DB' : 'linear-gradient(135deg, #2EAF6F, #1d8a55)', cursor: busy ? 'not-allowed' : 'pointer' }}
                                    >
                                      <ThumbsUp size={12} /> Accept
                                    </button>
                                    <button
                                      onClick={() => void handleCastVote(vote.id, 'reject')}
                                      disabled={busy}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold"
                                      style={{ background: '#FEE2E2', color: '#B91C1C', cursor: busy ? 'not-allowed' : 'pointer' }}
                                    >
                                      <ThumbsDown size={12} /> Decline
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {voteActionError && (
                        <div className="rounded-xl p-2.5 text-xs font-semibold flex items-center gap-2 mt-3" style={{ background: 'rgba(239,68,68,0.08)', color: '#B91C1C' }}>
                          <AlertTriangle size={13} /> {voteActionError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {tab === 'activity' && (
                contributions.length === 0 ? (
                  <div className="rounded-3xl p-6 bg-white text-center" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <TrendingUp size={24} className="mx-auto mb-3" style={{ color: '#9CA3AF' }} />
                    <h2 className="text-lg font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>No contribution activity yet</h2>
                    <p className="text-sm text-gray-500">Once contribution schedules or payments exist for this group, they&apos;ll appear here.</p>
                  </div>
                ) : (
                  <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <h2 className="font-extrabold text-gray-900 mb-5" style={{ fontFamily: 'Nunito, sans-serif' }}>Contribution Activity</h2>
                    <div className="flex flex-col">
                      {contributions.map((entry, index) => {
                        const meta = getContributionMeta(entry.payment_status);
                        const Icon = meta.icon;
                        const activityDate = entry.paid_date || entry.due_date;
                        const amount = entry.payment_status === 'paid' && entry.amount_paid ? entry.amount_paid : entry.amount_due;

                        return (
                          <div key={entry.id} className="flex items-start gap-4 relative">
                            {index < contributions.length - 1 && <div className="absolute left-5 top-10 bottom-0 w-0.5" style={{ background: '#F3F4F6' }} />}
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 bg-white" style={{ border: `2px solid ${meta.color}30` }}>
                              <Icon size={15} style={{ color: meta.color }} />
                            </div>
                            <div className="flex-1 pb-5">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">Cycle {entry.cycle_number} · {meta.label}</p>
                                  <p className="text-xs text-gray-400 break-all">Member {shortId(entry.member_id)}</p>
                                  {entry.payment_status === 'pending_default' && entry.grace_period_ends_at && (
                                    <p className="text-xs font-semibold mt-0.5" style={{ color: '#F59E0B' }}>
                                      One automatic retry on {formatDate(entry.grace_period_ends_at)} before this is marked in default
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold" style={{ color: meta.color }}>{formatCurrency(amount, group.currency)}</p>
                                  <span className="text-xs text-gray-400">{formatDate(activityDate)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}

              {tab === 'rules' && (
                <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <h2 className="font-extrabold text-gray-900 mb-5" style={{ fontFamily: 'Nunito, sans-serif' }}>Group Rules</h2>
                  <div className="flex flex-col gap-4">
                    {[
                      { icon: AlertTriangle, color: '#EF4444', label: 'Strike threshold', value: `${group.strike_threshold} missed payment${group.strike_threshold === 1 ? '' : 's'} before warning` },
                      { icon: Clock, color: '#F59E0B', label: 'Suspension threshold', value: `${group.suspension_threshold} missed payment${group.suspension_threshold === 1 ? '' : 's'} before suspension` },
                      { icon: Users, color: '#8B5CF6', label: 'Voting threshold', value: `${group.voting_threshold}% approval required` },
                      { icon: TrendingUp, color: '#2EAF6F', label: 'Payout swaps', value: group.allow_payout_swaps ? 'Allowed' : 'Not allowed' },
                      { icon: Shield, color: '#2eafaf', label: 'Rotation method', value: describeRotationMethod(group.rotation_method) },
                    ].map(rule => (
                      <div key={rule.label} className="flex items-start gap-4 p-4 rounded-2xl" style={{ background: '#F9FAFB' }}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${rule.color}15` }}>
                          <rule.icon size={18} style={{ color: rule.color }} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">{rule.label}</p>
                          <p className="text-sm font-semibold text-gray-800">{rule.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </MotionDiv>
          </AnimatePresence>
        </MotionDiv>
      </div>

      <AnimatePresence>
        {inviteOpen && (
          <>
            <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={closeInviteModal} />
            <MotionDiv initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ type: 'spring', stiffness: 350, damping: 28 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-md pointer-events-auto relative">
                <h2 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Invite members</h2>
                <p className="text-sm text-gray-500 mb-5">Enter an email to send a direct invite, or leave it blank to create a shareable link.</p>

                {inviteError && (
                  <div style={{ borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 500, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', marginBottom: 16 }}>
                    {inviteError}
                  </div>
                )}

                {inviteNotice && (
                  <div style={{ borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 500, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', marginBottom: 16 }}>
                    {inviteNotice}
                  </div>
                )}

                <label className="block text-sm font-bold text-gray-700 mb-1.5">Email address <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="name@example.com" type="email" className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors mb-4" />

                {inviteLink && (
                  <div className="rounded-2xl p-4 mb-4" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                    <p className="text-xs text-gray-400 mb-2">Shareable link</p>
                    <div className="rounded-xl bg-white border border-gray-200 px-3 py-2 text-xs text-gray-600 break-all mb-3">{inviteLink}</div>
                    {inviteToken && <p className="text-xs text-gray-400 mb-3">Invite token: <span className="font-semibold text-gray-600">{inviteToken}</span></p>}
                    <Button onClick={() => void handleCopyLink()} variant="outline" className="w-full rounded-2xl font-semibold gap-2">
                      <Copy size={14} /> Copy link
                    </Button>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={closeInviteModal} className="flex-1 rounded-2xl font-semibold">Close</Button>
                  <Button onClick={() => void handleCreateInvite()} disabled={inviteLoading} className="flex-1 rounded-2xl font-bold" style={{ background: '#2EAF6F', color: '#fff' }}>
                    {inviteLoading ? 'Sending…' : inviteEmail.trim() ? 'Send invite' : 'Create link'}
                  </Button>
                </div>
              </div>
            </MotionDiv>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
