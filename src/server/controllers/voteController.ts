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

const proposeSwapSchema = z.object({
  group_id: z.string().uuid(),
  target_member_id: z.string().uuid(),
  note: z.string().max(500).optional(),
});

const proposeAdmissionSchema = z.object({
  membership_id: z.string().uuid(),
});

const proposeClaimSchema = z.object({
  group_id: z.string().uuid(),
  amount: z.number().positive(),
});

const respondSchema = z.object({
  token: z.string().min(10),
  decision: z.enum(['approve', 'reject']),
});

export const voteController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await voteService.getForGroup(qs(req.query.group_id));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  /** POST /api/votes/payout-swap — propose swapping rotation position with another member */
  proposeSwap: [
    validate(proposeSwapSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as z.infer<typeof proposeSwapSchema>;
        const id = await voteService.proposePayoutSwap(
          body.group_id, req.user!.userId, body.target_member_id, body.note, ip(req.ip),
        );
        res.status(201).json({ success: true, data: { id } });
      } catch (e) { next(e); }
    },
  ],

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

  /** POST /api/votes/member-admission — group leader starts a unanimous admission vote for a pending join request */
  proposeAdmission: [
    validate(proposeAdmissionSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { membershipService } = await import('../services/membershipService.js');
        const body = req.body as z.infer<typeof proposeAdmissionSchema>;
        const data = await membershipService.initiateAdmissionVote(req.user!.userId, body.membership_id, ip(req.ip));
        res.status(201).json({ success: true, data });
      } catch (e) { next(e); }
    },
  ],

  /** POST /api/votes/contribution-claim — propose a unanimous, temporary contribution-amount increase */
  proposeClaim: [
    validate(proposeClaimSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as z.infer<typeof proposeClaimSchema>;
        const id = await voteService.proposeContributionClaim(body.group_id, req.user!.userId, body.amount, ip(req.ip));
        res.status(201).json({ success: true, data: { id } });
      } catch (e) { next(e); }
    },
  ],

  /**
   * GET /api/votes/respond — public, unauthenticated one-click email
   * accept/decline link (the token is the authentication). Used by
   * member_admission / contribution_claim / payout_swap governance emails.
   */
  respond: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = respondSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: 'Invalid or missing token/decision.' });
      }
      const result = await voteService.respondViaToken(parsed.data.token, parsed.data.decision);
      res.json(result);
    } catch (e) { next(e); }
  },
};
