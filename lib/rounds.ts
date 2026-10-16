import { sql, type Strategy } from "@/lib/db";
import { getSnapshot } from "@/lib/snapshot";

export type RoundData = {
  cap: number; price: number; eps: number; revenue: number; ebitda: number; net: number; cash: number;
  units: { core: number; growth: number; explore: number }; analysts: number[]; rank: string;
};

// Record where we stand right now, for the comeback timeline and the deck.
export async function captureRound(label: string) {
  const [[st], snap] = await Promise.all([sql<Strategy[]>`select current_year from strategy where id = 1`, getSnapshot()]);
  const i = st.current_year - 1, y = snap.years[i];
  const ours = snap.leaderboard.find((b) => b.team === 1)?.caps[i] ?? y.cap;
  const data: RoundData = {
    cap: y.cap, price: y.price, eps: y.eps, revenue: y.revenue + y.oneTime, ebitda: y.ebitda, net: y.net, cash: y.cash,
    units: { core: snap.units[0]?.[i] ?? 0, growth: snap.units[1]?.[i] ?? 0, explore: snap.units[2]?.[i] ?? 0 },
    analysts: (snap.analysts ?? []).map((r) => r[i] ?? 0),
    rank: snap.leaderboard.length ? `#${snap.leaderboard.filter((b) => b.caps[i] > ours).length + 1} of ${snap.leaderboard.length}` : "",
  };
  const [row] = await sql`insert into round_snapshots ${sql({ label, year: st.current_year, data: sql.json(data) })} returning *`;
  return row;
}

export const listRounds = () => sql<{ id: number; created_at: Date; label: string; year: number; data: RoundData }[]>`select * from round_snapshots order by created_at`;
