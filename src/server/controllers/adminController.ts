/**
 * Administrator Portal controller — all endpoints require requireRole('admin').
 */
import type { Request, Response, NextFunction } from 'express';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { createAuditLog } from '../middleware/auditLogger.js';
import { notificationService } from '../services/notificationService.js';
import { pp, qs, ip } from '../lib/reqHelpers.js';
import {
  notifySupportTicketUpdated,
  notifySupportTicketClosed,
} from './supportController.js';

export const adminController = {
  // ── Dashboard Metrics ───────────────────────────────────────────────────────
  dashboard: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        activeUsers,
        verifiedUsers,
        activeGroups,
        contributions,
        activeRotations,
        activeSubscriptions,
        openTickets,
        recentErrors,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(schema.users),
        db.select({ count: sql<number>`count(*)` }).from(schema.users)
          .where(gte(schema.users.last_login_at, thirtyDaysAgo)),
        db.select({ count: sql<number>`count(*)` }).from(schema.users)
          .where(eq(schema.users.identity_verified, true)),
        db.select({ count: sql<number>`count(*)` }).from(schema.savingsGroups)
          .where(eq(schema.savingsGroups.status, 'active')),
        db.select({
          total:     sql<number>`count(*)`,
          completed: sql<number>`sum(case when payment_status = 'paid' then 1 else 0 end)`,
          failed:    sql<number>`sum(case when payment_status = 'failed' then 1 else 0 end)`,
          total_collected: sql<number>`sum(case when payment_status = 'paid' then cast(amount_paid as decimal(12,2)) else 0 end)`,
        }).from(schema.contributions),
        db.select({ count: sql<number>`count(*)` }).from(schema.rotations)
          .where(eq(schema.rotations.payout_status, 'pending')),
        db.select({
          count:    sql<number>`count(*)`,
          provider: schema.subscriptions.provider,
          plan:     schema.subscriptions.plan,
        }).from(schema.subscriptions)
          .where(eq(schema.subscriptions.billing_status, 'active'))
          .groupBy(schema.subscriptions.provider, schema.subscriptions.plan),
        db.select({ count: sql<number>`count(*)` }).from(schema.supportTickets)
          .where(eq(schema.supportTickets.status, 'open')),
        db.select({ count: sql<number>`count(*)` }).from(schema.systemErrors)
          .where(and(
            eq(schema.systemErrors.resolved, false),
            gte(schema.systemErrors.created_at, twentyFourHoursAgo),
          )),
      ]);

      const totalUsersCount    = Number(totalUsers[0]?.count ?? 0);
      const verifiedUsersCount = Number(verifiedUsers[0]?.count ?? 0);
      const contribData        = contributions[0];

      // MRR breakdown
      const ukSubs = activeSubscriptions.filter(s => s.provider === 'stripe');
      const ngSubs = activeSubscriptions.filter(s => s.provider === 'flutterwave');
      const ukCount = ukSubs.reduce((a, s) => a + Number(s.count), 0);
      const ngCount = ngSubs.reduce((a, s) => a + Number(s.count), 0);

      res.json({
        success: true,
        data: {
          users: {
            total:             totalUsersCount,
            active_last_30d:   Number(activeUsers[0]?.count ?? 0),
            identity_verified: verifiedUsersCount,
            identity_verified_pct: totalUsersCount > 0
              ? Math.round((verifiedUsersCount / totalUsersCount) * 100)
              : 0,
          },
          groups: {
            active: Number(activeGroups[0]?.count ?? 0),
          },
          contributions: {
            total:           Number(contribData?.total ?? 0),
            completed:       Number(contribData?.completed ?? 0),
            failed:          Number(contribData?.failed ?? 0),
            total_collected: Number(contribData?.total_collected ?? 0),
          },
          rotations: {
            active: Number(activeRotations[0]?.count ?? 0),
          },
          subscriptions: {
            uk: { count: ukCount, mrr_gbp: (ukCount * 4.99).toFixed(2) },
            ng: { count: ngCount, mrr_ngn: (ngCount * 3500).toFixed(2) },
          },
          support: {
            open_tickets: Number(openTickets[0]?.count ?? 0),
          },
          monitoring: {
            errors_last_24h: Number(recentErrors[0]?.count ?? 0),
          },
        },
      });
    } catch (e) { next(e); }
  },

  // ── User Management ─────────────────────────────────────────────────────────
  listUsers: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page   = Math.max(1, parseInt(qs(req.query.page) || '1', 10));
      const limit  = Math.min(100, parseInt(qs(req.query.limit) || '50', 10));
      const offset = (page - 1) * limit;

      const statusFilter   = qs(req.query.status);
      const countryFilter  = qs(req.query.country);
      const verifiedFilter = qs(req.query.identity_verified);

      const conditions: ReturnType<typeof eq>[] = [];
      if (statusFilter)   conditions.push(eq(schema.users.account_status, statusFilter as 'active'));
      if (countryFilter)  conditions.push(eq(schema.users.country, countryFilter));
      if (verifiedFilter !== undefined && verifiedFilter !== '')
        conditions.push(eq(schema.users.identity_verified, verifiedFilter === 'true'));

      const query = db.select({
        id:                  schema.users.id,
        email:               schema.users.email,
        first_name:          schema.users.first_name,
        last_name:           schema.users.last_name,
        country:             schema.users.country,
        trust_score:         schema.users.trust_score,
        account_status:      schema.users.account_status,
        subscription_status: schema.users.subscription_status,
        identity_verified:   schema.users.identity_verified,
        role:                schema.users.role,
        created_at:          schema.users.created_at,
        last_login_at:       schema.users.last_login_at,
      }).from(schema.users);

      const users = conditions.length
        ? await query.where(and(...conditions)).limit(limit).offset(offset).orderBy(desc(schema.users.created_at))
        : await query.limit(limit).offset(offset).orderBy(desc(schema.users.created_at));

      res.json({ success: true, data: users, meta: { page, limit } });
    } catch (e) { next(e); }
  },

  getUserDetail: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = pp(req.params.id);
      const [userRows, subRows, ticketRows] = await Promise.all([
        db.select().from(schema.users).where(eq(schema.users.id, uid)).limit(1),
        db.select().from(schema.subscriptions).where(eq(schema.subscriptions.user_id, uid)).limit(1),
        db.select().from(schema.supportTickets).where(eq(schema.supportTickets.user_id, uid)).orderBy(desc(schema.supportTickets.created_at)),
      ]);
      if (!userRows.length) return res.status(404).json({ success: false, message: 'User not found.' });
      res.json({ success: true, data: { user: userRows[0], subscription: subRows[0] ?? null, tickets: ticketRows } });
    } catch (e) { next(e); }
  },

  suspendUser: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = pp(req.params.id);
      const reason = (req.body.reason as string | undefined) ?? 'Suspended by administrator.';
      await db.update(schema.users)
        .set({ account_status: 'suspended' as const })
        .where(eq(schema.users.id, uid));
      await notificationService.create({
        userId: uid, type: 'account_suspended',
        title: 'Account Suspended',
        message: `Your account has been suspended. Reason: ${reason}`,
      });
      await createAuditLog({ userId: req.user!.userId, action: 'ACCOUNT_SUSPENDED', entity: 'users', entityId: uid, ipAddress: ip(req.ip), metadata: { reason } });
      res.json({ success: true, message: 'User suspended.' });
    } catch (e) { next(e); }
  },

  reactivateUser: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = pp(req.params.id);
      await db.update(schema.users)
        .set({ account_status: 'active' as const })
        .where(eq(schema.users.id, uid));
      await notificationService.create({
        userId: uid, type: 'account_reactivated',
        title: 'Account Reactivated',
        message: 'Your account has been reactivated. Welcome back!',
      });
      await createAuditLog({ userId: req.user!.userId, action: 'ACCOUNT_REACTIVATED', entity: 'users', entityId: uid, ipAddress: ip(req.ip) });
      res.json({ success: true, message: 'User reactivated.' });
    } catch (e) { next(e); }
  },

  deleteUser: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = pp(req.params.id);
      // Soft delete only
      await db.update(schema.users)
        .set({ active: false, account_status: 'deactivated' as const })
        .where(eq(schema.users.id, uid));
      await createAuditLog({ userId: req.user!.userId, action: 'ACCOUNT_DELETED', entity: 'users', entityId: uid, ipAddress: ip(req.ip) });
      res.json({ success: true, message: 'User deactivated (soft delete).' });
    } catch (e) { next(e); }
  },

  // ── Group Management ────────────────────────────────────────────────────────
  listGroups: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page   = Math.max(1, parseInt(qs(req.query.page) || '1', 10));
      const limit  = Math.min(100, parseInt(qs(req.query.limit) || '50', 10));
      const offset = (page - 1) * limit;
      const statusFilter = qs(req.query.status);

      const query = db.select().from(schema.savingsGroups);
      const data = statusFilter
        ? await query.where(eq(schema.savingsGroups.status, statusFilter as 'active')).limit(limit).offset(offset).orderBy(desc(schema.savingsGroups.created_at))
        : await query.limit(limit).offset(offset).orderBy(desc(schema.savingsGroups.created_at));

      res.json({ success: true, data, meta: { page, limit } });
    } catch (e) { next(e); }
  },

  getGroupDetail: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gid = pp(req.params.id);
      const [groupRows, memberRows] = await Promise.all([
        db.select().from(schema.savingsGroups).where(eq(schema.savingsGroups.id, gid)).limit(1),
        db.select().from(schema.memberships).where(eq(schema.memberships.group_id, gid)),
      ]);
      if (!groupRows.length) return res.status(404).json({ success: false, message: 'Group not found.' });
      res.json({ success: true, data: { group: groupRows[0], members: memberRows } });
    } catch (e) { next(e); }
  },

  forceCloseGroup: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gid = pp(req.params.id);
      const groupRows = await db.select({ name: schema.savingsGroups.name })
        .from(schema.savingsGroups).where(eq(schema.savingsGroups.id, gid)).limit(1);
      if (!groupRows.length) return res.status(404).json({ success: false, message: 'Group not found.' });

      await db.update(schema.savingsGroups)
        .set({ status: 'closed' as const })
        .where(eq(schema.savingsGroups.id, gid));

      // Notify all members
      const members = await db.select({ user_id: schema.memberships.user_id })
        .from(schema.memberships).where(eq(schema.memberships.group_id, gid));
      for (const m of members) {
        await notificationService.create({
          userId: m.user_id, type: 'group_closed',
          title: 'Group Closed',
          message: `The savings group "${groupRows[0].name}" has been closed by an administrator.`,
        });
      }

      await createAuditLog({ userId: req.user!.userId, action: 'GROUP_FORCE_CLOSED', entity: 'savings_groups', entityId: gid, ipAddress: ip(req.ip) });
      res.json({ success: true, message: 'Group closed.' });
    } catch (e) { next(e); }
  },

  // ── Subscription Management ─────────────────────────────────────────────────
  listSubscriptions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page   = Math.max(1, parseInt(qs(req.query.page) || '1', 10));
      const limit  = Math.min(100, parseInt(qs(req.query.limit) || '50', 10));
      const offset = (page - 1) * limit;
      const statusFilter = qs(req.query.status);

      const query = db.select().from(schema.subscriptions);
      const data = statusFilter
        ? await query.where(eq(schema.subscriptions.billing_status, statusFilter as 'active')).limit(limit).offset(offset).orderBy(desc(schema.subscriptions.created_at))
        : await query.limit(limit).offset(offset).orderBy(desc(schema.subscriptions.created_at));

      res.json({ success: true, data, meta: { page, limit } });
    } catch (e) { next(e); }
  },

  cancelSubscription: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sid = pp(req.params.id);
      await db.update(schema.subscriptions)
        .set({ billing_status: 'cancelled' as const })
        .where(eq(schema.subscriptions.id, sid));
      await createAuditLog({ userId: req.user!.userId, action: 'SUBSCRIPTION_ADMIN_CANCELLED', entity: 'subscriptions', entityId: sid, ipAddress: ip(req.ip) });
      res.json({ success: true, message: 'Subscription cancelled.' });
    } catch (e) { next(e); }
  },

  // ── Support Management ──────────────────────────────────────────────────────
  listTickets: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page   = Math.max(1, parseInt(qs(req.query.page) || '1', 10));
      const limit  = Math.min(100, parseInt(qs(req.query.limit) || '50', 10));
      const offset = (page - 1) * limit;
      const statusFilter = qs(req.query.status);

      const query = db.select().from(schema.supportTickets);
      const data = statusFilter
        ? await query.where(eq(schema.supportTickets.status, statusFilter as 'open')).limit(limit).offset(offset).orderBy(desc(schema.supportTickets.created_at))
        : await query.limit(limit).offset(offset).orderBy(desc(schema.supportTickets.created_at));

      res.json({ success: true, data, meta: { page, limit } });
    } catch (e) { next(e); }
  },

  updateTicket: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tid = pp(req.params.id);
      const { status, admin_response, assigned_admin } = req.body as {
        status?: 'open' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'closed';
        admin_response?: string;
        assigned_admin?: string;
      };

      const updates: Record<string, unknown> = {};
      if (status)          updates.status          = status;
      if (admin_response)  updates.admin_response  = admin_response;
      if (assigned_admin)  updates.assigned_admin  = assigned_admin;

      await db.update(schema.supportTickets).set(updates).where(eq(schema.supportTickets.id, tid));

      if (admin_response) {
        await notifySupportTicketUpdated(tid, admin_response);
      }

      await createAuditLog({ userId: req.user!.userId, action: 'SUPPORT_TICKET_UPDATED', entity: 'support_tickets', entityId: tid, ipAddress: ip(req.ip) });
      res.json({ success: true, message: 'Ticket updated.' });
    } catch (e) { next(e); }
  },

  closeTicket: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tid = pp(req.params.id);
      const resolution = (req.body.resolution as string | undefined) ?? 'Ticket resolved and closed by administrator.';

      await db.update(schema.supportTickets)
        .set({ status: 'closed' as const, admin_response: resolution })
        .where(eq(schema.supportTickets.id, tid));

      await notifySupportTicketClosed(tid, resolution);
      await createAuditLog({ userId: req.user!.userId, action: 'SUPPORT_TICKET_CLOSED', entity: 'support_tickets', entityId: tid, ipAddress: ip(req.ip) });
      res.json({ success: true, message: 'Ticket closed.' });
    } catch (e) { next(e); }
  },

  // ── Audit Logs ──────────────────────────────────────────────────────────────
  auditLogs: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page   = Math.max(1, parseInt(qs(req.query.page) || '1', 10));
      const limit  = Math.min(200, parseInt(qs(req.query.limit) || '100', 10));
      const offset = (page - 1) * limit;

      const userFilter   = qs(req.query.user_id);
      const actionFilter = qs(req.query.action);
      const entityFilter = qs(req.query.entity);
      const fromFilter   = qs(req.query.from);
      const toFilter     = qs(req.query.to);

      const conditions: ReturnType<typeof eq>[] = [];
      if (userFilter)   conditions.push(eq(schema.auditLogs.user_id, userFilter));
      if (actionFilter) conditions.push(eq(schema.auditLogs.action, actionFilter));
      if (entityFilter) conditions.push(eq(schema.auditLogs.entity, entityFilter));
      if (fromFilter)   conditions.push(gte(schema.auditLogs.created_at, new Date(fromFilter)));
      if (toFilter)     conditions.push(lte(schema.auditLogs.created_at, new Date(toFilter)));

      const query = db.select().from(schema.auditLogs);
      const data = conditions.length
        ? await query.where(and(...conditions)).limit(limit).offset(offset).orderBy(desc(schema.auditLogs.created_at))
        : await query.limit(limit).offset(offset).orderBy(desc(schema.auditLogs.created_at));

      res.json({ success: true, data, meta: { page, limit } });
    } catch (e) { next(e); }
  },
};
