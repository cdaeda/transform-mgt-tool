// The role each browser picked (sent as a cookie). A guard rail against accidental edits, not
// authentication: everyone shares one app password and chooses their own role.
export const roleOf = (req: Request) => req.headers.get("cookie")?.match(/(?:^|;\s*)transform_role=([A-Z]+)/)?.[1] ?? null;

// Only the CFO changes numbers in the workbook.
export function cfoOnly(req: Request) {
  return roleOf(req) === "CFO" ? null : Response.json({ error: "Only the CFO can change numbers. Pick CFO as your role to edit." }, { status: 403 });
}
