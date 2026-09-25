import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { REALTIME, specFor } from './registry';
import { applyRemote, type RemoteEvent } from './engine';
import type { Row } from './mappers';

/* ============================================================
   The four tables somebody else's change has to reach this screen
   from: the house chat, the buy list, the stock list and the
   reports.

   One channel, not four. Supabase counts concurrent connections and
   a household with nine people on phones and iPads is nine
   connections already; four each would be thirty-six for no benefit,
   since the messages arrive on the same socket either way.

   The tables have to be members of the supabase_realtime publication
   or none of this fires — that is done in
   supabase/migrations/20260828001800_realtime.sql, and the two lists
   have to stay in step.
   ============================================================ */

let channel: RealtimeChannel | null = null;

export function startRealtime(): void {
  const sb = supabase;
  if (!sb || channel) return;

  const ch = sb.channel('house-3808');

  for (const slice of REALTIME) {
    const spec = specFor(slice);
    if (!spec) continue;
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: spec.table },
      (payload: RealtimePostgresChangesPayload<Row>) => {
        const event = payload.eventType as RemoteEvent;
        // A DELETE carries only the old row, and unless the table is
        // set to REPLICA IDENTITY FULL that is the primary key alone —
        // which is all applyRemote needs to take the row out.
        const row = (event === 'DELETE' ? payload.old : payload.new) as Row;
        if (!row || typeof row !== 'object') return;
        applyRemote(slice, event, row);
      },
    );
  }

  ch.subscribe();
  channel = ch;
}

export function stopRealtime(): void {
  const sb = supabase;
  if (!channel || !sb) return;
  void sb.removeChannel(channel);
  channel = null;
}
