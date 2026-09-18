// OpenMascot — the API.
//
// `createApp` brings the OpenAPI router, the per-request database wiring, and
// the two discovery routes (`/api/openapi.json`, `/llms.txt`) that let the org's
// agent learn this API without anyone documenting it twice.

import { createApp } from "@clawnify/app";
import type { Env } from "./env.js";
import { registerMascots } from "./routes/mascots.js";
import { registerSources } from "./routes/sources.js";
import { registerInbox } from "./routes/inbox.js";
import { registerPublic } from "./routes/public.js";

const app = createApp<Env>({
  title: "OpenMascot",
  version: "1.0.0",
  description:
    "A branded assistant on a company's own website: it answers visitors from material the company controls, captures who was asking, and hands the conversation to a person whenever one is wanted.",
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || String(err) }, 500);
});

registerMascots(app);
registerSources(app);
registerInbox(app);

// Last, and off the OpenAPI surface: the widget loader and the three routes a
// visitor's browser calls. Registered after the authenticated routes so a
// public path can never shadow one.
registerPublic(app);

export default app;
