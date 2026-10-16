# Transform! Mgt Tool

A management desk and AI copilot for one team in Duke's CAIO **Transform!** business simulation. It keeps the team's copy of the class workbook, recalculates it live, tracks cards, tasks, capital strategies and analyst ratings, and gives every tab its own Claude copilot. Every chat, decision and change is logged by role on the Activity tab.

- **Stack:** Next.js 16 (App Router), Tailwind v4, TypeScript, Postgres on Supabase (`postgres.js`), HyperFormula for live recalculation, Google Gemini (gemini-3.1-pro-preview for writing and judgement, gemini-3.5-flash for quick extraction; one adapter in `lib/ai.ts`), and the Google Sheets API for writing back to the class sheet.
- **Hosting:** Vercel.
- **Guard rails:** one shared password for the whole app. Everyone picks a role, and only the **CFO** can change numbers. An AI critic audits every workbook change before it is saved. The app writes only to your team's tab of the class sheet.

This guide takes you from nothing to a running copy, step by step. Allow about 45 minutes.

---

## What you need

| Account | What it's for | Cost |
|---|---|---|
| [GitHub](https://github.com) | Your copy of the code | Free |
| [Google AI Studio](https://aistudio.google.com) | The Gemini API key behind the copilots, decks and research | Pay per use (free tier for light testing) |
| [Supabase](https://supabase.com) | The Postgres database | Free tier is enough |
| [Google Cloud](https://console.cloud.google.com) | A service account that writes to the class Google Sheet | Free |
| [Vercel](https://vercel.com) | Hosting | Hobby (free) works; functions can run up to 300 s |

On your computer: **Node.js 22 or later** (`node -v`), **git**, and the **Vercel CLI** (`npm i -g vercel@latest`).

---

## Step 1: Get the code

```bash
git clone https://github.com/cdaeda/transform-mgt-tool.git
cd transform-mgt-tool
npm install
```

To keep your own copy, fork the repo on GitHub first and clone your fork instead.

---

## Step 2: Gemini API key

1. Sign in at [aistudio.google.com](https://aistudio.google.com) with a Google account.
2. Click **Get API key → Create API key** (in a Google Cloud project with billing enabled for heavier use), then copy it.
3. Keep the key somewhere safe for Step 6. Never commit it, and never paste it into chat or a shared doc.
4. Models: the app uses `gemini-3.1-pro-preview` and `gemini-3.5-flash`. If Google renames them, set `GEMINI_MODEL_PRO` / `GEMINI_MODEL_FLASH` instead of changing code.

---

## Step 3: Supabase database

1. Sign in at [supabase.com](https://supabase.com) and click **New project**.
   - **Name:** `transform`
   - **Database password:** generate one and save it (you need it for the connection string).
   - **Region:** pick the one closest to your Vercel region (for example, US East for `iad1`).
2. Wait about 2 minutes for the project to start.
3. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
   - It creates every table (strategy, cards, teams, financing ideas, audits, workbook, tasks, knowledge, threads, decks, next moves, rolls, round snapshots, activity) and seeds the single strategy row.
   - It is safe to run again: every statement uses `if not exists`. Re-run it whenever you pull a newer version of the app.
4. Get the connection string: click **Connect** (top of the project page) → **Connection string** → **Session pooler**.
   - Use the **session pooler (port 5432)**. Don't use the transaction pooler (6543): with this app's database client (`postgres.js`) it mixed up replies between queries in production, which returned wrong data.
   - The session pooler allows 15 clients at once. The app keeps one connection per server instance, closes it after 1 second idle, and keeps the Vercel instance awake just long enough to close it (see `lib/db.ts`). That way paused instances don't hold slots.
   - Don't use the "Direct connection" (`db.<ref>.supabase.co`) either. It is IPv6-only, and Vercel can't reach it.
   - Copy the URI and replace `[YOUR-PASSWORD]` with the database password from step 1. It looks like `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
5. Keep it for Step 6 as `DATABASE_URL`.

Row-level security is switched on for every table with no policies, so Supabase's public API can't read the data. The app connects as the database owner from the server only.

---

## Step 4: Google service account (write access to the class sheet)

The app **reads** the class sheet through its "anyone with the link" export and **writes** your team's cells through the Google Sheets API, as a service account.

1. Open [console.cloud.google.com](https://console.cloud.google.com) and create a project (top bar → project picker → **New project**, named for example `transform`).
2. Enable the API: **APIs & Services → Library**, search **Google Sheets API**, then click **Enable**.
3. Create the service account: **IAM & Admin → Service accounts → Create service account**.
   - Name: `transform-writer`. Skip the optional role and user-access steps, then click **Done**.
4. Create a key: open the service account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
   - Treat it like a password. Don't commit it (`.gitignore` already blocks `*service-account*.json`), and delete the download once it is stored in Vercel and `.env.local`.
   - If your organization blocks key creation (`iam.disableServiceAccountKeyCreation`), make the project under a personal Google account instead.
5. Copy the service account's email (`transform-writer@<project>.iam.gserviceaccount.com`).
6. Share the class sheet with that email as **Editor**. If you don't own the sheet, send the email to whoever does.
7. Get the sheet ID: it is the long part of the sheet URL between `/d/` and `/edit`. Keep it for Step 6 as `CLASS_SHEET_ID`.
   - **Keep the sheet ID out of the repo.** Anyone with the link can edit the class sheet, so it lives only in environment variables.
8. The app writes only to the tab named in `lib/cells.ts` (`TEAM_TAB = "Team 1"`). If your team has a different tab, change that one constant.

---

## Step 5: Team names (optional)

Teammates' real names stay out of the public repo. The app shows roles (CEO, CFO, CSO, CAIO, IM, IRM) and, if you set it, a name next to each role from a JSON map:

```json
{"CEO":"First Last","CFO":"First Last","CSO":"First Last","CAIO":"First Last","IM":"First Last","IRM":"First Last"}
```

The roles themselves are in `lib/roles.ts`.

---

## Step 6: Environment variables (local)

Create `.env.local` in the project root. It is git-ignored.

```bash
GEMINI_API_KEY=...
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
APP_PASSWORD=pick-a-shared-password
CLASS_SHEET_ID=<the sheet id>
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...", ... }
NEXT_PUBLIC_TEAM_NAMES={"CEO":"...","CFO":"..."}
```

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Yes | All AI features (copilots, card reading, decks, research). |
| `GEMINI_MODEL_PRO` / `GEMINI_MODEL_FLASH` | No | Override the model names. |
| `DATABASE_URL` | Yes | Supabase **session pooler**, port 5432 (not the transaction pooler). |
| `APP_PASSWORD` | Recommended | Browser password prompt; any username works. If empty, the app is open to anyone. |
| `CLASS_SHEET_ID` | For syncing | Without it, upload the workbook `.xlsx` by hand instead. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | For writing back | The **entire** key file on **one line**. Without it, changes stay in the app and are listed as "not yet pushed". |
| `NEXT_PUBLIC_TEAM_NAMES` | No | Shown in the browser, so only put names here you're happy for the team to see. |

To flatten the key file to one line:

```bash
node -e 'console.log(JSON.stringify(require(process.argv[1])))' ~/Downloads/<key-file>.json
```

---

## Step 7: Run it locally

```bash
npm run dev
```

1. Open http://localhost:3000 and enter any username plus your `APP_PASSWORD`.
2. Pick your role. Choose **CFO** to be able to edit numbers.
3. Load the workbook with **Sync from class sheet** (header), or **Upload .xlsx** with the class workbook.
4. Open the **Dashboard**. Market cap, the $50B goal path, the next move and the horizons fill in from the workbook.

Checks before you ship a change:

```bash
npx tsc --noEmit                           # types
npm run lint                               # lint
for f in lib/*.check.ts; do node "$f"; done   # self-checks: audit rules, impact, knob, market cap, cell guard, capital
npm run build                              # production build
```

---

## Step 8: Deploy to Vercel

### Option A: CLI (fastest)

```bash
vercel login
vercel link            # create a new project, e.g. "transform-team1"
# add each variable to every environment (paste the value when prompted)
for v in GEMINI_API_KEY DATABASE_URL APP_PASSWORD CLASS_SHEET_ID GOOGLE_SERVICE_ACCOUNT_JSON NEXT_PUBLIC_TEAM_NAMES; do
  for e in production preview development; do vercel env add $v $e; done
done
vercel --prod
```

### Option B: Dashboard

1. Go to [vercel.com/new](https://vercel.com/new), import your GitHub fork, and leave the framework as **Next.js**.
2. Before deploying, open **Environment Variables** and add all six variables from Step 6 for Production, Preview and Development.
3. Click **Deploy**. Every later push to `main` redeploys automatically.

### After deploying

- **Address:** your project gets `<project>.vercel.app`. To add a friendlier `*.vercel.app` name: **Project → Settings → Domains → Add**, or `vercel domains add <name>.vercel.app`.
- **Function time:** long copilot turns (audits, deck writing) take 1 to 3 minutes. The routes set `maxDuration = 300`, which Vercel allows on every plan.
- **Changing a variable** only takes effect on the next deploy: `vercel --prod`.

---

## Step 9: Day-to-day use

- **Dashboard:** the next move (one button that does it), the $50B path, the thermometer, scorecard and three horizons.
- **Tasks:** a board per role. **⚡ Act** opens a copilot thread that works the task to done.
- **Cards:** photograph or type a game card. The copilot evaluates it, and the CFO books business-model cards into the workbook.
- **Capital:** strategies (idea → pitching → locked), analyst ratings, the lever planner and financing research.
- **Finance:** what-if, strategy, innovation, and investor relations (the comeback story and the Shareholder Day deck at `/deck`, downloadable as PowerPoint).
- **Teams:** rival teams' finances and partner fit.
- **Workbook:** the team's tab, editable by the CFO in edit mode. Formulas recalculate instantly, and saves write through to the class sheet.
- **Activity:** who did what, by role, with each decision traced back to the conversation it came from.
- **Copilot (right side, or the button on mobile):** each tab has its own copilot and its own shared thread. It proposes changes and the team accepts or rejects them, so nothing changes silently.

---

## Optional: build on it with Claude Code or Codex

These tools let an AI coding agent work with your accounts directly.

| Tool | Install | Lets the agent |
|---|---|---|
| **Vercel plugin** (Claude Code) | `/plugin install vercel@claude-plugins-official` | Deploy, read logs and runtime errors, manage env vars and domains |
| **Vercel MCP** (any MCP client, including Codex) | Add the server `https://mcp.vercel.com` and sign in when prompted | The same, through MCP |
| **Supabase MCP** | `claude mcp add --transport http supabase https://mcp.supabase.com/mcp` (Codex: add the same URL under `[mcp_servers]` in `~/.codex/config.toml`) | Run SQL, apply `schema.sql`, inspect tables |
| **Google Drive connector** | In Claude (claude.ai → Settings → Connectors → Google Drive), then use it from Claude Code | Find and read the class sheet and handouts |
| **GitHub CLI** | `brew install gh && gh auth login` | Fork, push, open PRs |

### Copy-paste setup prompt

Paste this into Claude Code or Codex from an empty folder. The agent stops and asks you for each secret, and never writes one into the repo.

```text
Set up the "Transform! Mgt Tool" from https://github.com/cdaeda/transform-mgt-tool for my team.

1. Clone the repo into this folder and run `npm install`. Confirm Node >= 22.
2. Read README.md end to end, and follow it step by step.
3. Supabase: if the Supabase MCP is connected, create (or let me pick) a project, apply
   supabase/schema.sql, and build the SESSION POOLER (port 5432) connection string (NOT the transaction pooler on 6543). Otherwise walk me
   through the dashboard steps and wait for me to paste the connection string.
4. Google: walk me through creating the service account and enabling the Sheets API, then ask me for
   the key file path and flatten it to one line yourself. Ask me for the class sheet ID and our team's
   tab name. If the tab isn't "Team 1", update TEAM_TAB in lib/cells.ts.
5. Ask me for the Gemini API key, an app password, and (optionally) the role-to-name JSON.
   Write them only to .env.local. Never print a secret back to me, never commit one, and never put
   the sheet ID in a tracked file.
6. Run `npx tsc --noEmit`, `npm run lint`, every lib/*.check.ts with node, and `npm run build`.
   Fix anything that fails.
7. Start `npm run dev`, then tell me to open http://localhost:3000, pick the CFO role and click
   "Sync from class sheet".
8. Deploy: with the Vercel plugin or CLI, link a new project, add every variable from .env.local to
   production, preview and development, and run `vercel --prod`. Give me the URL.
9. Finish with a checklist of what is done and what still needs me (for example, sharing the class
   sheet with the service-account email).
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser keeps asking for a password | Any username works; the password is `APP_PASSWORD`. Changed it? Redeploy. |
| "Only the CFO can change numbers" | Click the role chip in the header and pick CFO. |
| `Couldn't download the class sheet (HTTP 401/404)` | The sheet must stay shared "anyone with the link can view", and `CLASS_SHEET_ID` must be just the ID. |
| Writes stay "not yet pushed" | `GOOGLE_SERVICE_ACCOUNT_JSON` missing or not one line, the Sheets API isn't enabled, or the sheet isn't shared with the service-account email as Editor. |
| `EMAXCONNSESSION` / `max clients reached`, or "Unexpected end of JSON input" | More than 15 connections are open. Stop extra local `npm run dev` servers and wait a minute. If it keeps happening, raise **Pool Size** in Supabase → Database → Settings → Connection pooling. |
| Wrong or missing data, `Cannot read properties of undefined` | You are on the transaction pooler (6543). Switch `DATABASE_URL` to the session pooler (5432) and redeploy. |
| `relation "…" does not exist` | Re-run `supabase/schema.sql` in the SQL editor. |
| Copilot replies "Gemini 400/403" | The Gemini key is wrong, or billing/quota is exhausted in its Google Cloud project. |
| "Gemini 503: service unavailable" | Google is busy; the app already retries three times. Try again in a minute. |

## Security notes

- Secrets live only in `.env.local` and Vercel environment variables. `.gitignore` blocks `.env*`, `*api-key*.txt` and `*service-account*.json`.
- The role picker is a guard rail, not real authentication: everyone shares one password and chooses their own role.
- Rotate keys if they were ever pasted anywhere public, and delete downloaded key files once they are stored.
