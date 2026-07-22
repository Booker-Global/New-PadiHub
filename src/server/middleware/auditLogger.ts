import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';

export async function createAuditLog(params: {
  userId?:    string;
  action:     string;
  entity?:    string;
  entityId?:  string;
  ipAddress?: string;
  metadata?:  Record<string, unknown>;
}) {
  try {
    
    await db.insert(schema.auditLogs).values({
      id:         uuidv4(),
      user_id:    params.userId,
      action:     params.action,
      entity:     params.entity,
      entity_id:  params.entityId,
      ip_address: params.ipAddress,
      metadata:   params.metadata ?? null,
    });
  } catch (err) {
    // Audit log failures must never crash the main flow
    console.error('[AuditLog] Failed to write:', err);
  }
}
