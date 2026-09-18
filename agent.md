# OpenMascot — how to run this app

A branded assistant on the owner's own website. It answers visitors from
material the owner controls, and hands the conversation to a person whenever one
is wanted.

## Division of labour

- **Never answer a visitor yourself.** You have no route to a live visitor, and
  the widget is not a channel you sit on. What you do is curate what the mascot
  knows and watch the conversations it could not handle.
- **Never invent knowledge.** Everything the mascot says comes from `sources`.
  If it is answering badly, the fix is a source, not a prompt tweak — and a
  source you made up becomes a claim the company makes to a customer.
- **Do not widen `allowed_origins` to make something work.** An empty list means
  the widget refuses everyone, which is the safe default, not a bug. Add the
  owner's real domain and nothing else.
- Replying in a conversation is a real message to a real person. Ask the owner
  before you write one unless they have told you to handle the inbox.

## The procedure

Setting one up:

1. `POST /api/mascots` with a `name` and the owner's domain in
   `allowed_origins`. Keep the reply: `key` is what the snippet carries.
2. Read the owner's own pages into it: `POST /api/mascots/{id}/sources` with
   `{ "kind": "url", "url": "https://their-site.com/…" }`, one call per page.
   Start with the homepage, what they do, pricing and contact.
3. Add what is true but is not written anywhere:
   `{ "kind": "text", "title": "…", "content": "…" }`. Opening hours, what they
   do not do, who they are not for. This is where the mascot gets good.
4. Give the owner the snippet:
   `<script src="https://<this-app>/w/<key>.js" async></script>`, just before
   the closing body tag.
5. Check `GET /api/overview` a day later. `waiting` above zero means people are
   asking things it cannot answer.

Keeping it good — the loop worth running weekly:

1. `GET /api/conversations?status=waiting_human` — the questions it could not
   answer are the gaps in what it knows.
2. For each recurring one, add a source that answers it, then tell the owner
   what you added and why.
3. `GET /api/conversations?status=ai` and read a few. A confident wrong answer
   is worse than a handoff, and the only place to catch it is here.

## Pages

- `/` — Overview. Screenshot-friendly: today's counts and the rules it follows.
- `/inbox` — Conversations, filtered to the ones waiting on a person.
- `/knowledge` — Everything it knows, as stored words.
- `/settings` — Who it is, which sites may use it, what it may spend.

## API anchors

Shapes are in `/api/openapi.json` and `/llms.txt`; read those rather than
trusting a list here. The two you will write most:

```
POST /api/mascots/{id}/sources   { "kind": "url",  "url": "https://…" }
POST /api/mascots/{id}/sources   { "kind": "text", "title": "…", "content": "…" }
```

- `GET /api/overview` — the four counts. Free.
- `GET /api/conversations?status=waiting_human` — the queue that matters.
- `POST /api/conversations/{id}/reply` — writes as a person and takes the
  conversation over. The model stays out of it until someone sets the status
  back to `ai`.

## Reading failures

- `403 "No such mascot"` on a source call means the id belongs to another org.
- A source with `kind: "url"` returns the page's own complaint verbatim: "That
  page answered 404", "That address is not a web page". Pass it to the owner,
  they typed the address.
- The widget answering "This assistant is not available on this site" is the
  origin allowlist, every time. Compare the site's real domain with
  `allowed_origins`.
- A visitor getting the handoff line for everything, with no error anywhere,
  means `sources` is empty. The mascot is behaving correctly and knows nothing.

## Cost

- **Spends the org's credits:** every visitor message in `ai` mode, once per
  turn. `daily_reply_cap` is the ceiling and the app enforces it; past it the
  mascot takes messages instead of answering.
- **Free:** every route in this file except the visitor's own chat. Reading a
  page into `sources` is a plain fetch and costs nothing, and re-reading a page
  is cheaper than letting the mascot guess.
- Adding sources does not cost per answer in proportion to how many you add: the
  prompt is capped. Beyond the cap the oldest sources stop being sent, so prune
  rather than pile up.
