-- La sincronización entre sesiones solo envía señales de invalidación.
-- Autoriza el canal privado exclusivamente a usuarios del sistema con rol.
DROP POLICY IF EXISTS costos_sync_authenticated_receive ON realtime.messages;
CREATE POLICY costos_sync_authenticated_receive
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'costos-cambios-en-vivo-v1'
  AND realtime.messages.extension = 'broadcast'
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role IN ('admin','auditor')
  )
);

DROP POLICY IF EXISTS costos_sync_authenticated_send ON realtime.messages;
CREATE POLICY costos_sync_authenticated_send
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = 'costos-cambios-en-vivo-v1'
  AND realtime.messages.extension = 'broadcast'
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role IN ('admin','auditor')
  )
);
