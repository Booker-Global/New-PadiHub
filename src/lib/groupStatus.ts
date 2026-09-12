/**
 * Shared, user-facing label + colour for a savings group's lifecycle status.
 *
 * The raw `savings_groups.status` enum values ('draft' | 'active' |
 * 'suspended' | 'closed' | 'expired') are internal/legacy naming — to the
 * member, a group that dropped below the 3-member launch threshold is
 * "Inactive" (resumable if it regains members), while a group that has
 * permanently ended (fixed-rotation completion, owner deletion, or 30-day
 * auto-expiry) is "Deleted" (terminal, not resumable). Every surface that
 * shows a group's status to a member must use this helper so the wording is
 * consistent everywhere.
 */
export type SavingsGroupStatus = 'draft' | 'active' | 'suspended' | 'closed' | 'expired';

export function getGroupStatusLabel(status: SavingsGroupStatus | string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'suspended':
      return 'Inactive';
    case 'draft':
      return 'Not started yet';
    case 'closed':
    case 'expired':
      return 'Deleted';
    default:
      return 'Deleted';
  }
}

export function getGroupStatusColor(status: SavingsGroupStatus | string): string {
  switch (status) {
    case 'active':
      return '#2EAF6F';
    case 'suspended':
      return '#F59E0B';
    case 'draft':
      return '#8B5CF6';
    default:
      return '#6B7280';
  }
}
