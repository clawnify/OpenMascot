// The script a customer pastes into their site.
//
// It renders inside a Shadow DOM, so the host page's stylesheet cannot reach
// in and nothing here leaks out. It ships as one file with no dependencies
// because it runs on somebody else's page, where every kilobyte and every
// global is borrowed.
//
// Everything visible is the customer's brand, which is why this file paints raw
// colour values instead of design tokens and is listed in .design-lint-ignore.
// The app's own screens follow the design system; this is their website.

export interface WidgetConfig {
  origin: string;
  key: string;
  name: string;
  accent: string;
  avatarUrl: string | null;
  greeting: string;
  tagline: string;
  suggested: string[];
  /** What reads on the brand colour. Derived, never configured. */
  ink: string;
  /** Pre-rendered character for the launcher and the panel header, or "" for
   *  none. Rendered server-side because the silhouette set lives there and the
   *  widget should not ship a shape library it may never use. */
  charLaunch: string;
  charHead: string;
}

/** Injected as JSON rather than interpolated field by field: one escape
 *  boundary to get right instead of eight. */
export function widgetScript(config: WidgetConfig): string {
  return SCRIPT.replace("__CONFIG__", JSON.stringify(config));
}

const SCRIPT = String.raw`(function () {
  var CFG = __CONFIG__;
  if (window.__openMascot && window.__openMascot[CFG.key]) return;
  window.__openMascot = window.__openMascot || {};
  window.__openMascot[CFG.key] = true;

  var STORE = "openmascot:" + CFG.key;
  var state = { open: false, convo: null, token: null, status: "ai", last: "", busy: false, asked: false };

  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && saved.convo && saved.token) { state.convo = saved.convo; state.token = saved.token; state.last = saved.last || ""; }
  } catch (e) {}

  function remember() {
    try { localStorage.setItem(STORE, JSON.stringify({ convo: state.convo, token: state.token, last: state.last })); } catch (e) {}
  }

  var host = document.createElement("div");
  host.setAttribute("data-openmascot", CFG.key);
  var root = host.attachShadow({ mode: "open" });
  document.body.appendChild(host);

  var style = document.createElement("style");
  style.textContent = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    ".wrap{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:12px}",
    ".launch{width:56px;height:56px;border-radius:9999px;border:0;cursor:pointer;background:var(--accent);color:var(--ink);box-shadow:0 6px 24px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;padding:0;overflow:hidden}",
    ".launch:focus-visible{outline:3px solid var(--accent);outline-offset:3px}",
    ".launch img{width:100%;height:100%;object-fit:cover}",
    ".launch svg{width:26px;height:26px}",
    ".panel{width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden}",
    ".panel.on{display:flex}",
    ".head{background:var(--accent);color:var(--ink);padding:14px 16px;display:flex;align-items:center;gap:10px}",
    ".head .av{width:34px;height:34px;border-radius:9999px;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none}",
    ".head .av img{width:100%;height:100%;object-fit:cover}",
    ".head h2{margin:0;font-size:15px;font-weight:600;line-height:1.2}",
    ".head p{margin:2px 0 0;font-size:12px;opacity:.85;line-height:1.2}",
    ".head button{margin-left:auto;background:transparent;border:0;color:var(--ink);cursor:pointer;font-size:20px;line-height:1;padding:4px 6px;border-radius:8px}",
    ".head button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}",
    ".log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f7f7f8}",
    ".msg{max-width:84%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}",
    ".them{background:#fff;color:#18181b;border:1px solid #e4e4e7;align-self:flex-start;border-bottom-left-radius:4px}",
    ".me{background:var(--accent);color:var(--ink);align-self:flex-end;border-bottom-right-radius:4px}",
    ".who{font-size:11px;color:#71717a;margin:0 0 -4px 4px;align-self:flex-start}",
    ".chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 10px;background:#f7f7f8}",
    ".chip{background:#fff;border:1px solid #e4e4e7;color:#3f3f46;border-radius:9999px;padding:6px 11px;font-size:13px;cursor:pointer}",
    ".chip:hover{border-color:var(--accent);color:var(--accent)}",
    ".chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}",
    ".ask{padding:10px 16px;background:#fffbeb;border-top:1px solid #fde68a;display:flex;gap:6px}",
    // An author-level display:flex beats the UA stylesheet's display:none for
    // [hidden], so without this the email capture shows on every conversation
    // from the first frame, before anyone has asked for a person.
    ".ask[hidden]{display:none}",
    ".ask input{flex:1;min-width:0;border:1px solid #e4e4e7;border-radius:9px;padding:8px 10px;font-size:13px}",
    ".ask button{border:0;background:var(--accent);color:var(--ink);border-radius:9px;padding:8px 12px;font-size:13px;cursor:pointer}",
    ".bar{display:flex;gap:8px;padding:12px;border-top:1px solid #e4e4e7;background:#fff}",
    ".bar textarea{flex:1;resize:none;border:1px solid #e4e4e7;border-radius:10px;padding:9px 11px;font-size:14px;line-height:1.4;max-height:96px;min-height:38px}",
    ".bar textarea:focus{outline:2px solid var(--accent);outline-offset:-1px}",
    ".bar button{border:0;background:var(--accent);color:var(--ink);border-radius:10px;width:38px;height:38px;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center}",
    ".bar button:disabled{opacity:.5;cursor:default}",
    ".bar svg{width:17px;height:17px}",
    ".dots{display:flex;gap:3px;align-self:flex-start;padding:10px 12px;background:#fff;border:1px solid #e4e4e7;border-radius:14px}",
    ".dots i{width:5px;height:5px;border-radius:9999px;background:#a1a1aa;animation:b 1.2s infinite}",
    ".dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}",
    "@keyframes b{0%,60%,100%{opacity:.3}30%{opacity:1}}",
    "@media (prefers-reduced-motion:reduce){.dots i{animation:none;opacity:.6}}",
    // ── the character ───────────────────────────────────────────────────
    // Motion carries status, so there is no second badge to read. Amplitudes
    // are deliberately tiny: at 0.6deg it reads as alive rather than as an
    // animation, which is what lets it sit on someone's page all day.
    ".om-ch{display:block;overflow:visible}",
    ".om-body{transform-box:fill-box;transform-origin:50% 50%}",
    ".om-eyes{transform-box:fill-box;transform-origin:50% 50%}",
    "@keyframes om-breathe{0%,100%{transform:rotate(-0.6deg) scaleY(1)}50%{transform:rotate(0.6deg) scaleY(.9937)}}",
    "@keyframes om-blink{0%,92%,100%{transform:scaleY(1)}95%,97%{transform:scaleY(.08)}}",
    "@keyframes om-think{0%,100%{transform:rotate(-1.4deg) scaleY(1)}50%{transform:rotate(1.4deg) scaleY(.985)}}",
    "@keyframes om-scan{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}",
    "@keyframes om-wait{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}",
    ".st-idle .om-body{animation:om-breathe 4.2s ease-in-out infinite}",
    ".st-idle .om-eyes{animation:om-blink 6.5s linear infinite}",
    ".st-think .om-body{animation:om-think 1.15s ease-in-out infinite}",
    ".st-think .om-eyes{animation:om-scan 1.9s ease-in-out infinite}",
    ".st-wait .om-body{animation:om-wait 3.6s ease-in-out infinite}",
    ".st-wait .om-eyes{animation:om-blink 9s linear infinite}",
    // Blocked has no body animation at all. Stillness is the signal, and it
    // costs nothing to render.
    ".st-block .om-body,.st-block .om-eyes{animation:none}",
    ".st-block .om-eye{transform-box:fill-box;transform-origin:50% 50%;transform:scaleY(.26)}",
    // A character carries the brand colour itself, so the surfaces behind it go
    // neutral. Painting an accent-coloured character onto an accent-coloured
    // launcher would make it invisible on every install that took the default.
    ".launch.om-has{background:#fff}",
    ".head .av.om-has{background:rgba(255,255,255,.92)}",
    "@media (prefers-reduced-motion:reduce){.om-body,.om-eyes{animation:none !important}}",
    ".sent{font-size:12px;color:#71717a;text-align:center;padding:2px 4px 0}",
    // margin:0 is load-bearing. This is a <p>, and :host{all:initial} does not
    // reach descendants, so it kept the user-agent's 1em top and bottom margin.
    // That put 23px above the line and 19px below it. The bar's own 12px of
    // bottom padding is the gap above, so the padding below matches it.
    ".foot{font-size:11px;color:#a1a1aa;text-align:center;margin:0;padding:0 0 12px;background:#fff}",
    ".foot a{color:#a1a1aa}",
  ].join("");
  root.appendChild(style);

  var wrap = document.createElement("div");
  wrap.className = "wrap";
  wrap.style.setProperty("--accent", CFG.accent || "#4f46e5");
  wrap.style.setProperty("--ink", CFG.ink || "#ffffff");
  var avatar = CFG.avatarUrl ? '<img src="' + esc(CFG.avatarUrl) + '" alt="">' : "";
  // Precedence: a drawn character, then an uploaded image, then the fallback
  // glyph. The character is preferred at 34px and 56px because an illustration
  // is a smudge at that size and a silhouette is a mark.
  var headMark = CFG.charHead || avatar || bubbleSvg;
  var launchMark = CFG.charLaunch || avatar || bubbleSvg;
  var hasCh = CFG.charLaunch ? " om-has" : "";
  var bubbleSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.3-.9L3 20l1.3-4.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>';

  wrap.innerHTML =
    '<div class="panel" role="dialog" aria-label="Chat with ' + esc(CFG.name) + '">' +
      '<div class="head"><div class="av' + hasCh + '">' + headMark + "</div>" +
        "<div><h2>" + esc(CFG.name) + "</h2>" + (CFG.tagline ? "<p>" + esc(CFG.tagline) + "</p>" : "") + "</div>" +
        '<button type="button" data-close aria-label="Close chat">&times;</button></div>' +
      '<div class="log" role="log" aria-live="polite"></div>' +
      '<div class="chips"></div>' +
      '<form class="ask" hidden><input type="email" placeholder="Your email" aria-label="Your email" /><button type="submit">Send</button></form>' +
      '<form class="bar"><textarea rows="1" placeholder="Write a message" aria-label="Write a message"></textarea>' +
        '<button type="submit" aria-label="Send message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/></svg></button></form>' +
      '<p class="foot">Powered by <a href="https://clawnify.com" target="_blank" rel="noopener">Clawnify</a></p>' +
    "</div>" +
    '<button class="launch' + hasCh + '" type="button" aria-label="Chat with ' + esc(CFG.name) + '">' + launchMark + "</button>";
  root.appendChild(wrap);

  // Every character instance moves together: the launcher and the header are
  // the same bot, so they must never disagree about what it is doing.
  function setState(next) {
    root.querySelectorAll(".om-ch").forEach(function (el) {
      el.classList.remove("st-idle", "st-think", "st-wait", "st-block");
      el.classList.add("st-" + next);
    });
  }
  setState("idle");

  /** The status the server reports, mapped to how the character should move. */
  function stateFor(status) {
    return status === "waiting_human" || status === "human" ? "wait" : "idle";
  }

  var panel = root.querySelector(".panel");
  var log = root.querySelector(".log");
  var chips = root.querySelector(".chips");
  var bar = root.querySelector(".bar");
  var field = root.querySelector(".bar textarea");
  var send = root.querySelector(".bar button");
  var ask = root.querySelector(".ask");
  var askField = root.querySelector(".ask input");

  root.querySelector(".launch").addEventListener("click", toggle);
  root.querySelector("[data-close]").addEventListener("click", toggle);
  bar.addEventListener("submit", function (e) { e.preventDefault(); say(field.value); });
  field.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); say(field.value); }
  });
  ask.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = askField.value.trim();
    if (!email) return;
    post("/api/public/contact", { key: CFG.key, conversation: state.convo, token: state.token, email: email });
    ask.hidden = true;
    state.asked = true;
    add({ role: "assistant", body: "Thank you. Someone will come back to you at " + email + ".", author_name: CFG.name });
  });

  function toggle() {
    state.open = !state.open;
    panel.classList.toggle("on", state.open);
    if (state.open) {
      if (!log.childElementCount) greet();
      field.focus();
      poll();
    }
  }

  function greet() {
    add({ role: "assistant", body: CFG.greeting, author_name: CFG.name });
    (CFG.suggested || []).forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = q;
      b.addEventListener("click", function () { say(q); });
      chips.appendChild(b);
    });
  }

  function add(m) {
    if (m.role !== "visitor" && m.author_name) {
      var who = document.createElement("p");
      who.className = "who";
      who.textContent = m.author_name;
      log.appendChild(who);
    }
    var el = document.createElement("div");
    el.className = "msg " + (m.role === "visitor" ? "me" : "them");
    el.textContent = m.body;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    if (m.created_at && m.created_at > state.last) { state.last = m.created_at; remember(); }
  }

  // Once a person has been asked for, the server stops replying: the model must
  // not answer over a colleague. That is correct, but it leaves a visitor who
  // writes again with no acknowledgement at all, which reads as broken. This is
  // a receipt, not a message: it is never stored, so whoever picks the thread up
  // does not find a line they never wrote. One element, moved to the end, so a
  // run of messages does not stack up a column of identical notes.
  function receipt(text) {
    var el = root.querySelector(".sent");
    if (!el) {
      el = document.createElement("p");
      el.className = "sent";
    }
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function thinking(on) {
    var d = root.querySelector(".dots");
    if (on && !d) {
      d = document.createElement("div");
      d.className = "dots";
      d.innerHTML = "<i></i><i></i><i></i>";
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    } else if (!on && d) d.remove();
  }

  function say(text) {
    text = (text || "").trim();
    if (!text || state.busy) return;
    chips.innerHTML = "";
    field.value = "";
    add({ role: "visitor", body: text });
    state.busy = true;
    send.disabled = true;
    setState("think");
    thinking(true);
    post("/api/public/chat", {
      key: CFG.key, conversationId: state.convo, token: state.token, message: text, pageUrl: location.href,
    })
      .then(function (data) {
        thinking(false);
        if (!data) return;
        if (data.error) {
          // A refusal is a dead end for this visitor, not a pause. Stillness
          // says so without another line of copy.
          setState("block");
          add({ role: "assistant", body: data.error, author_name: CFG.name });
          return;
        }
        state.convo = data.conversationId;
        state.token = data.token;
        state.status = data.status;
        setState(stateFor(data.status));
        remember();
        var replies = data.messages || [];
        replies.forEach(add);
        if (!replies.length && data.status !== "ai") {
          receipt("Sent. Someone will reply here.");
        }
        if (data.status !== "ai" && !state.asked) {
          ask.hidden = false;
          // Revealing the capture band shortens the log, so the message that
          // triggered it ends up clipped unless we scroll again afterwards.
          log.scrollTop = log.scrollHeight;
        }
      })
      .catch(function () {
        thinking(false);
        setState("block");
        add({ role: "assistant", body: "Something went wrong on our side. Please try again.", author_name: CFG.name });
      })
      .then(function () { state.busy = false; send.disabled = false; field.focus(); });
  }

  // A colleague typing a reply in the dashboard has no way to push it here, so
  // the panel asks while it is open. It stops the moment it is closed: a widget
  // that keeps polling on every page of a site nobody is chatting on is a cost
  // the customer never agreed to.
  function poll() {
    if (!state.open || !state.convo) return;
    var url = CFG.origin + "/api/public/messages?key=" + encodeURIComponent(CFG.key) +
      "&conversation=" + encodeURIComponent(state.convo) +
      "&token=" + encodeURIComponent(state.token) +
      "&after=" + encodeURIComponent(state.last || "");
    fetch(url, { method: "GET" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.messages && data.messages.length) {
          var note = root.querySelector(".sent");
          if (note) note.remove();
          data.messages.forEach(add);
        }
        if (data && data.status) { state.status = data.status; setState(stateFor(data.status)); }
      })
      .catch(function () {})
      .then(function () { if (state.open) setTimeout(poll, 6000); });
  }

  function post(path, body) {
    return fetch(CFG.origin + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json().catch(function () { return null; }); });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
})();
`;
