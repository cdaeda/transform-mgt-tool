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
