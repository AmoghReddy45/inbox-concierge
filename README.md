# Inbox Concierge

Gmail triage with evidence for every decision. Connect a Google account and the concierge
pulls your last 200 threads and sorts them into buckets — Important, Can wait, Newsletter,
Auto-archive, Customer escalations — using an LLM classification pipeline that **shows its
evidence, measures its own cost and latency, and abstains to a "Needs review" queue when it
isn't sure**. Create your own bucket in plain language and every thread is reclassified,
with honest live progress.

Built for the Tenex take-home. The UI is a deliberate recreation of Superhuman's
split-inbox language (their "Snow" and "Carbon" themes included), with the decision
transparency layered on top.

## How it works

```
Gmail (read-only) ──► /api/gmail/threads      pages of 25, format=full, MIME → 1,200-char excerpt
                        │                      + structured signals (List-Unsubscribe, Gmail labels)
                        ▼
              client orchestrator             bounded fan-out (8 in flight), retry w/ backoff,
                        │                      429-aware global pause, localStorage decision cache
                        ▼
             /api/ai/triage (per thread) ──►  Kimi K3 (Moonshot), JSON mode, low reasoning effort
                        │                      schema validation + evidence grounding: quotes must
                        ▼                      appear verbatim in the submitted text or the
              decision + measured meta         response is rejected
```

Design positions worth knowing before reading the code:

- **The unit of honesty is the progress strip.** Counts, cost, latency, and token numbers in
  the UI are sums over real per-thread responses — nothing is simulated or estimated. When
  cost can't be computed (no pricing env), it says "n/a", never `$0.00`.
- **Errors are errors.** The deterministic keyword classifier runs *only* when no API key is
  configured (labeled "Heuristic classifier" in the UI). Provider failures surface as a
  visible **Unsorted** state with retry — they are never silently substituted, which is also
  how we caught a real provider quirk (kimi-k3 rejects `temperature`) during development.
- **Abstention is a first-class outcome.** The prompt is instructed that missing an important
  thread costs more than keeping an unimportant one visible; ambiguous cases land in
  **Needs review** with the reasons listed.
- **Email is treated as adversarial input.** Thread text is fenced as untrusted data, the
  model has no tools and can only return a validated classification, and evidence quotes are
  verified against the source text so they cannot be hallucinated.
- **Reclassification is versioned.** The taxonomy version is a content hash; in-flight runs
  are aborted and stale responses discarded when it changes. Decisions cache locally keyed by
  `(promptVersion, taxonomyVersion, threadId, latestMessageId)`, so reloads and unchanged
  threads are free.
- **High-risk decisions get a second, adversarial pass.** Auto-archive verdicts and
  low-priority calls with a high-stakes runner-up go to a risk verifier whose only job is to
  argue the case *against* hiding the thread, with verbatim evidence. A challenge is never
  averaged away — it flips the thread to Needs review with the challenge quotes attached;
  concurrence marks the decision verified. Disagreement becomes visible doubt, not fake
  confidence.
- **The pipeline uses corpus structure, not just isolated threads.** Once a sender has two
  settled classifications, later threads carry that prior as a labeled hint (judged on
  merits, never overridden); threads are processed breadth-first across senders to maximize
  prior coverage. Deterministic signals — did the user already reply, is the sender in the
  user's own domain, bulk-mail headers — ride alongside the untrusted text.

## Measured quality (`npm run eval`)

The eval harness runs the demo corpus through the **production endpoint and the production
client orchestrator** (verifier included) against 32 hand-labeled golden expectations,
including two adversarial fixtures. Latest run (kimi-k3, triage-v6):

| Metric | Result |
| --- | --- |
| Golden pass rate | **31/32 (97%)** |
| Important-thread recall | **5/5** |
| False auto-archive (important hidden, unflagged) | **0** |
| Prompt-injection email obeyed | **No** — landed auto-archive, flagged for review |
| Spoofed "security alert" | Held for review |
| Risk verifier | triggered 16/50 (32%), 2 challenges |
| Latency / cost | p50 8.4s, p95 14.0s · $0.23 for the full 50-thread pass |

The one miss is a dentist-appointment confirmation classified `important` (we label it
`wait`) — a defensible read, kept as an honest miss rather than widening the label to
manufacture 100%.

## Reply drafts in your voice (beyond-spec extension)

**Learn my voice** (⌘K or the account menu) reads your last ~200 sent messages — sent mail
is readable under the same `gmail.readonly` scope, so the app still cannot write anything —
and builds a voice profile where **code measures, the model describes**:

- Every number is computed deterministically: signature detection (>40% trailing-block
  share), greeting/sign-off inventories with real usage shares and an internal/external
  split, median and p90 reply length, one-liner rate, and per-situation reply behavior
  (what you answer, how fast). The LLM proposes candidate patterns and picks verbatim
  exemplars of your own writing; any number it invents is overwritten by the measured one.
- **Recency is enforced, not requested**: the newest 50 sends carry full bodies at 3×
  weight (then 500 chars at 2×, 300 at 1×), and ≥70% of exemplars must come from the
  newest 80 samples — a code-side floor applied after model selection.
- Exemplars are referenced **by sample id** and extracted verbatim in code — the model
  cannot fabricate "your" words. The whole profile is inspectable in-app (shares, quirks,
  drift notes, exemplars), editable (exclude an exemplar, edit the signature — each edit
  bumps a revision that invalidates cached drafts), and lives only in `localStorage`.

Opening a thread then shows a **reply-likelihood chip before any spend** ("2 of your last
32 replies answered escalation mail, typically within ~55m" — or that none did), computed
from measured behavior. **Draft a reply (~$0.02)** (`r`) generates one draft on demand:
profile-first prompt, situation-matched exemplars chosen by deterministic scoring (no
embeddings), thread content in an untrusted fence. Validation enforces the measured length
norm and drops any "why it sounds like you" claim that doesn't trace to a real profile
element. The draft is editable; **copy is the only exit**. Fresh-corpus staleness is
probed once per session (2 subrequests) and surfaces as a rebuild chip — never a silent
rebuild, never silent spend. Without an API key, a free stats-only profile still builds,
and drafting declines honestly rather than faking a template.

Demo mode exercises the identical pipeline against an authored 38-message sent corpus with
one recognizable voice; the measured profile ($0.04, ~50s) and drafts ($0.009) shown in
the video are real calls.

## Running it

Prereqs: Node ≥ 22.13.

```bash
npm install
cp .env.example .env.local   # fill in values, see below
npm run dev                  # http://localhost:3000
```

| Env var | What it is |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client (Web application) from Google Cloud Console with the `gmail.readonly` scope; add `<origin>/api/auth/callback/google` as an authorized redirect URI |
| `AUTH_SECRET` | Any long random string; encrypts the session cookie (AES-GCM) |
| `KIMI_API_KEY` | Moonshot AI key from platform.kimi.ai — omit to run the labeled heuristic mode |
| `KIMI_MODEL`, `KIMI_REASONING_EFFORT` | Model id (`kimi-k3`) and reasoning effort (`low` recommended for triage) |
| `KIMI_PRICE_*_USD_PER_MTOK` | Token prices used for the real cost telemetry |

No Google account handy? **"Explore demo inbox"** loads 48 fixture threads through the same
pagination contract and the same classifier — the demo demonstrates the actual pipeline, not
a recording of it.

**Reviewing note:** `gmail.readonly` is a restricted Google scope, so connecting a real
account shows Google's "unverified app" interstitial (expected for a take-home OAuth client
in testing mode; continue via *Advanced*). Demo mode requires nothing and exercises the
identical code path.

### Tests

```bash
npm run test:unit   # pipeline unit tests: MIME extraction, cache, orchestrator state machine
npm test            # unit tests + production build + rendered-HTML smoke test
npm run lint
```

The orchestrator suite covers the parts that are easy to get quietly wrong: bounded
concurrency, retry/backoff classes, the global 429 pause, and the supersede guard that
discards stale responses after a taxonomy change.

## Deploying

The app is a single Cloudflare Worker built with [vinext](https://github.com/cloudflare/vinext)
(Next.js app router on Vite):

```bash
npm run build
npx wrangler deploy   # then: wrangler secret put for each env var
```

Add the production redirect URI to the Google OAuth client after the first deploy.

## Prior art & positioning

Three shipped products converge on this exact problem: **Superhuman** (Auto Labels + Split
Inbox), **Notion Mail** (AI auto-label views), and **Inbox Zero** (open source; AI sender
categories + plain-English rules). We studied Superhuman's production stylesheet and Inbox
Zero's codebase directly. Two findings shaped this build:

- Inbox Zero's categorization pipeline independently lands on our core positions — abstain
  when unsure ("accuracy is more important than completeness"), validate model output in code
  rather than trusting a schema, and steer categories with a natural-language description
  injected into the prompt. Where we go further: evidence quotes are verified verbatim
  against the source text, and every decision carries measured latency/token/cost telemetry.
- The products that *act* on email inherit a failure class we opt out of: Inbox Zero ships a
  guard against its own example rules because users "start auto sending emails to people
  without realising it." This product is read-only by construction — it recommends with
  evidence; it never sends, archives, or deletes.

User corrections feed future runs as explicit hints (`<classification_feedback>`, with a
"still evaluate on its own merits" guardrail) — personalization without retraining, and
never an override of the visible decision.

## Deliberate omissions (and the production path)

- **No server-side job queue.** Two hundred classifications are orchestrated client-side with
  bounded concurrency — the simplest thing that is genuinely real. In production this becomes
  a durable queue with idempotent jobs and dead-lettering.
- **No database.** Decisions cache in `localStorage`; the durable version is a one-table
  store keyed `(threadId, latestMessageId, taxonomyVersion, promptVersion)` with a composite
  unique index, which also enables cross-device audit history.
- **Snapshot, not sync.** The assignment's 200-thread load is a snapshot; incremental Gmail
  history sync is an operational extension.
- **No sender-collapse pre-pass.** Bulk-mail senders (newsletters, CI) could share one
  classification to cut cost; skipped because per-thread evidence is the product. In
  production: sender pre-pass for bulk mail, per-thread classification for the rest.
- **Client-state progress.** The progress strip derives from orchestrator state; a durable
  version is a Redis counter with atomic increments polled by the UI, so progress survives
  reload mid-run.
- **Basic Gmail retry.** One retry per thread fetch. The production version honors Gmail's
  absolute retry timestamps, re-fetches batch partial-failures instead of returning
  silently-empty results, and refreshes tokens with a concurrency-guarded write.
- **One model, no verifier ensemble.** Risk is managed by abstention plus evidence grounding;
  a second-pass verifier is reserved for high-cost decisions (auto-archive) in production.
- **Corrections stay local.** A correction outranks the model until the thread changes, and is
  recorded as evidence — it does not silently retrain anything.
