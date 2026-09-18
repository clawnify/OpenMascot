# OpenMascot

**Your mascot, answering visitors on your own website.**

[![Deploy to Clawnify](https://app.clawnify.com/deploy-button.svg)](https://app.clawnify.com/deploy?repo=clawnify/OpenMascot)

An open-source app template provided by [Clawnify.com](https://clawnify.com).

Most companies already have a character: the one on the van, the one in the
newsletter sign-off, the one everybody at the office calls by name. OpenMascot
puts that character on your website as an assistant, so a visitor at 22:00 gets
an answer instead of a contact form.

It answers from material you control, and nothing else. When it does not know,
it says so and takes a message rather than inventing something you will have to
honour later.

## How it works

```
Visitor on your site
  └─ one <script> tag → the mascot answers in about two seconds
       ├─ it knows the answer        → done, from your own words
       └─ it does not, or they ask   → the conversation waits for a person
                                        in your inbox, and you reply as you
```

Two modes, one setting:

- **It answers, you can take over.** The default. It handles what it knows, and
  anything else lands in your inbox. The moment you reply, it stays out of that
  conversation until you hand it back.
- **It takes messages, you answer everything.** The AI is never called. The
  widget is a live chat box wearing your character's face.

## What it does

- **One script tag, any site.** It renders in an isolated root, so your
  stylesheet cannot break it and it cannot leak into your page. No dependencies.
- **Grounded answers.** Everything it says comes from pages you point it at and
  notes you write. It is told to hand off rather than guess, and it is checked
  rather than trusted: an unparseable answer becomes a handoff, not a shrug.
- **Real people, in the same thread.** Take any conversation over and type as
  yourself. The visitor sees it on the page they are still standing on.
- **Who was asking.** Names and emails land on the conversation, so a good
  question becomes a lead rather than a log line.
- **Your character, not ours.** Name, picture, colour, opening line, starter
  questions and house rules.
- **Limits that hold.** A copied snippet is useless on a site you did not allow,
  one address cannot flood it, and a per-day ceiling means the worst case is a
  quiet mascot rather than a surprise bill.

## Run it locally

```bash
pnpm install
pnpm dev          # UI on :5173, API on :8787
```

`pnpm test` runs the checks. `pnpm typecheck` and `pnpm build` are the other two
gates.

The assistant needs a model key, which Clawnify resolves for you on a deployed
install. Locally, put `OPENROUTER_API_KEY` in `.dev.vars` if you want it to
answer; without one everything else still works and the mascot takes messages.

## What it knows

This is the screen that decides whether it is useful or embarrassing.

- **Read a page.** Give it one of your own URLs. It fetches it once and keeps
  the words. It is a snapshot, so add the same address again after you change
  the page.
- **Write something down.** The things that are true but are not on any page:
  what you do not do, how you price, who you are not for.

If it answers badly, the fix is here. There is no other place an answer can come
from.

## Where it may be used

A snippet is public: anyone who views the source of your site can read it. The
allowlist is what makes a copied one useless somewhere else, so a mascot with an
empty list answers nobody. That is the safe default, not a bug — put your domain
in it and the widget works, on that site and no other.

## Configuration

Everything is on the Settings screen. Two worth knowing about:

- **Answers per day.** The ceiling on how many times it will call the model in a
  day. Past it the widget keeps working and takes messages instead.
- **House rules.** Added to every answer it writes. Use it for the things you
  would tell a new hire on their first morning.

## Licence

MIT.
