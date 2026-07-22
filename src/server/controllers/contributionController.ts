import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { contributionService } from '../services/contributionService.js';
import { groupService } from '../services/groupService.js';
import { membershipService } from '../services/membershipService.js';
import { validate } from '../middleware/validate.js';
import { qs, pp, ip } from '../lib/reqHelpers.js';

const updateSchema = z.object({
  status:             z.enum(['paid', 'failed', 'missed']),
  provider_reference: z.string().optional(),
});

const generateScheduleSchema = z.object({
  group_id:     z.string().uuid(),
  cycle_number: z.number().int().min(1),
  due_date:     z.string().datetime(),
});

export const contributionController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId  = qs(req.query.group_id);
      const memberId = qs(req.query.member_id);
      const cycleRaw = qs(req.query.cycle);
      const cycle    = cycleRaw ? parseInt(cycleRaw, 10) : undefined;
      const data = groupId
        ? await contributionService.getForGroup(groupId, cycle)
        : await contributionService.getForMember(memberId || req.user!.userId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  update: [
    validate(updateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { status, provider_reference } = req.body as z.infer<typeof updateSchema>;
        const contribId = pp(req.params.id);
        const clientIp  = ip(req.ip);
        if (status === 'paid')        await contributionService.markPaid(contribId, provider_reference ?? '', clientIp);
        else if (status === 'failed') await contributionService.markFailed(contribId, clientIp);
        else if (status === 'missed') await contributionService.markMissed(contribId, clientIp);
        res.json({ success: true, message: `Contribution marked as ${status}.` });
      } catch (e) { next(e); }
    },
  ],

  generateSchedule: [
    validate(generateScheduleSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { group_id, cycle_number, due_date } = req.body as z.infer<typeof generateScheduleSchema>;
        // Fetch group to get contribution_amount
        const group = await groupService.getById(group_id);
        // Fetch all active members
        const memberships = await membershipService.getForGroup(group_id);
        const activeMembers = memberships
          .filter(m => m.status === 'active')
          .map(m => ({ user_id: m.user_id, amount_due: group.contribution_amount }));
        if (!activeMembers.length) {
          return res.status(400).json({ success: false, message: 'No active members in group.' });
        }
        const ids = await contributionService.generateCycleSchedule(
          group_id, cycle_number, new Date(due_date), activeMembers,
        );
        res.status(201).json({ success: true, data: { contribution_ids: ids, count: ids.length } });
      } catch (e) { next(e); }
    },
  ],
};
