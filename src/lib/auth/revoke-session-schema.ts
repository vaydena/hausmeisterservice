import { z } from 'zod';

/**
 * Sprint 31: Payload fuer revokeSessionAction. Nur eine UUID — der
 * Ownership-Check laeuft in der SECURITY-DEFINER-Function revoke_user_session
 * ueber (user_id, session_id), damit ein Angreifer selbst mit erratener
 * fremder session_id keine fremden Sessions killen kann.
 */
export const revokeSessionSchema = z.object({
  sessionId: z
    .string()
    .trim()
    .uuid('Ungueltige Sitzungs-ID.'),
});

export type RevokeSessionInput = z.infer<typeof revokeSessionSchema>;
