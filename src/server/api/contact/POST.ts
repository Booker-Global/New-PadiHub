import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sendContactEmail } from '../../integrations/email/emailService.js';

const schema = z.object({
  name:    z.string().min(1).max(200),
  email:   z.string().email(),
  subject: z.string().max(200).optional(),
  message: z.string().min(1).max(5000),
});

export default async function handler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
    }
    const { name, email, subject, message } = parsed.data;
    await sendContactEmail({ name, email, subject: subject || 'General enquiry', message });
    res.json({ success: true, message: 'Message sent successfully.' });
  } catch (e) {
    next(e);
  }
}
