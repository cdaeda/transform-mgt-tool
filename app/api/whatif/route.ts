import { bookingWrites } from "@/lib/booking";
import type { Cell } from "@/lib/cells";
import { gated } from "@/lib/critic";
import { isBM, sql, type Card } from "@/lib/db";
import { results } from "@/lib/finance";
import { cfoOnly } from "@/lib/role-guard";
import { applyWrite, discard, readRange } from "@/lib/sheet";

export const maxDuration = 300;

type Write = { range: string; value: Cell };

export async function GET() {
  try {
    return Response.json({ baseline: await results() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Preview a scenario (lever values + candidate cards) on a throwaway copy, or apply the lever
// values for real through the critic. ponytail: preview uses the shared in-memory copy for a few
// hundred ms, so a save landing in that window would include the scenario; per-request copies if that bites.
export async function POST(req: Request) {
  const { writes = [], cardIds = [], apply = false, label = "" } = (await req.json()) as {
    writes?: Write[]; cardIds?: number[]; apply?: boolean; label?: string;
  };
  try {
    const baseline = await results();
    const cards = cardIds.length ? await sql<Card[]>`select * from cards where id in ${sql(cardIds)}` : [];
    const bm = cards.filter((c) => isBM(c.type)) as (Card & { type: "Core" | "Growth" | "Explore" })[];

    if (apply) {
      const denied = cfoOnly(req);
      if (denied) return denied;
      const reason = `What-if scenario "${label || "unnamed"}" applied to the workbook by the team:\n${writes.map((w) => `${w.range} = ${w.value}`).join("\n")}`;
      const r = await gated(reason, async (write) => {
        for (const w of writes) await write(w.range, [[w.value]]);
      });
      return Response.json({ baseline, scenario: await results(), saved: r.saved, audit: r.audit, pushed: r.pushed, pushError: r.pushError });
    }

    try {
      for (const w of writes) await applyWrite(w.range, [[w.value]]);
      for (const c of bm) await bookingWrites(c, readRange, applyWrite);
      return Response.json({ baseline, scenario: await results() });
    } finally {
      discard(); // never keep preview values
    }
  } catch (e) {
    discard();
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
