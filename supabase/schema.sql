-- Transform! CFO app. The server connects with the database password (Supavisor transaction pooler);
-- RLS on with no policies keeps the public anon key out entirely.

create table if not exists strategy (
  id int primary key default 1 check (id = 1),
  ambition text not null default '',
  short_term text not null default 'Cash generation to fund our platform.',
  opex_plan text not null default '',            -- short-term opex reduction, owned by the CAIO
  medium_term text not null default 'Partner-led expansion.',
  current_year int not null default 1 check (current_year between 1 and 10),
  updated_at timestamptz not null default now()
);
insert into strategy (id) values (1) on conflict do nothing;

create table if not exists cards (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  type text not null check (type in ('Core', 'Growth', 'Explore')),
  title text not null,
  card_text text not null default '',
  capex double precision not null default 0,               -- full dollars, spent in start_year
  start_year int not null default 1 check (start_year between 1 and 10),
  revenue double precision[] not null default '{0,0,0,0,0,0,0,0,0,0}',  -- full dollars, game years 1..10
  cost double precision[] not null default '{0,0,0,0,0,0,0,0,0,0}',
  recommendation text not null default '',        -- AI: TAKE / PASS / TAKE WITH CHANGES
  evaluation text not null default '',            -- AI write-up
  partner_verdict text not null default '',       -- AI: Partner / Go alone / Depends
  partner_with text not null default '',
  partner_reasoning text not null default '',
  status text not null default 'candidate' check (status in ('candidate', 'selected', 'booked', 'passed')),
  our_notes text not null default '',             -- what WE want to do: binding strategy
  sheet_row int                                   -- revenue row in 'Team 1' once booked
);

create table if not exists teams (
  team_number int primary key check (team_number between 2 and 9),
  company text not null default '',
  observed_cards text not null default '',
  ambition text not null default '',
  notes text not null default '',
  ai_profile text not null default '',
  plug_in text not null default '',               -- how they'd plug into our business
  updated_at timestamptz not null default now()
);

alter table strategy enable row level security;
alter table cards enable row level security;
alter table teams enable row level security;

alter table strategy add column if not exists core_strategy text not null default
  'Core = data strategy + network effect. Our fuel network, factory software and platform software generate the data.';

-- The working copy of the CFO workbook (.xlsx). The app recalculates formulas itself (HyperFormula).
create table if not exists workbook (
  id int primary key default 1 check (id = 1),
  filename text not null,
  data bytea not null,
  updated_at timestamptz not null default now()
);
alter table workbook enable row level security;

-- Cards are not only business models: events, challenges, innovation strategies, analyst/BOOM/advisor cards.
alter table cards drop constraint if exists cards_type_check;
alter table cards add constraint cards_type_check check (type in
  ('Core', 'Growth', 'Explore', 'Management Event', 'Management Challenge', 'Innovation Strategy', 'Analyst', 'BOOM', 'Advisor', 'Other'));

-- Critic-agent audit trail: every gated change to the workbook, with the verdict and whether it was saved.
create table if not exists audits (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  reason text not null,
  changes jsonb not null default '[]',
  verdict text not null check (verdict in ('PASS', 'WARN', 'FAIL')),
  summary text not null default '',
  issues jsonb not null default '[]',
  saved boolean not null
);
alter table audits enable row level security;

-- Financing ideas extracted from articles / game materials; the team picks which to use.
create table if not exists financing_ideas (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  name text not null,
  category text not null default '',
  how_it_works text not null default '',
  source text not null default '',
  source_quote text not null default '',
  amount text not null default '',
  cost text not null default '',
  fit text not null default '',
  risks text not null default '',
  recommendation text not null default '',
  status text not null default 'idea' check (status in ('idea', 'picked', 'rejected')),
  our_notes text not null default ''
);
alter table financing_ideas enable row level security;

alter table workbook add column if not exists last_diff jsonb not null default '{}'; -- what changed in the latest upload, per tab
alter table workbook add column if not exists dirty boolean not null default false; -- app edits not yet in the class sheet

alter table cards drop constraint if exists cards_type_check;
alter table cards add constraint cards_type_check check (type in
  ('Core', 'Growth', 'Explore', 'Management Event', 'Management Challenge', 'Innovation Strategy', 'Analyst', 'BOOM', 'BUST', 'Advisor', 'Other'));
alter table workbook add column if not exists unpushed jsonb not null default '{}'; -- Team 1 cells saved in the app but not yet written to the class sheet

-- Ranked funding plays, and the three-horizon targets the dashboard tracks.
alter table financing_ideas add column if not exists rank int;
alter table strategy add column if not exists h1_target double precision;  -- Core BM profit this year ($)
alter table strategy add column if not exists h2_target double precision;  -- Growth / data revenue this year ($)
alter table strategy add column if not exists h3_target double precision;  -- ecosystem partners signed (count)
alter table strategy add column if not exists h3_partners int not null default 0; -- partners actually signed (team-entered)

-- Card horizon fit + the strategy tuner knob (target investment mix across H1/H2/H3).
alter table cards add column if not exists lens text not null default '';
alter table cards add column if not exists horizon_fit jsonb not null default '{}';
alter table cards add column if not exists primary_horizon text not null default '';
alter table strategy add column if not exists knob double precision not null default 20;  -- 0 = Defend .. 100 = Transform
alter table strategy add column if not exists h1_pct double precision not null default 70;
alter table strategy add column if not exists h2_pct double precision not null default 19;
alter table strategy add column if not exists h3_pct double precision not null default 11;

-- Card families from the official Transform! materials (strategytools.io, v2 2026).
alter table cards drop constraint if exists cards_type_check;
alter table cards add constraint cards_type_check check (type in
  ('Core', 'Growth', 'Explore', 'Innovation Strategy', 'Analyst', 'BOOM', 'BUST', 'Advisor', 'Management Event',
   'Management Challenge', 'Management Task', 'Strategic Dilemma', 'Weak Signal', 'Market News', 'Company', 'Super CEO', 'Other'));

-- The Dragon Drive strategy & investment case document, regenerated on demand (latest wins).
create table if not exists strategy_docs (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  content jsonb not null
);
alter table strategy_docs enable row level security;
alter table workbook add column if not exists summary jsonb; -- precomputed figures for the dashboard/certificate, keyed to updated_at

-- Six teams in the game (rivals 2-6); last automatic sync from the class sheet.
alter table workbook add column if not exists synced_at timestamptz;
delete from teams where team_number > 6;
alter table teams drop constraint if exists teams_team_number_check;
alter table teams add constraint teams_team_number_check check (team_number between 2 and 6);

-- Team tasks per role (kanban). Created from intake actions or by hand.
create table if not exists tasks (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  role text not null check (role in ('CEO', 'CFO', 'CSO', 'CAIO', 'IM', 'IRM')),
  title text not null,
  detail text not null default '',
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  due text not null default '',
  source text not null default ''
);
create index if not exists tasks_role_status on tasks (role, status);
alter table tasks enable row level security;

-- Dice rolls: each roll costs $100k (workbook column C = cost base x number of rolls).
create table if not exists rolls (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  year int not null,
  square text not null,
  note text not null default '',
  cost double precision not null default 100000,
  booked boolean not null default false
);
alter table rolls enable row level security;

-- Presentation decks (e.g. Annual Shareholder Meeting & Analyst Day), latest per event wins.
create table if not exists decks (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  event text not null,
  content jsonb not null
);
alter table decks enable row level security;

-- Organizational memory: accepted/rejected decisions, insights and task results Claude reads on every
-- request; plus full copilot transcripts.
create table if not exists knowledge (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('decision', 'insight', 'result')),
  text text not null,
  source text not null default '',
  role text not null default ''
);
create table if not exists threads (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null default '',
  task_id bigint,
  messages jsonb not null default '[]'
);
alter table knowledge enable row level security;
alter table threads enable row level security;

-- $50B-by-Year-3 goal and the Capital board (idea -> pitching -> locked), with each strategy's effect
-- on the market-cap levers so the simulator can project the path.
alter table strategy add column if not exists goal_year int not null default 3;
alter table strategy add column if not exists goal_cap double precision not null default 50000;
alter table financing_ideas drop constraint if exists financing_ideas_status_check;
update financing_ideas set status = 'locked' where status = 'picked';
alter table financing_ideas add constraint financing_ideas_status_check check (status in ('idea', 'pitching', 'locked', 'rejected'));
alter table financing_ideas add column if not exists effect jsonb;
alter table financing_ideas add column if not exists year int;
alter table financing_ideas add column if not exists scale double precision not null default 1;
alter table financing_ideas add column if not exists aggressiveness int;
alter table financing_ideas add column if not exists legal_basis text not null default '';
alter table financing_ideas add column if not exists red_lines text not null default '';
alter table financing_ideas add column if not exists pitch_to text not null default '';

-- The copilot's latest 'what should we do next' suggestion (regenerated when stale).
create table if not exists next_moves (id bigint primary key generated always as identity, created_at timestamptz not null default now(), content jsonb not null);
alter table next_moves enable row level security;

alter table strategy add column if not exists analyst_target jsonb not null default '[0,0,0,0,0]'; -- goal-year rating mix: Outperform, Buy, Hold, Sell, Crash

-- Snapshots of our numbers at key rounds (manual or after a sync that changed Team 1) - the comeback story.
create table if not exists round_snapshots (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  label text not null,
  year int not null,
  data jsonb not null
);
alter table round_snapshots enable row level security;

-- Per-tab copilot threads, and who said what in them.
alter table threads add column if not exists tab text not null default 'Dashboard';

-- Activity log: who (role) did what, on which tab, and what came of it. thread_id links decisions
-- back to the conversation that proposed them (lineage).
create table if not exists activity (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  role text not null default '',
  tab text not null default '',
  kind text not null check (kind in ('chat', 'decision', 'action')),
  summary text not null,
  detail jsonb not null default '{}',
  thread_id text
);
create index if not exists activity_created on activity (created_at desc);
alter table activity enable row level security;

-- The game round we're in (alongside current_year), and which year/round each card was drawn in.
alter table strategy add column if not exists current_round int not null default 1;
alter table cards add column if not exists drawn_year int;
alter table cards add column if not exists drawn_round int;
-- Borrowing / capital suggestions: where the money would be spent.
alter table financing_ideas add column if not exists uses jsonb not null default '[]';

-- Comparable valuations for investors (researched live, each with its date and source).
create table if not exists comps (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  batch timestamptz not null,
  grp text not null,
  horizon text not null default '',
  company text not null,
  ticker text not null default '',
  valuation_usd_b double precision,
  basis text not null default '',
  as_of text not null default '',
  revenue_usd_b double precision,
  revenue_period text not null default '',
  ev_revenue double precision,
  source_name text not null default '',
  source_url text not null default '',
  why text not null default '',
  caveat text not null default ''
);
alter table comps enable row level security;
