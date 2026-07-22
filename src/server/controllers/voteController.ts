import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { voteService } from '../services/voteService.js';
import { validate } from '../middleware/validate.js';
import { qs, pp, ip } from '../lib/reqHelpers.js';

const createSchema = z.object({
  group_id:        z.string().uuid(),
  proposal_type:   z.enum(['payout_swap', 'exceptional_request']),
  proposal_text:   z.string().min(10).max(1000),
  voting_deadline: z.string().datetime(),
});

const castSchema = z.object({ decision: z.enum(['approve', 'reject']) });

export const voteController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await voteService.getForGroup(qs(req.query.group_id));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  create: [
    validate(createSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as z.infer<typeof createSchema>;
        const id = await voteService.create({
          ...body,
          proposer_id:     req.user!.userId,
          voting_deadline: new Date(body.voting_deadline),
        }, ip(req.ip));
        res.status(201).json({ success: true, data: { id } });
      } catch (e) { next(e); }
    },
  ],

  cast: [
    validate(castSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { decision } = req.body as z.infer<typeof castSchema>;
        await voteService.castVote(pp(req.params.id), req.user!.userId, decision, ip(req.ip));
        res.json({ success: true, message: 'Vote recorded.' });
      } catch (e) { next(e); }
    },
  ],

  close: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const voteId = pp(req.params.id);
      await voteService.forceClose(voteId, req.user!.userId, ip(req.ip));
      res.json({ success: true, message: 'Vote closed.' });
    } catch (e) { next(e); }
  },
};
