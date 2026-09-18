-- The DDL the deploy applies. `clawnify deploy` reconciles THIS file and
-- nothing else, and reconciliation is additive: it adds missing columns and
-- never drops anything, so editing this file in place is safe against a live
-- database. Template repos carry no migrations/ folder — migrations are per
-- deployed instance, tracked in each app's own D1.

-- One row per assistant. An install can run several: an agency puts one on each
-- client site, and `key` is what the embed snippet carries, so the public half
-- of this app never needs to know an org id.
CREATE TABLE IF NOT EXISTS mascots (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL,
  -- Public, unguessable, and the only identifier that appears in the snippet.
  key              TEXT NOT NULL,
  name             TEXT NOT NULL,
  avatar_url       TEXT,
  -- The customer's brand colour, stored as a value rather than a token because
  -- it is painted into a widget that runs on somebody else's stylesheet.
  accent           TEXT NOT NULL DEFAULT '#4f46e5',
  greeting         TEXT NOT NULL DEFAULT '',
  tagline          TEXT NOT NULL DEFAULT '',
  -- 'ai'    = the model answers first, a person can take any conversation over
  -- 'human' = the model is never called; every message waits for a person
  mode             TEXT NOT NULL DEFAULT 'ai',
  -- JSON array of starter questions shown before the visitor types.
  suggested        TEXT NOT NULL DEFAULT '[]',
  booking_url      TEXT,
  -- What the visitor is told the moment a person is needed. In human-only
  -- mode this is the entire reply they get, so it is the whole UX of that
  -- mode rather than a fallback string.
  handoff_message  TEXT NOT NULL DEFAULT '',
  -- JSON array of origins allowed to embed and to call the public API. Empty
  -- means nobody: the widget refuses rather than answering for any site that
  -- pastes the snippet. Set at install from the deploy answers.
  allowed_origins  TEXT NOT NULL DEFAULT '[]',
  -- Extra persona/voice instructions from the owner, appended to the prompt.
  ai_instructions  TEXT NOT NULL DEFAULT '',
  -- Hard ceiling on model replies per UTC day. Past it the mascot stops calling
  -- the model and offers to take a message instead, so a scraped snippet can
  -- never run an org's credits down.
  daily_reply_cap  INTEGER NOT NULL DEFAULT 200,
  locale           TEXT NOT NULL DEFAULT 'en',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS mascots_by_key ON mascots (key);
CREATE INDEX IF NOT EXISTS mascots_by_org ON mascots (org_id, created_at);

-- What the mascot is allowed to know. Everything it says is grounded in these
-- rows; there is no other retrieval path.
CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  mascot_id   TEXT NOT NULL,
  -- 'text' = pasted by the owner, 'url' = fetched from a page they named.
  kind        TEXT NOT NULL DEFAULT 'text',
  title       TEXT NOT NULL DEFAULT '',
  url         TEXT,
  content     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sources_by_mascot ON sources (mascot_id, created_at);

-- One thread per visitor session.
CREATE TABLE IF NOT EXISTS conversations (
  id                    TEXT PRIMARY KEY,
  org_id                TEXT NOT NULL,
  mascot_id             TEXT NOT NULL,
  -- Returned to the browser once and required on every later public call. The
  -- conversation id alone is never enough to read a thread, so guessing one
  -- leaks nothing.
  token                 TEXT NOT NULL,
  -- 'ai'            = the model is answering
  -- 'waiting_human' = a person has been asked for and has not replied yet
  -- 'human'         = a person took it over; the model stays out of it
  -- 'closed'        = done
  status                TEXT NOT NULL DEFAULT 'ai',
  unread                INTEGER NOT NULL DEFAULT 0,
  page_url              TEXT,
  referrer              TEXT,
  country               TEXT,
  visitor_name          TEXT,
  visitor_email         TEXT,
  last_message_at       TEXT NOT NULL,
  last_message_preview  TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_by_token ON conversations (token);
CREATE INDEX IF NOT EXISTS conversations_by_org_recency ON conversations (org_id, last_message_at);
CREATE INDEX IF NOT EXISTS conversations_by_mascot_status ON conversations (mascot_id, status, last_message_at);

-- mascot_id is denormalised onto the message so the two hot counts (today's
-- model replies, this minute's messages from one address) are single-table
-- index reads rather than a join on every visitor keystroke.
CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL,
  mascot_id        TEXT NOT NULL,
  conversation_id  TEXT NOT NULL,
  -- 'visitor' | 'assistant' (the model) | 'human' (someone on the team)
  role             TEXT NOT NULL,
  body             TEXT NOT NULL,
  author_name      TEXT,
  -- Salted hash of the sender's address, kept only to rate-limit the next few
  -- minutes of traffic. The address itself is never stored.
  ip_hash          TEXT,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_by_rate_limit ON messages (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS messages_by_mascot_role ON messages (mascot_id, role, created_at);
