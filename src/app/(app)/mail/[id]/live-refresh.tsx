"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-reads the page while a mailing is still working through its list.
 *
 * Polling rather than a socket: the send loop runs in the same process and
 * writes each result to the database as it goes, so a plain refresh every few
 * seconds shows exactly what has happened with no extra machinery. It stops
 * itself the moment `active` goes false, so a finished campaign sits still,
 * and it does not poll a tab nobody is looking at.
 */
export function LiveRefresh({ active, intervalMs = 5000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const tick = () => {
      // A background tab has nobody watching it, and each refresh re-renders
      // the whole route on the server — in `next dev` that is expensive, and
      // it competes with the send loop for the one thread that is also writing
      // attachments to the mail server.
      if (document.visibilityState === "visible") router.refresh();
    };

    const timer = setInterval(tick, intervalMs);
    // Catch up the moment someone looks again, rather than waiting a full tick.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, intervalMs, router]);

  return null;
}
