import { z } from 'zod';
export const schemas = {
  dashboard: z.object({
    "myGroups": z.array(z.object({
      "id": z.string(),
      "name": z.string(),
      "members": z.number(),
      "contribution": z.string(),
      "nextPayment": z.string(),
      "color": z.string()
    })),
    "notifications": z.array(z.object({
      "text": z.string(),
      "type": z.string(),
      "time": z.string(),
      "id": z.string()
    }))
  }),
  how_it_works: z.object({
    "steps": z.array(z.object({
      "step": z.string(),
      "title": z.string(),
      "desc": z.string(),
      "color": z.string(),
      "details": z.array(z.string()),
      "id": z.string()
    }))
  })
};
export type Schemas = typeof schemas;