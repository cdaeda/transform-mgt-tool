import { cfoOnly } from "@/lib/role-guard";
import { saveWorkbook, workbookFile } from "@/lib/sheet";

// Download the working copy (with every edit the app made).
export async function GET() {
  const row = await workbookFile();
  if (!row) return Response.json({ error: "No workbook uploaded yet." }, { status: 404 });
  const name = row.filename.replace(/\.xlsx$/i, "") + ` (Team 1 working copy).xlsx`;
  return new Response(new Uint8Array(row.data), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}

// Replace the working copy with a fresh export (File > Download > .xlsx from the class sheet).
export async function POST(req: Request) {
  const denied = cfoOnly(req);
  if (denied) return denied;
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });
  try {
    const changes = await saveWorkbook(file.name, Buffer.from(await file.arrayBuffer()));
    return Response.json({ ok: true, filename: file.name, changes });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
