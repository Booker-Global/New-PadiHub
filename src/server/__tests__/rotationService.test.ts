import { describe, it } from 'vitest';

describe('rotationService', () => {
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
