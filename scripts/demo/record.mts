/**
 * A product demo, recorded from a script rather than a screen.
 *
 *   pnpm demo:record                      # frames into ./tmp/demo-frames
 *   ffmpeg -framerate 12 -i tmp/demo-frames/f%05d.jpg -c:v libx264 \
 *     -pix_fmt yuv420p -r 30 -movflags +faststart tmp/demo.mp4
 *
 * Headless Chrome walks the dev server through the story in STORY below —
 * sign in, find and follow a team, read the feed, post a pickup game, ask
 * the community — while a drawn cursor and a caption bar are laid over the
 * page and a frame is captured every 1/FPS s. Nothing is recorded off a
 * screen; every frame is the page as the browser rendered it, so a take can
 * be re-run after a copy change without anybody sitting through it again.
 *
 * Signed in with the dev login as a fresh account, so what the viewer sees
 * is what a new parent sees. Local data only.
 *
 * Each caption is also spoken, by the Mac's own voice (`say`), and a
 * caption holds at least as long as its line takes to say. The clips are
 * laid on the timeline where their captions appeared and ffmpeg muxes them
 * with the frames, so the run ends with tmp/demo.mp4 rather than a folder.
 * DEMO_VOICE picks the voice; no `say` or `ffmpeg` and it is a silent film.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const BASE = process.env.DEMO_BASE ?? "http://localhost:3000";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "tmp/demo-frames";
/**
 * Landscape for a news post, portrait for Instagram.
 *
 * 1440×810 at 1.333× is 1080p with text a viewer can read — the page is
 * max-w-6xl and at 1920×1 it sits small in the middle of the frame. The
 * phone take is a real phone: 432×768 at 2.5× is 1080×1920, and the site
 * renders its phone layout (drawer, single column) because the viewport
 * is one.
 */
const PHONE = process.env.DEMO_FORMAT === "phone";
const W = PHONE ? 432 : 1440, H = PHONE ? 768 : 810, DSF = PHONE ? 2.5 : 4 / 3, FPS = 12;
const OUTPUT = PHONE ? "tmp/demo-phone.mp4" : "tmp/demo.mp4";
const EMAIL = process.env.DEMO_EMAIL ?? `demo-${Date.now()}@kjs.test`;
/**
 * The most natural voice this Mac has. Apple's Premium and Enhanced voices
 * are neural and sound like a person; they are free downloads in System
 * Settings → Accessibility → Spoken Content → System Voice → Manage Voices,
 * and are used the moment they exist. The stock Samantha is the fallback,
 * and it sounds like what it is.
 */
const PREFERRED = ["Ava (Premium)", "Zoe (Premium)", "Allison (Premium)", "Samantha (Enhanced)", "Ava (Enhanced)", "Evan (Enhanced)", "Samantha"];
function bestVoice(): string {
  if (process.env.DEMO_VOICE) return process.env.DEMO_VOICE;
  try {
    const installed = execFileSync("say", ["-v", "?"]).toString();
    return PREFERRED.find((v) => installed.includes(v)) ?? "Samantha";
  } catch {
    return "Samantha";
  }
}
const VOICE = bestVoice();

/**
 * How the voice should say what the caption spells.
 *
 * "Juan" read as English comes out "Jwon" — the first take said "King 卷" —
 * so the spoken text respells it the way it is said, /wɑn/. Captions keep
 * the real spelling; only what is sent to `say` changes.
 */
const SPOKEN: [RegExp, string][] = [
  [/kingjuansoccer\.com/gi, "King Wahn Soccer dot com"],
  [/\bJuan\b/g, "Wahn"],
];
const spoken = (line: string) => SPOKEN.reduce((t, [from, to]) => t.replace(from, to), line);
const VOICES = "tmp/demo-voice";

// --- the story ------------------------------------------------------------

type Step =
  | { go: string; caption?: string; say?: string; hold?: number }
  | { caption: string; say?: string; hold?: number }
  | { hold: number }
  /** Spoken instead of the caption, where the caption is not how it is said. */
  | { say: string }
  | { move: string; hold?: number }
  | { click: string; hold?: number; caption?: string; say?: string }
  | { type: string; text: string; hold?: number }
  | { select: string; value: string; hold?: number }
  | { submit: string; hold?: number; caption?: string; say?: string }
  | { scroll: number; hold?: number }
  | { signin: true };

const STORY: Step[] = [
  { go: "/", caption: "King Juan Soccer — youth soccer in the Seattle area, in one place", hold: 3 },
  { scroll: PHONE ? 900 : 500, hold: 2.5 },
  // The live site, signed out: the dev server has no Google button.
  { go: "https://kingjuansoccer.com/signin", caption: "Sign in with Google. No form to fill.", hold: 2.5 },
  { move: "button:has-text(Continue with Google)", hold: 1.2 },
  { signin: true },
  { go: "/", caption: "Your page: what is next, your week, and the feed", hold: 2.5 },
  { click: 'input[type="search"]', caption: "Find your team…", hold: 0.8 },
  { type: 'input[type="search"]', text: "Seattle Celtic B15 White", hold: 1.5 },
  { click: '[role="option"] button', hold: 2.5 },
  { click: "button:has-text(Follow)", caption: "…and follow it", hold: 2.5 },
  { go: "/", caption: "Its next game is on your page — and in your calendar", hold: 3 },
  { scroll: PHONE ? 1100 : 700, hold: 3 },
  { go: "/events/new", caption: "Have a field and a few kids? Post a pickup game.", hold: 2 },
  { type: 'input[name="title"]', text: "Saturday pickup at Marymoor", hold: 0.6 },
  { select: 'select[name="kind"]', value: "pickup", hold: 0.6 },
  { type: 'input[name="date"]', text: "2026-09-19", hold: 0.4 },
  { type: 'input[name="time"]', text: "09:00", hold: 0.4 },
  { type: 'input[name="venueName"]', text: "Marymoor Park", hold: 0.6 },
  { type: 'textarea[name="summary"]', text: "Friendly 7v7, U10–U12. Bring both shirts. Parents welcome to jump in.", hold: 1 },
  { submit: 'input[name="title"]', caption: "Submitted. Once reviewed, anyone nearby can find it and RSVP.", hold: 3.5 },
  { go: "/community/new", caption: "Ask the community", hold: 2 },
  { type: 'input[name="title"]', text: "Any good group training for U11 keepers on the Eastside?", hold: 0.6 },
  { select: 'select[name="category"]', value: "coaching", hold: 0.5 },
  { type: 'textarea[name="body"]', text: "My daughter wants keeper-specific sessions this winter. Who have you used and liked?", hold: 1 },
  { submit: 'input[name="title"]', caption: "Posted — coaches and parents answer in the feed", hold: 3.5 },
  { go: "/", caption: "kingjuansoccer.com", say: "King Juan Soccer dot com. See you on the pitch.", hold: 4 },
  // (the closing line is respelled for the voice by SPOKEN above)
];

// --- the voice ------------------------------------------------------------

const has = (bin: string) => { try { execFileSync("which", [bin], { stdio: "ignore" }); return true; } catch { return false; } };
const SPEAK = has("say") && has("ffmpeg");
rmSync(VOICES, { recursive: true, force: true }); mkdirSync(VOICES, { recursive: true });
const clips = new Map<Step, { file: string; seconds: number }>();
if (SPEAK) {
  let n = 0;
  for (const step of STORY) {
    const line = "say" in step && step.say ? step.say : "caption" in step ? step.caption : null;
    if (!line) continue;
    const file = `${VOICES}/${String(n++).padStart(2, "0")}.aiff`;
    execFileSync("say", ["-v", VOICE, "-o", file, spoken(line)]);
    const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
    clips.set(step, { file, seconds });
    // A caption stays up at least as long as it takes to say.
    if ("hold" in step && step.hold !== undefined) step.hold = Math.max(step.hold, seconds + 0.5);
    else (step as { hold?: number }).hold = seconds + 0.5;
  }
  console.log(`${clips.size} lines spoken by ${VOICE}`);
}
/** Where on the timeline each clip starts, in seconds. */
const cues: { file: string; at: number }[] = [];

// --- CDP plumbing ---------------------------------------------------------

const PORT = 9444;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=tmp/demo-profile`,
  "--no-first-run", `--window-size=${W},${H}`, "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const ver = await (await fetch(`http://localhost:${PORT}/json/version`)).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
/** The slice of a CDP message this script reads. */
type Msg = {
  id?: number;
  method?: string;
  result?: { targetId?: string; sessionId?: string; data?: string; result?: { value?: string } };
};
let id = 0;
const pending = new Map<number, (m: Msg) => void>();
const events: ((m: Msg) => void)[] = [];
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data)) as Msg;
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  else events.forEach((f) => f(m));
};
const send = (method: string, params: object = {}, sessionId?: string) =>
  new Promise<Msg>((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const targetId = (await send("Target.createTarget", { url: "about:blank" })).result!.targetId!;
const sessionId = (await send("Target.attachToTarget", { targetId, flatten: true })).result!.sessionId!;
const s = (m: string, p: object = {}) => send(m, p, sessionId);
await s("Page.enable"); await s("Runtime.enable"); await s("Network.enable");
await s("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: PHONE });
if (PHONE) await s("Emulation.setTouchEmulationEnabled", { enabled: true });
const evaluate = async (expression: string) => (await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

// The cursor, the caption bar, and the hands that work them — on every page.
const OVERLAY = String.raw`
(() => {
  // Runs at document start, before there is a body to hang anything on.
  let c, cap;
  const ready = () => {
    if (c) return true;
    if (!document.body) return false;
    const css = document.createElement('style');
    css.textContent = '#kjs-cursor{position:fixed;z-index:2147483646;width:28px;height:28px;pointer-events:none;transition:transform .55s cubic-bezier(.2,.8,.2,1);transform:translate(720px,405px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))}'
      + '#kjs-cursor .ring{position:absolute;left:-10px;top:-10px;width:44px;height:44px;border-radius:50%;background:rgba(197,138,36,.35);transform:scale(0);opacity:0}'
      + '#kjs-cursor.click .ring{animation:kjs-ring .5s ease-out}'
      + '@keyframes kjs-ring{0%{transform:scale(0);opacity:1}100%{transform:scale(1.4);opacity:0}}'
      + '#kjs-caption{position:fixed;z-index:2147483645;left:50%;bottom:44px;transform:translateX(-50%) translateY(12px);opacity:0;transition:opacity .35s,transform .35s;background:rgba(34,28,20,.94);color:#fff;font:600 __CAPTION_PX__px/1.3 -apple-system,Inter,system-ui,sans-serif;padding:14px 24px;border-radius:14px;max-width:__CAPTION_MAX__;text-align:center;letter-spacing:.01em;box-shadow:0 8px 30px rgba(0,0,0,.35)}'
      + '#kjs-caption.on{opacity:1;transform:translateX(-50%) translateY(0)}';
    document.head.appendChild(css);
    c = document.createElement('div'); c.id = 'kjs-cursor';
    c.innerHTML = '<div class="ring"></div><svg width="28" height="28" viewBox="0 0 24 24"><path d="M5 3l14 8-6.5 1.5L9 19z" fill="#fff" stroke="#1a1712" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    cap = document.createElement('div'); cap.id = 'kjs-caption';
    document.body.appendChild(c); document.body.appendChild(cap);
    if (window.__kjsCaption) { cap.textContent = window.__kjsCaption; cap.classList.add('on'); }
    return true;
  };
  const boot = () => { if (!ready()) setTimeout(boot, 15); };
  boot();
  // The dev server's own badge has no place in a demo.
  const shoo = () => document.querySelectorAll('nextjs-portal').forEach((n) => n.remove());
  setInterval(shoo, 200);
  const find = (sel) => {
    const sub = sel.match(/^submit-of:(.*)$/);
    if (sub) { const el = find(sub[1]); const f = el && el.closest('form'); return f ? f.querySelector('button[type=submit]') : null; }
    const m = sel.match(/^(.*):has-text\((.*)\)$/);
    if (m) return [...document.querySelectorAll(m[1])].find((e) => e.textContent.trim().startsWith(m[2])) || null;
    return document.querySelector(sel);
  };
  window.kjs = {
    find,
    caption(t) { window.__kjsCaption = t; if (!ready()) return; if (!t) { cap.classList.remove('on'); return; } cap.textContent = t; cap.classList.add('on'); },
    center(sel) { const el = find(sel); if (!el) return null; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
    moveTo(x, y) { if (ready()) c.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 3) + 'px)'; },
    click(sel) {
      const el = find(sel); if (ready()) { c.classList.remove('click'); void c.offsetWidth; c.classList.add('click'); }
      if (!el) return false;
      // Focus only what takes typing: focusing a suggestion blurs the search
      // box, which dismisses the list — and the button with it — before the
      // click lands.
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.focus();
      el.click(); return true;
    },
    setValue(sel, v) {
      const el = find(sel); if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    scroll(y) { window.scrollTo({ top: y, behavior: 'smooth' }); },
  };
})();`;
await s("Page.addScriptToEvaluateOnNewDocument", {
  source: OVERLAY.replace("__CAPTION_PX__", PHONE ? "17" : "24").replace("__CAPTION_MAX__", PHONE ? "92vw" : "1100px"),
});

// --- frames ---------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
let frame = 0;
async function capture(seconds: number) {
  const n = Math.max(1, Math.round(seconds * FPS));
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    const { result } = await s("Page.captureScreenshot", { format: "jpeg", quality: 88 });
    writeFileSync(`${OUT}/f${String(frame++).padStart(5, "0")}.jpg`, Buffer.from(result!.data!, "base64"));
    const wait = 1000 / FPS - (Date.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function say(step: Step) {
  const clip = clips.get(step);
  if (clip) cues.push({ file: clip.file, at: frame / FPS });
}

async function go(path: string) {
  const loaded = new Promise<void>((r) => { const f = (m: Msg) => { if (m.method === "Page.loadEventFired") { events.splice(events.indexOf(f), 1); r(); } }; events.push(f); });
  await s("Page.navigate", { url: path.startsWith("http") ? path : BASE + path });
  await Promise.race([loaded, sleep(8000)]);
  await sleep(700);
}
async function moveTo(sel: string) {
  const at = await evaluate(`JSON.stringify(window.kjs.center(${JSON.stringify(sel)}))`);
  if (!at || at === "null") { console.log("  (not found:", sel, ")"); return false; }
  const [x, y] = JSON.parse(at);
  await sleep(350); // let scrollIntoView settle before the cursor sets off
  const again = JSON.parse(await evaluate(`JSON.stringify(window.kjs.center(${JSON.stringify(sel)}))`) ?? "null") ?? [x, y];
  await evaluate(`window.kjs.moveTo(${again[0]}, ${again[1]})`);
  await capture(0.7);
  return true;
}
async function signin() {
  // The dev login, as a fresh account: what a new parent sees.
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  const jar = csrf.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const { csrfToken } = await csrf.json();
  const res = await fetch(`${BASE}/api/auth/callback/dev`, {
    method: "POST", redirect: "manual", headers: { cookie: jar, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email: EMAIL }),
  });
  const session = res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.includes("session-token"));
  if (!session) throw new Error("dev login gave no session cookie — is AUTH_DEV_LOGIN on and NODE_ENV not production?");
  const [name, value] = session.split("=");
  await s("Network.setCookie", { name, value, url: BASE + "/", httpOnly: true });
  console.log("  signed in as", EMAIL);
}

console.log(`recording ${STORY.length} steps at ${W}x${H} ${FPS}fps → ${OUT}`);
for (const step of STORY) {
  if ("signin" in step) { await signin(); continue; }
  if ("go" in step) { console.log("go", step.go); await go(step.go); if (step.caption !== undefined) { await evaluate(`window.kjs.caption(${JSON.stringify(step.caption)})`); await say(step); } await capture(step.hold ?? 2); continue; }
  if ("caption" in step && !("click" in step) && !("submit" in step)) { await evaluate(`window.kjs.caption(${JSON.stringify(step.caption)})`); await say(step); await capture(step.hold ?? 2); continue; }
  if ("scroll" in step) { await evaluate(`window.kjs.scroll(${step.scroll})`); await capture(step.hold ?? 2); continue; }
  if ("move" in step) { await moveTo(step.move); await capture(step.hold ?? 1); continue; }
  if ("click" in step) {
    console.log("click", step.click);
    if (await moveTo(step.click)) await evaluate(`window.kjs.click(${JSON.stringify(step.click)})`);
    if (step.caption !== undefined) { await evaluate(`window.kjs.caption(${JSON.stringify(step.caption)})`); await say(step); }
    await capture(step.hold ?? 2); continue;
  }
  if ("type" in step) {
    await moveTo(step.type);
    for (let i = 1; i <= step.text.length; i++) {
      await evaluate(`window.kjs.setValue(${JSON.stringify(step.type)}, ${JSON.stringify(step.text.slice(0, i))})`);
      await capture(i % 2 === 0 ? 1 / FPS : 0);
    }
    await capture(step.hold ?? 0.6); continue;
  }
  if ("select" in step) { await moveTo(step.select); await evaluate(`window.kjs.setValue(${JSON.stringify(step.select)}, ${JSON.stringify(step.value)})`); await capture(step.hold ?? 0.6); continue; }
  if ("submit" in step) {
    console.log("submit", step.submit);
    await moveTo(`submit-of:${step.submit}`);
    await evaluate(`(() => { const b = window.kjs.find(${JSON.stringify("submit-of:" + step.submit)}); if (!b) return false; window.kjs.click(${JSON.stringify("submit-of:" + step.submit)}); b.closest('form').requestSubmit(b); return true; })()`);
    await sleep(2500);
    if (step.caption !== undefined) { await evaluate(`window.kjs.caption(${JSON.stringify(step.caption)})`); await say(step); }
    await capture(step.hold ?? 2); continue;
  }
  if ("hold" in step) await capture(step.hold);
}
console.log(`done: ${frame} frames (${(frame / FPS).toFixed(1)}s)`);
ws.close(); chrome.kill();

// --- the film -------------------------------------------------------------
if (has("ffmpeg")) {
  const args = ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${OUT}/f%05d.jpg`];
  for (const c of cues) args.push("-i", c.file);
  const video = `scale=${PHONE ? "1080:1920" : "1920:1080"}:flags=lanczos,format=yuv420p`;
  if (cues.length > 0) {
    // Each clip delayed to where its caption appeared, then mixed; a
    // little headroom so two lines that touch do not clip.
    const delayed = cues.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[a${i}]`).join(";");
    const mix = cues.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${cues.length}:normalize=0,volume=0.9[aout]`;
    args.push("-filter_complex", `[0:v]${video}[v];${delayed};${mix}`, "-map", "[v]", "-map", "[aout]", "-c:a", "aac", "-b:a", "128k", "-shortest");
  } else {
    args.push("-vf", video);
  }
  args.push("-c:v", "libx264", "-preset", "slow", "-crf", "20", "-r", "30", "-movflags", "+faststart", OUTPUT);
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  console.log(`${OUTPUT} — ${cues.length} spoken line(s)`);
} else {
  console.log("no ffmpeg: frames are in", OUT);
}
process.exit(0);
