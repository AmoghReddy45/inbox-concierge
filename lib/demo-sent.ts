import type { SentPageResponse, SentProbeResponse, SentSample } from "./voice-types";

/**
 * Demo sent corpus: ~40 authored samples with one consistent voice —
 * terse, em-dashes, "Hey {first} —" internally with no sign-off,
 * "Best,\nA." externally, ~30% one-liners, replies to escalations and
 * direct requests, never to newsletters or cold outreach. Several pair
 * with demo-inbox personas so drafts land in threads with "history".
 * Raw samples only — all stats and distillation run through the real
 * pipeline.
 */

type Entry = {
  daysAgo: number;
  kind: SentSample["kind"];
  subject: string;
  body: string;
  internal: boolean;
  toDomain?: string;
  parent?: { sender: string; email: string; excerpt: string; latencyMin: number };
};

const EXT_SIGNOFF = "\n\nBest,\nA.";

const ENTRIES: Entry[] = [
  // --- newest tier: current voice, terse, em-dashes ---
  { daysAgo: 0.2, kind: "reply", subject: "Re: URGENT: checkout failures since 2:10 PM", internal: false, toDomain: "northstar.health", parent: { sender: "Marcus Chen", email: "marcus@northstar.health", excerpt: "We need an owner and an ETA before our 4 PM status call.", latencyMin: 22 }, body: "Marcus — I'm driving this. Declines reproduced on our side; fix is isolating one EU acquirer route. ETA before your 4 PM call." + EXT_SIGNOFF },
  { daysAgo: 0.4, kind: "reply", subject: "Re: Contract renewal — final redlines due Thursday", internal: true, parent: { sender: "Priya Shah", email: "priya@tenex.co", excerpt: "Can you sign off on the fallback position by 3 PM?", latencyMin: 41 }, body: "Hey Priya — approved at 1.5x with the data-incident carve-out. Send tonight." },
  { daysAgo: 0.8, kind: "reply", subject: "Re: Q3 planning doc", internal: true, parent: { sender: "Elena Vasquez", email: "elena@tenex.co", excerpt: "Could you fill in the headcount asks by Thursday?", latencyMin: 130 }, body: "Hey Elena — done. Two asks: one platform SRE, one backend. Risks are in the doc." },
  { daysAgo: 1.1, kind: "reply", subject: "Re: Double-charged on the annual plan", internal: false, toDomain: "kaizenlabs.jp", parent: { sender: "Yuki Tanaka", email: "yuki@kaizenlabs.jp", excerpt: "We need the duplicate refunded or a credit memo before the 25th.", latencyMin: 55 }, body: "Yuki — confirmed, INV-4418 is a duplicate. Refund initiated today; you'll have the memo before your close." + EXT_SIGNOFF },
  { daysAgo: 1.5, kind: "reply", subject: "Re: Design review Thursday", internal: true, parent: { sender: "Sam Okafor", email: "sam@tenex.co", excerpt: "Decline if that clashes with your focus block.", latencyMin: 12 }, body: "Works." },
  { daysAgo: 1.9, kind: "fresh", subject: "Retry queue — decision", internal: true, body: "Hey Dana — going with the dead-letter design. Ship it behind the flag; we'll watch it a week." },
  { daysAgo: 2.3, kind: "reply", subject: "Re: POC scope", internal: false, toDomain: "finchhealth.com", parent: { sender: "Amara Diallo", email: "amara@finchhealth.com", excerpt: "Can the proof of concept include the reconciliation workflow before we sign?", latencyMin: 95 }, body: "Amara — yes, within timeline. Reconciliation lands in the pilot next week; contract can run in parallel." + EXT_SIGNOFF },
  { daysAgo: 2.8, kind: "reply", subject: "Re: Nightly build failed", internal: true, parent: { sender: "GitHub", email: "notifications@github.com", excerpt: "test_reconcile_ledger: AssertionError in test_partial_refund_rounding.", latencyMin: 180 }, body: "Hey Kai — that's my rounding change. Reverting; proper fix tomorrow." },
  { daysAgo: 3.2, kind: "reply", subject: "Re: Book club Thursday", internal: false, toDomain: "gmail.com", parent: { sender: "Ravi Narayan", email: "ravi.narayan@gmail.com", excerpt: "Chapters 5 through 8 — bring the good coffee.", latencyMin: 300 }, body: "In — bringing the Kenyan." + EXT_SIGNOFF },
  { daysAgo: 3.6, kind: "reply", subject: "Re: Offsite logistics", internal: true, parent: { sender: "Elena Vasquez", email: "elena@tenex.co", excerpt: "I need dietary constraints from your team by Friday.", latencyMin: 240 }, body: "Hey Elena — sent the form to the team. Volunteer for Thursday: Dana." },
  { daysAgo: 4.1, kind: "fresh", subject: "Payments routing — heads up", internal: true, body: "Hey team — routing change goes out at 9 AM tomorrow. Rollback is one flag; on-call briefed. Shout if you see EU declines move." },
  { daysAgo: 4.5, kind: "reply", subject: "Re: Invoice #48213", internal: true, parent: { sender: "Finance", email: "finance@tenex.co", excerpt: "Can you confirm this maps to the cloud budget line?", latencyMin: 60 }, body: "Confirmed — cloud line, expected amount." },
  { daysAgo: 5.0, kind: "reply", subject: "Re: Candidate feedback", internal: true, parent: { sender: "Jordan From Recruiting", email: "recruiting@tenex.co", excerpt: "Thoughts on the staff candidate from Tuesday?", latencyMin: 75 }, body: "Hey Jordan — strong yes. Systems depth is real; start the references." },
  { daysAgo: 5.4, kind: "forward", subject: "Fwd: SOC2 report", internal: false, toDomain: "finchhealth.com", body: "Amara — report attached, NDA covers it. Flag anything your security team needs." + EXT_SIGNOFF },
  { daysAgo: 5.9, kind: "reply", subject: "Re: Standup notes", internal: true, parent: { sender: "Dana Whitfield", email: "dana@tenex.co", excerpt: "Nothing needs your action — flagging the queue decision.", latencyMin: 30 }, body: "Good call on the dead-letter change." },

  // --- middle tier ---
  { daysAgo: 8, kind: "reply", subject: "Re: Renewal call agenda", internal: false, toDomain: "northstar.health", parent: { sender: "Marcus Chen", email: "marcus@northstar.health", excerpt: "Anything you want added to Thursday's agenda?", latencyMin: 120 }, body: "Marcus — add uptime SLAs and the EU data residency question. Rest looks right." + EXT_SIGNOFF },
  { daysAgo: 9, kind: "reply", subject: "Re: Postmortem draft", internal: true, parent: { sender: "Kai Chen", email: "kai@tenex.co", excerpt: "Draft attached — tear it apart.", latencyMin: 200 }, body: "Hey Kai — good bones. Two gaps: detection took 12 minutes (say why), and the rollback step needs an owner. Otherwise ship it." },
  { daysAgo: 10, kind: "reply", subject: "Re: Pricing exception", internal: true, parent: { sender: "Priya Shah", email: "priya@tenex.co", excerpt: "They're asking for 20% off list on a two-year commit.", latencyMin: 45 }, body: "Hey Priya — 15% for two years prepaid, else list. Hold the line." },
  { daysAgo: 11, kind: "reply", subject: "Re: Interview loop", internal: true, parent: { sender: "Jordan From Recruiting", email: "recruiting@tenex.co", excerpt: "Can you take the systems interview Friday?", latencyMin: 25 }, body: "Yes." },
  { daysAgo: 12, kind: "fresh", subject: "EU acquirer — decision memo", internal: true, body: "Hey team — we're consolidating on the primary acquirer. One-pager attached; objections by Friday, silence is agreement." },
  { daysAgo: 13, kind: "reply", subject: "Re: Security questionnaire", internal: false, toDomain: "kaizenlabs.jp", parent: { sender: "Yuki Tanaka", email: "yuki@kaizenlabs.jp", excerpt: "Our security team has a 40-question vendor form.", latencyMin: 400 }, body: "Yuki — completed form attached. Three answers reference the SOC2 report; happy to walk your team through it." + EXT_SIGNOFF },
  { daysAgo: 14, kind: "reply", subject: "Re: Conference talk", internal: false, toDomain: "systemsatscale.dev", parent: { sender: "Systems @Scale", email: "cfp@systemsatscale.dev", excerpt: "Your proposal was accepted — confirm your slot.", latencyMin: 500 }, body: "Confirmed for the Tuesday slot — thanks." + EXT_SIGNOFF },
  { daysAgo: 15, kind: "reply", subject: "Re: On-call swap", internal: true, parent: { sender: "Dana Whitfield", email: "dana@tenex.co", excerpt: "Can you cover Tuesday night? I'll take your Thursday.", latencyMin: 15 }, body: "Done — swapped in the tool." },
  { daysAgo: 16, kind: "reply", subject: "Re: Figma comment", internal: true, parent: { sender: "Sam Okafor", email: "sam@tenex.co", excerpt: "Does the empty state copy match what the backend returns?", latencyMin: 90 }, body: "Hey Sam — good catch, it over-promises. Use the shorter variant; backend only guarantees counts." },
  { daysAgo: 18, kind: "reply", subject: "Re: Budget review", internal: true, parent: { sender: "Elena Vasquez", email: "elena@tenex.co", excerpt: "Cloud spend is up 22% — expected?", latencyMin: 150 }, body: "Hey Elena — expected. Lambda growth from the new ingestion path; flattens next month after the batching change." },
  { daysAgo: 20, kind: "reply", subject: "Re: Reference call", internal: false, toDomain: "finchhealth.com", parent: { sender: "Amara Diallo", email: "amara@finchhealth.com", excerpt: "Would you do a reference call with our board advisor?", latencyMin: 220 }, body: "Amara — glad to. Tuesday or Wednesday afternoon works." + EXT_SIGNOFF },
  { daysAgo: 22, kind: "fresh", subject: "Latency regression — found it", internal: true, body: "Hey team — p95 spike traces to the retry storm on the EU route. Patch out; watching overnight." },
  { daysAgo: 24, kind: "reply", subject: "Re: Team dinner", internal: true, parent: { sender: "Dana Whitfield", email: "dana@tenex.co", excerpt: "Thursday after the review?", latencyMin: 35 }, body: "In." },

  // --- oldest tier: slightly fuller sentences (drift source) ---
  { daysAgo: 32, kind: "reply", subject: "Re: Vendor evaluation", internal: true, parent: { sender: "Kai Chen", email: "kai@tenex.co", excerpt: "Three options attached with pricing.", latencyMin: 320 }, body: "Hey Kai — thanks for putting this together. I lean option two; the pricing is better at our scale and the migration path looks less painful. Let's discuss in the platform sync." },
  { daysAgo: 35, kind: "reply", subject: "Re: Q2 retro", internal: true, parent: { sender: "Elena Vasquez", email: "elena@tenex.co", excerpt: "Add your notes before Friday's retro please.", latencyMin: 400 }, body: "Hey Elena — notes added. The main thing I want us to keep is the weekly reliability review; it caught two incidents early this quarter." },
  { daysAgo: 38, kind: "reply", subject: "Re: Partnership intro", internal: false, toDomain: "clearpay.io", parent: { sender: "Nina Alvarez", email: "nina@clearpay.io", excerpt: "Our CEOs met at the summit — worth a technical call?", latencyMin: 600 }, body: "Nina — happy to take a technical call. Best regards, sending some times for next week; an hour should cover architecture and the integration surface." + EXT_SIGNOFF },
  { daysAgo: 41, kind: "reply", subject: "Re: Incident follow-up", internal: false, toDomain: "northstar.health", parent: { sender: "Marcus Chen", email: "marcus@northstar.health", excerpt: "Can we get the RCA in writing for our compliance team?", latencyMin: 180 }, body: "Marcus — of course. Full RCA attached with the timeline and the two remediation items; both land this sprint. Let me know if compliance needs anything further." + EXT_SIGNOFF },
  { daysAgo: 44, kind: "reply", subject: "Re: New hire onboarding", internal: true, parent: { sender: "Jordan From Recruiting", email: "recruiting@tenex.co", excerpt: "Anything special for the new SRE's first week?", latencyMin: 250 }, body: "Hey Jordan — pair them with Dana for the first week, and have them ship something small by Friday. The onboarding doc covers the rest." },
  { daysAgo: 47, kind: "fresh", subject: "Reliability review — kickoff", internal: true, body: "Hey team — starting a weekly reliability review, Fridays 30 minutes. Bring one graph and one worry. First one this week." },
  { daysAgo: 50, kind: "reply", subject: "Re: License renewal", internal: false, toDomain: "observaco.com", parent: { sender: "Observaco Sales", email: "renewals@observaco.com", excerpt: "Your renewal is due — same terms as last year?", latencyMin: 800 }, body: "Renewing at the same tier. Please send the order form for signature." + EXT_SIGNOFF },
  { daysAgo: 53, kind: "reply", subject: "Re: Architecture question", internal: true, parent: { sender: "Kai Chen", email: "kai@tenex.co", excerpt: "Why did we split ingestion from classification?", latencyMin: 130 }, body: "Hey Kai — different failure modes and rate limits. Ingestion is bursty and cheap to retry; classification is expensive and ordered. Coupling them makes the cheap side inherit the expensive side's constraints." },
  { daysAgo: 56, kind: "reply", subject: "Re: Speaking invite", internal: false, toDomain: "devconf.org", parent: { sender: "DevConf Committee", email: "program@devconf.org", excerpt: "Would you speak on cost-aware LLM pipelines?", latencyMin: 900 }, body: "Thanks for the invite — I'd be glad to. Abstract attached; happy to adjust length to the slot." + EXT_SIGNOFF },
  { daysAgo: 60, kind: "reply", subject: "Re: Expense policy", internal: true, parent: { sender: "Finance", email: "finance@tenex.co", excerpt: "Reminder to file June receipts.", latencyMin: 700 }, body: "Filed." },
];

function build(now: number): SentSample[] {
  return ENTRIES.map((entry, index) => {
    const sentAtMs = now - entry.daysAgo * 86_400_000;
    const toDomain = entry.internal ? "tenex.co" : (entry.toDomain ?? "example.com");
    return {
      id: `demo-sent-${index}`,
      threadId: `demo-sent-thread-${index}`,
      sentAt: new Date(sentAtMs).toISOString(),
      kind: entry.kind,
      subject: entry.subject,
      body: entry.body,
      toDomains: [toDomain],
      internal: entry.internal,
      duplicateCount: 1,
      ...(entry.parent
        ? {
            parent: {
              sender: entry.parent.sender,
              email: entry.parent.email,
              excerpt: entry.parent.excerpt,
              receivedAt: new Date(sentAtMs - entry.parent.latencyMin * 60_000).toISOString(),
            },
            replyLatencyMinutes: entry.parent.latencyMin,
          }
        : {}),
    };
  }).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

const DEMO_SENT_PAGE_SIZE = 25;

export function demoSentPage(pageToken: string | null, now: number): SentPageResponse {
  const all = build(now);
  const page = pageToken === "demo-sent-2" ? 1 : 0;
  const start = page * DEMO_SENT_PAGE_SIZE;
  const samples = all.slice(start, start + DEMO_SENT_PAGE_SIZE);
  return {
    samples,
    nextPageToken: page === 0 && all.length > DEMO_SENT_PAGE_SIZE ? "demo-sent-2" : null,
    scannedThreads: samples.length,
    skipped: 0,
    filtered: page === 0 ? 3 : 0, // authored corpus stands in for calendar-accept drops
    mode: "demo",
  };
}

export function demoSentProbe(now: number): SentProbeResponse {
  const newest = build(now)[0];
  return { newestSentId: newest.id, newestSentAt: newest.sentAt };
}
