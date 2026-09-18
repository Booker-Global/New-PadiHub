import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  selectResponses: [] as unknown[],
  updatePayloads: [] as unknown[],
  flutterwaveCreateTransfer: vi.fn(),
  stripeCreateTransfer: vi.fn(),
  refreshStripePayoutVerification: vi.fn(),
  notificationCreate: vi.fn(),
  trustScoreIncrease: vi.fn(),
  monitoringLogError: vi.fn(),
  createAuditLog: vi.fn(),
  sendPayoutCompleteEmail: vi.fn(),
  sendUpcomingPayoutEmail: vi.fn(),
  sendGroupClosedEmail: vi.fn(),
  sendGroupLeaderActivityEmail: vi.fn(),
  sendPayoutTransferFailedAlertEmail: vi.fn(),
  sendPayoutDelayedEmail: vi.fn(),
  sendReducedPayoutSentEmail: vi.fn(),
  getCyclePotAmount: vi.fn(),
  getCycleResolutionStatus: vi.fn(),
  getPaidContributionsForCycle: vi.fn(),
  computeNextPayoutDate: vi.fn(),
  reorderRotationByTrustScore: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: vi.fn(() => {
      const response = mockState.selectResponses.shift();
      if (response === undefined) throw new Error('No mocked db.select response remaining.');
      const query = Promise.resolve(response) as Promise<unknown[]> & {
        limit: () => Promise<unknown[]>;
      };
      query.limit = vi.fn(async () => response as unknown[]);
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => query),
        })),
      };
    }),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => {
        mockState.updatePayloads.push(values);
        return { where: vi.fn(async () => undefined) };
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async () => undefined),
    })),
  },
}));

vi.mock('../middleware/auditLogger.js', () => ({ createAuditLog: mockState.createAuditLog }));
vi.mock('../services/notificationService.js', () => ({ notificationService: { create: mockState.notificationCreate } }));
vi.mock('../services/trustScoreService.js', () => ({ trustScoreService: { increase: mockState.trustScoreIncrease } }));
vi.mock('../services/monitoringService.js', () => ({ monitoringService: { logError: mockState.monitoringLogError } }));
vi.mock('../services/groupService.js', () => ({ groupService: { reorderRotationByTrustScore: mockState.reorderRotationByTrustScore } }));
vi.mock('../integrations/payments/PaymentProviderFactory.js', () => ({
  getStripeProvider: vi.fn(() => ({ createTransfer: mockState.stripeCreateTransfer })),
  getFlutterwaveProvider: vi.fn(() => ({ createTransfer: mockState.flutterwaveCreateTransfer })),
}));
vi.mock('../integrations/email/emailService.js', () => ({
  sendUpcomingPayoutEmail: mockState.sendUpcomingPayoutEmail,
  sendPayoutCompleteEmail: mockState.sendPayoutCompleteEmail,
  sendGroupClosedEmail: mockState.sendGroupClosedEmail,
  sendGroupLeaderActivityEmail: mockState.sendGroupLeaderActivityEmail,
  sendPayoutTransferFailedAlertEmail: mockState.sendPayoutTransferFailedAlertEmail,
  sendPayoutDelayedEmail: mockState.sendPayoutDelayedEmail,
  sendReducedPayoutSentEmail: mockState.sendReducedPayoutSentEmail,
  p: (value: string) => value,
  table: (value: string) => value,
  detail: (label: string, value: string) => `${label}: ${value}`,
}));
vi.mock('../services/contributionService.js', () => ({
  contributionService: {
    getCyclePotAmount: mockState.getCyclePotAmount,
    getCycleResolutionStatus: mockState.getCycleResolutionStatus,
    getPaidContributionsForCycle: mockState.getPaidContributionsForCycle,
  },
}));
vi.mock('../services/paymentEligibilityService.js', () => ({
  refreshStripePayoutVerification: mockState.refreshStripePayoutVerification,
}));
vi.mock('../lib/constants.js', () => ({
  TRUST_SCORE_DELTA_CYCLE_COMPLETED: 3,
  resolveUserDisplayName: (user: { display_name?: string | null; first_name: string; last_name: string }) => user.display_name ?? `${user.first_name} ${user.last_name}`,
  UPCOMING_PAYOUT_REMINDER_ADVANCE_DAYS: 7,
}));
vi.mock('../lib/payoutSchedule.js', () => ({ computeNextPayoutDate: mockState.computeNextPayoutDate }));

const { rotationService } = await import('../services/rotationService.js');

describe('rotationService', () => {
  beforeEach(() => {
    mockState.selectResponses.length = 0;
    mockState.updatePayloads.length = 0;
    vi.clearAllMocks();
    mockState.getCyclePotAmount.mockResolvedValue(3000);
    mockState.getPaidContributionsForCycle.mockResolvedValue([]);
    mockState.computeNextPayoutDate.mockReturnValue(new Date('2026-10-01T00:00:00Z'));
    mockState.refreshStripePayoutVerification.mockResolvedValue(false);
  });

  describe('getCurrent', () => {
    it('should return the current rotation for a group', async () => {
      // TODO: mock db.select, assert rotation returned
    });
    it('should return null if no rotation exists', async () => {
      // TODO: assert null returned
    });
  });

  describe('getNext', () => {
    it('should return the next recipient based on rotation_order', async () => {
      // TODO: mock memberships, assert next recipient ID correct
    });
    it('should wrap around to first member after last', async () => {
      // TODO: assert cycle wraps correctly
    });
  });

  describe('getPrevious', () => {
    it('should return the rotation from the previous cycle', async () => {
      // TODO: mock db.select with cycle_number - 1
    });
  });

  describe('advance', () => {
    it('should attempt a Flutterwave transfer before completing an NG payout', async () => {
      mockState.selectResponses.push(
        [{
          id: 'group-1',
          name: 'Lagos Circle',
          payment_provider: 'flutterwave',
          currency: 'NGN',
          contribution_amount: '1500.00',
          current_cycle: 1,
          current_rotation_position: 1,
          contribution_frequency: 'monthly',
          payout_day: 15,
          leader_id: 'user-1',
          full_rotations_completed: 0,
          group_duration_type: 'indefinite',
          group_duration_rotations: null,
          closure_scheduled: false,
        }],
        [{
          stripe_connected_account_id: null,
          flutterwave_payout_bank_code: '044',
          flutterwave_payout_account_number: '1234567890',
          payout_verified_at: new Date('2026-09-01T00:00:00Z'),
          first_name: 'Ada',
          last_name: 'Okafor',
        }],
        [{
          email: 'ada@example.com',
          display_name: null,
          first_name: 'Ada',
          last_name: 'Okafor',
        }],
        [{
          name: 'Lagos Circle',
          contribution_amount: '1500.00',
          currency: 'NGN',
          leader_id: 'user-1',
        }],
        [
          { user_id: 'user-1', rotation_order: 1, status: 'active' },
          { user_id: 'user-2', rotation_order: 2, status: 'active' },
        ],
      );
      mockState.flutterwaveCreateTransfer.mockResolvedValue({
        providerTransferReference: 'flw-transfer-1',
        status: 'completed',
      });
      mockState.getCycleResolutionStatus.mockResolvedValue({
        totalCount: 2,
        paidCount: 2,
        resolvedFailureCount: 0,
        unresolvedCount: 0,
        resolved: true,
        hadAnyFailure: false,
        collectedAmount: 3000,
      });

      const currentRotation = {
        id: 'rotation-1',
        group_id: 'group-1',
        cycle_number: 1,
        recipient_id: 'user-1',
        payout_status: 'processing',
        provider_transfer_reference: null,
      };
      const getCurrentSpy = vi.spyOn(rotationService, 'getCurrent').mockResolvedValue(currentRotation as never);
      const createForCycleSpy = vi.spyOn(rotationService, 'createForCycle').mockResolvedValue('rotation-2');

      const result = await rotationService.advance('group-1', 'actor-1');

      expect(mockState.flutterwaveCreateTransfer).toHaveBeenCalledWith({
        recipientAccountId: '1234567890',
        amount: 300000,
        currency: 'NGN',
        rotationId: 'rotation-1',
        description: 'PadiHub payout — Lagos Circle cycle 1',
        recipientBankCode: '044',
        recipientAccountNumber: '1234567890',
        recipientName: 'Ada Okafor',
      });
      expect(mockState.updatePayloads).toContainEqual({
        payout_status: 'completed',
        completed_date: expect.any(Date),
        provider_transfer_reference: 'flw-transfer-1',
      });
      expect(createForCycleSpy).toHaveBeenCalledWith('group-1', 2, 'user-2', new Date('2026-10-01T00:00:00Z'));
      expect(result).toEqual({ nextCycle: 2, nextRecipient: 'user-2' });

      getCurrentSpy.mockRestore();
      createForCycleSpy.mockRestore();
    });

    it('should self-heal payout_verified_at via a live Stripe check before failing a transfer', async () => {
      mockState.selectResponses.push(
        [{
          id: 'group-2',
          name: 'London Circle',
          payment_provider: 'stripe',
          currency: 'GBP',
          contribution_amount: '50.00',
          current_cycle: 1,
          current_rotation_position: 1,
          contribution_frequency: 'monthly',
          payout_day: 15,
          leader_id: 'user-1',
          full_rotations_completed: 0,
          group_duration_type: 'indefinite',
          group_duration_rotations: null,
          closure_scheduled: false,
        }],
        [{
          stripe_connected_account_id: 'acct_123',
          flutterwave_payout_bank_code: null,
          flutterwave_payout_account_number: null,
          // Never recorded — e.g. the account.updated webhook was missed —
          // so this must be re-checked live with Stripe rather than
          // immediately failing the transfer.
          payout_verified_at: null,
          first_name: 'Ben',
          last_name: 'Okoro',
        }],
        [{
          email: 'ben@example.com',
          display_name: null,
          first_name: 'Ben',
          last_name: 'Okoro',
        }],
        [{
          name: 'London Circle',
          contribution_amount: '50.00',
          currency: 'GBP',
          leader_id: 'user-1',
        }],
        [
          { user_id: 'user-1', rotation_order: 1, status: 'active' },
          { user_id: 'user-2', rotation_order: 2, status: 'active' },
        ],
      );
      mockState.refreshStripePayoutVerification.mockResolvedValue(true);
      mockState.stripeCreateTransfer.mockResolvedValue({
        providerTransferReference: 'tr_123',
        status: 'completed',
      });
      mockState.getCycleResolutionStatus.mockResolvedValue({
        totalCount: 2,
        paidCount: 2,
        resolvedFailureCount: 0,
        unresolvedCount: 0,
        resolved: true,
        hadAnyFailure: false,
        collectedAmount: 100,
      });

      const currentRotation = {
        id: 'rotation-5',
        group_id: 'group-2',
        cycle_number: 1,
        recipient_id: 'user-1',
        payout_status: 'processing',
        provider_transfer_reference: null,
      };
      const getCurrentSpy = vi.spyOn(rotationService, 'getCurrent').mockResolvedValue(currentRotation as never);
      const createForCycleSpy = vi.spyOn(rotationService, 'createForCycle').mockResolvedValue('rotation-6');

      const result = await rotationService.advance('group-2', 'actor-1');

      expect(mockState.refreshStripePayoutVerification).toHaveBeenCalledWith({
        id: 'user-1',
        payout_verified_at: null,
        stripe_connected_account_id: 'acct_123',
      });
      expect(mockState.stripeCreateTransfer).toHaveBeenCalledWith({
        recipientAccountId: 'acct_123',
        amount: 10000,
        currency: 'GBP',
        rotationId: 'rotation-5',
        description: 'PadiHub payout — London Circle cycle 1',
      });
      expect(mockState.updatePayloads).toContainEqual({
        payout_status: 'completed',
        completed_date: expect.any(Date),
        provider_transfer_reference: 'tr_123',
      });
      expect(result).toEqual({ nextCycle: 2, nextRecipient: 'user-2' });

      getCurrentSpy.mockRestore();
      createForCycleSpy.mockRestore();
    });

    it('should send one Stripe transfer per funding charge, linked via source_transaction', async () => {
      mockState.selectResponses.push(
        [{
          id: 'group-2b',
          name: 'Bristol Circle',
          payment_provider: 'stripe',
          currency: 'GBP',
          contribution_amount: '50.00',
          current_cycle: 1,
          current_rotation_position: 1,
          contribution_frequency: 'monthly',
          payout_day: 15,
          leader_id: 'user-1',
          full_rotations_completed: 0,
          group_duration_type: 'indefinite',
          group_duration_rotations: null,
          closure_scheduled: false,
        }],
        [{
          stripe_connected_account_id: 'acct_789',
          flutterwave_payout_bank_code: null,
          flutterwave_payout_account_number: null,
          payout_verified_at: new Date('2026-09-01T00:00:00Z'),
          first_name: 'Dee',
          last_name: 'Adams',
        }],
        [{
          email: 'dee@example.com',
          display_name: null,
          first_name: 'Dee',
          last_name: 'Adams',
        }],
        [{
          name: 'Bristol Circle',
          contribution_amount: '50.00',
          currency: 'GBP',
          leader_id: 'user-1',
        }],
        [
          { user_id: 'user-1', rotation_order: 1, status: 'active' },
          { user_id: 'user-2', rotation_order: 2, status: 'active' },
        ],
      );
      mockState.getCycleResolutionStatus.mockResolvedValue({
        totalCount: 2,
        paidCount: 2,
        resolvedFailureCount: 0,
        unresolvedCount: 0,
        resolved: true,
        hadAnyFailure: false,
        collectedAmount: 100,
      });
      mockState.getPaidContributionsForCycle.mockResolvedValue([
        { id: 'contrib-1', memberId: 'user-1', amountPaidMinorUnits: 5000, providerChargeId: 'ch_111' },
        { id: 'contrib-2', memberId: 'user-2', amountPaidMinorUnits: 5000, providerChargeId: 'ch_222' },
      ]);
      mockState.stripeCreateTransfer
        .mockResolvedValueOnce({ providerTransferReference: 'tr_from_ch_111', status: 'completed' })
        .mockResolvedValueOnce({ providerTransferReference: 'tr_from_ch_222', status: 'completed' });

      const currentRotation = {
        id: 'rotation-5b',
        group_id: 'group-2b',
        cycle_number: 1,
        recipient_id: 'user-1',
        payout_status: 'processing',
        provider_transfer_reference: null,
      };
      const getCurrentSpy = vi.spyOn(rotationService, 'getCurrent').mockResolvedValue(currentRotation as never);
      const createForCycleSpy = vi.spyOn(rotationService, 'createForCycle').mockResolvedValue('rotation-6b');

      const result = await rotationService.advance('group-2b', 'actor-1');

      expect(mockState.stripeCreateTransfer).toHaveBeenNthCalledWith(1, {
        recipientAccountId: 'acct_789',
        amount: 5000,
        currency: 'GBP',
        rotationId: 'rotation-5b',
        description: 'PadiHub payout — Bristol Circle cycle 1',
        sourceChargeId: 'ch_111',
        transferGroup: 'rotation-5b',
        idempotencyKey: 'transfer-rotation-5b-contrib-1',
      });
      expect(mockState.stripeCreateTransfer).toHaveBeenNthCalledWith(2, {
        recipientAccountId: 'acct_789',
        amount: 5000,
        currency: 'GBP',
        rotationId: 'rotation-5b',
        description: 'PadiHub payout — Bristol Circle cycle 1',
        sourceChargeId: 'ch_222',
        transferGroup: 'rotation-5b',
        idempotencyKey: 'transfer-rotation-5b-contrib-2',
      });
      expect(mockState.stripeCreateTransfer).toHaveBeenCalledTimes(2);
      expect(mockState.updatePayloads).toContainEqual({
        payout_status: 'completed',
        completed_date: expect.any(Date),
        provider_transfer_reference: 'tr_from_ch_111,tr_from_ch_222',
      });
      expect(result).toEqual({ nextCycle: 2, nextRecipient: 'user-2' });

      getCurrentSpy.mockRestore();
      createForCycleSpy.mockRestore();
    });

    it('should fail the transfer when the live Stripe self-heal check still finds an unverified account', async () => {
      mockState.selectResponses.push(
        [{
          id: 'group-3',
          name: 'Manchester Circle',
          payment_provider: 'stripe',
          currency: 'GBP',
          contribution_amount: '50.00',
          current_cycle: 1,
          current_rotation_position: 1,
          contribution_frequency: 'monthly',
          payout_day: 15,
          leader_id: 'user-1',
          full_rotations_completed: 0,
          group_duration_type: 'indefinite',
          group_duration_rotations: null,
          closure_scheduled: false,
        }],
        [{
          stripe_connected_account_id: 'acct_456',
          flutterwave_payout_bank_code: null,
          flutterwave_payout_account_number: null,
          payout_verified_at: null,
          first_name: 'Cara',
          last_name: 'Ade',
        }],
      );
      mockState.refreshStripePayoutVerification.mockResolvedValue(false);
      mockState.getCycleResolutionStatus.mockResolvedValue({
        totalCount: 2,
        paidCount: 2,
        resolvedFailureCount: 0,
        unresolvedCount: 0,
        resolved: true,
        hadAnyFailure: false,
        collectedAmount: 100,
      });

      const currentRotation = {
        id: 'rotation-7',
        group_id: 'group-3',
        cycle_number: 1,
        recipient_id: 'user-1',
        payout_status: 'processing',
        provider_transfer_reference: null,
      };
      const getCurrentSpy = vi.spyOn(rotationService, 'getCurrent').mockResolvedValue(currentRotation as never);

      const result = await rotationService.advance('group-3', 'actor-1');

      expect(mockState.refreshStripePayoutVerification).toHaveBeenCalledWith({
        id: 'user-1',
        payout_verified_at: null,
        stripe_connected_account_id: 'acct_456',
      });
      expect(mockState.stripeCreateTransfer).not.toHaveBeenCalled();
      expect(result).toEqual({ nextCycle: 1, nextRecipient: 'user-1', transferFailed: true });
      expect(mockState.updatePayloads).toContainEqual({ payout_status: 'failed' });

      getCurrentSpy.mockRestore();
    });

    it('should mark current rotation as completed', async () => {
      // TODO: assert payout_status = completed
    });
    it('should increase trust score by +3 for recipient', async () => {
      // TODO: assert trustScoreService.increase(recipientId, 3, CYCLE_COMPLETED)
    });
    it('should send sendPayoutCompleteEmail to recipient', async () => {
      // TODO: assert email sent
    });
    it('should create a new rotation record for the next recipient', async () => {
      // TODO: assert new rotation inserted
    });
    it('should require group_leader or admin role', async () => {
      // TODO: assert 403 for member role
    });
  });
});
