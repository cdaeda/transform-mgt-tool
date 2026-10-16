// Team roles. Real names are private: they come from NEXT_PUBLIC_TEAM_NAMES (a JSON map of role -> name,
// set in Vercel / .env.local) so the public repo only carries the roles. The CFO also covers investor relations.
const names: Record<string, string> = (() => {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_TEAM_NAMES ?? "{}");
  } catch {
    return {};
  }
})();

export const ROLES = [
  { id: "CEO", title: "Chief Executive Officer", name: names.CEO ?? "" },
  { id: "CFO", title: "Chief Financial Officer", name: names.CFO ?? "" },
  { id: "CSO", title: "Chief Strategy Officer", name: names.CSO ?? "" },
  { id: "CAIO", title: "Chief AI Officer", name: names.CAIO ?? "" },
  { id: "IM", title: "Innovation Manager", name: names.IM ?? "" },
  { id: "IRM", title: "Investor Relations Manager", name: names.IRM ?? "" },
] as const;
export type RoleId = (typeof ROLES)[number]["id"];
export const ROLE_IDS = ROLES.map((r) => r.id) as [RoleId, ...RoleId[]];
export const teamLine = () => ROLES.map((r) => `${r.name || "[name]"} (${r.id})`).join(", ");
