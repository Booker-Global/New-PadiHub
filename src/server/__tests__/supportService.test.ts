import { describe, it } from 'vitest';

describe('supportController', () => {
  describe('create', () => {
    it('should insert a support ticket with correct fields', async () => {
      // TODO: mock db.insert, assert ticket created
    });
    it('should generate a ticket reference in TKT-XXXXXXXX format', async () => {
      // TODO: assert ticketRef format
    });
    it('should call sendSupportTicketReceivedEmail', async () => {
      // TODO: assert email sent
    });
    it('should reject invalid category values', async () => {
      // TODO: assert 400 for unknown category
    });
  });

  describe('getOne', () => {
    it('should return the ticket for the owning user', async () => {
      // TODO: mock db.select, assert ticket returned
    });
    it('should return 403 if ticket belongs to another user', async () => {
      // TODO: assert AppError 403
    });
  });

  describe('update', () => {
    it('should update description and priority', async () => {
      // TODO: mock db.update, assert fields updated
    });
    it('should reset status to open when user updates', async () => {
      // TODO: assert status = open after update
    });
  });
});

describe('notifySupportTicketUpdated', () => {
  it('should send sendSupportTicketUpdatedEmail to ticket owner', async () => {
    // TODO: mock db.select, assert email sent
  });
  it('should create an in-app notification for the user', async () => {
    // TODO: assert notificationService.create called
  });
});

describe('notifySupportTicketClosed', () => {
  it('should send sendSupportTicketClosedEmail to ticket owner', async () => {
    // TODO: mock db.select, assert email sent
  });
});
