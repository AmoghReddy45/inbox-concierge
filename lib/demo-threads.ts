import {
  PAGE_SIZE,
  type ThreadDetail,
  type ThreadMessage,
  type ThreadSummary,
  type ThreadsResponse,
} from "./types";

/**
 * Demo inbox: raw threads only — no classifications, no ground-truth labels.
 * They flow through the real ingestion contract and the real classifier, so
 * demo mode demonstrates the actual pipeline. Served as two pages to
 * exercise real pagination.
 */

type Seed = {
  id: string;
  sender: string;
  email: string;
  subject: string;
  excerpt: string;
  hoursAgo: number;
  unread?: boolean;
  gmailLabels?: string[];
  listUnsubscribe?: boolean;
  messageCount?: number;
};

const SEEDS: Seed[] = [
  {
    id: "urgent-checkout",
    sender: "Marcus Chen",
    email: "marcus@northstar.health",
    subject: "URGENT: checkout failures since 2:10 PM",
    excerpt:
      "Hi — payments are failing for every EU customer in the hosted checkout flow. We started seeing declines at 2:10 PM UTC and can reproduce across three tenants. This is blocking today's launch. We need an owner and an ETA before our 4 PM status call. Can you confirm who is driving this? Marcus, VP Engineering, Northstar Health",
    hoursAgo: 1,
    unread: true,
    gmailLabels: ["Important"],
    messageCount: 3,
  },
  {
    id: "contract-redlines",
    sender: "Priya Shah",
    email: "priya@tenex.co",
    subject: "Contract renewal — final redlines due Thursday",
    excerpt:
      "Legal is aligned on everything except the liability cap. The customer will accept our fallback language if we confirm it today. Can you sign off on the fallback position by 3 PM so I can send the final draft tonight?",
    hoursAgo: 2,
    unread: true,
    messageCount: 5,
  },
  {
    id: "security-alert",
    sender: "Google",
    email: "no-reply@accounts.google.com",
    subject: "Security alert: new sign-in from unfamiliar device",
    excerpt:
      "We noticed a new sign-in to your Google Account on a Linux device in Frankfurt, Germany. If this was you, you can safely ignore this email. If not, we'll help you secure your account immediately.",
    hoursAgo: 3,
    unread: true,
  },
  {
    id: "standup-notes",
    sender: "Dana Whitfield",
    email: "dana@tenex.co",
    subject: "Standup notes + decision on the retry queue",
    excerpt:
      "Notes from this morning: ingestion is green, the retry queue design got approved with the dead-letter change, and Kai owns the alerting follow-up. Nothing needs your action — flagging the queue decision since you asked to be kept in the loop.",
    hoursAgo: 5,
  },
  {
    id: "invoice-receipt",
    sender: "Stripe",
    email: "receipts@stripe.com",
    subject: "Your Tenex Cloud invoice #48213 has been paid",
    excerpt:
      "Receipt for invoice #48213. Amount paid: $1,240.00. Payment method: card ending 4421. This is an automated receipt for your records — no action is required.",
    hoursAgo: 8,
  },
  {
    id: "quarterly-planning",
    sender: "Elena Vasquez",
    email: "elena@tenex.co",
    subject: "Q3 planning doc — your section is the last one open",
    excerpt:
      "The planning doc closes Friday and your platform section is the last one open. Could you fill in the headcount asks and the two risk bullets by Thursday afternoon? Everything else is drafted.",
    hoursAgo: 10,
    unread: true,
  },
  {
    id: "morning-brew",
    sender: "Morning Brew",
    email: "crew@morningbrew.com",
    subject: "☕ Rate cuts, rare earths, and a $9B rounding error",
    excerpt:
      "Good morning. Markets shrugged off yesterday's inflation print while everyone argued about rare-earth export controls. Plus: the accounting mistake that vaporized $9B on paper. Unsubscribe anytime.",
    hoursAgo: 12,
    gmailLabels: ["Promotions"],
    listUnsubscribe: true,
  },
  {
    id: "ci-nightly",
    sender: "GitHub",
    email: "notifications@github.com",
    subject: "[tenex/platform] Nightly build failed: test_reconcile_ledger",
    excerpt:
      "Run #4821 failed on main. test_reconcile_ledger: AssertionError in test_partial_refund_rounding. First failure in 14 days; the previous commit touched currency rounding. View the full log on GitHub.",
    hoursAgo: 14,
    unread: true,
  },
  {
    id: "customer-billing",
    sender: "Yuki Tanaka",
    email: "yuki@kaizenlabs.jp",
    subject: "Double-charged on the annual plan — need a refund before month close",
    excerpt:
      "We were invoiced twice for the annual renewal on July 18 — both charges settled. Our finance team closes books on the 25th, so we need the duplicate refunded or a credit memo before then. Can you confirm today?",
    hoursAgo: 18,
    unread: true,
    gmailLabels: ["Important"],
    messageCount: 2,
  },
  {
    id: "design-review",
    sender: "Sam Okafor",
    email: "sam@tenex.co",
    subject: "Design review moved to Thursday 2 PM",
    excerpt:
      "Heads up — I moved the design review from Wednesday to Thursday 2 PM so the mobile folks can join. Same doc, same agenda. Decline if that clashes with your focus block and I'll find another slot.",
    hoursAgo: 22,
  },
  {
    id: "conference-cfp",
    sender: "Systems @Scale",
    email: "cfp@systemsatscale.dev",
    subject: "Last call: CFP closes Sunday",
    excerpt:
      "The call for proposals for Systems @Scale closes this Sunday at midnight PT. You started a draft titled 'Cost-sensitive LLM pipelines' on June 30 but haven't submitted it. Finish your submission — reviews start Monday.",
    hoursAgo: 26,
  },
  {
    id: "vendor-cold",
    sender: "Tyler Brandt",
    email: "tyler@apexoutbound.io",
    subject: "Quick question about Tenex's outbound stack",
    excerpt:
      "Saw you're scaling the engineering team — congrats. Most agencies your size waste 15+ hours a week on manual prospect research. We plug into your CRM and automate it end to end. Worth a 15-minute call this week? Happy to share a loom first.",
    hoursAgo: 30,
    listUnsubscribe: true,
  },
  {
    id: "oncall-handoff",
    sender: "PagerDuty",
    email: "no-reply@pagerduty.com",
    subject: "You are on call for Platform starting Monday 9:00 AM",
    excerpt:
      "This is a reminder that your on-call shift for the Platform rotation begins Monday at 9:00 AM and ends the following Monday. Escalation policy: page, then phone after 5 minutes. No incidents are currently open.",
    hoursAgo: 34,
  },
  {
    id: "book-club",
    sender: "Ravi Narayan",
    email: "ravi.narayan@gmail.com",
    subject: "Book club Thursday — we're doing chapters 5-8",
    excerpt:
      "We're on for Thursday at 7 at my place. Chapters 5 through 8 — the ones about attention as a finite resource, fittingly. Bring the good coffee if you're coming straight from work.",
    hoursAgo: 40,
  },
  {
    id: "status-page",
    sender: "Atlassian Statuspage",
    email: "notifications@statuspage.io",
    subject: "Resolved: elevated API latency in us-east-1",
    excerpt:
      "The incident 'Elevated API latency in us-east-1' has been resolved. All systems operational. Duration: 43 minutes. A post-incident review will be published within 5 business days. This is an automated notification.",
    hoursAgo: 44,
  },
  {
    id: "recruiting-intro",
    sender: "Jordan Ellis",
    email: "jordan@laddersearch.com",
    subject: "Staff engineer intro — ex-Stripe, open to agency work",
    excerpt:
      "I know you're not actively hiring, but a staff engineer I've worked with for years — ex-Stripe payments infra — is specifically looking for high-caliber agency work. Sharing her profile in confidence; happy to intro if there's a fit this quarter.",
    hoursAgo: 50,
  },
  {
    id: "aws-bill",
    sender: "Amazon Web Services",
    email: "no-reply-aws@amazon.com",
    subject: "Your AWS bill for July is available: $3,847.12",
    excerpt:
      "Your invoice for the billing period July 1 - July 31 is now available in the billing console. Total: $3,847.12, up 22% from June. The largest increase came from Lambda invocations in us-east-1.",
    hoursAgo: 55,
  },
  {
    id: "pragmatic-eng",
    sender: "The Pragmatic Engineer",
    email: "pragmaticengineer@substack.com",
    subject: "The end of the 10x tooling budget",
    excerpt:
      "This week: why engineering tool budgets are collapsing back to 2021 levels, what that means for the vendors you depend on, and a deep dive into how three scaleups consolidated their stacks. Unsubscribe.",
    hoursAgo: 60,
    gmailLabels: ["Promotions"],
    listUnsubscribe: true,
  },
  {
    id: "customer-poc",
    sender: "Amara Diallo",
    email: "amara@finchhealth.com",
    subject: "POC scope — can we add the reconciliation workflow?",
    excerpt:
      "The pilot is going well internally, and our CFO asked whether the proof of concept can include the reconciliation workflow before we sign the annual deal. If that's feasible within the current timeline, we're ready to move to contract this month. What would it take?",
    hoursAgo: 65,
    unread: true,
    messageCount: 4,
  },
  {
    id: "dentist",
    sender: "Lakeview Dental",
    email: "appointments@lakeviewdental.com",
    subject: "Appointment confirmation: Tuesday July 28, 10:30 AM",
    excerpt:
      "This confirms your cleaning appointment on Tuesday, July 28 at 10:30 AM with Dr. Osei. Reply C to confirm or R to reschedule. Please arrive 10 minutes early if your insurance has changed.",
    hoursAgo: 70,
  },
  {
    id: "figma-comment",
    sender: "Figma",
    email: "comments@figma.com",
    subject: "Sam Okafor mentioned you in 'Concierge onboarding flow'",
    excerpt:
      "Sam Okafor: '@you does the empty state copy here match what the backend actually returns? Feels like it promises more than we ship.' Reply in Figma to continue the thread.",
    hoursAgo: 76,
  },
  {
    id: "team-offsite",
    sender: "Elena Vasquez",
    email: "elena@tenex.co",
    subject: "Offsite logistics — dietary constraints by Friday",
    excerpt:
      "Final logistics for the September offsite: flights are booked, the venue is confirmed. I need dietary constraints from your team by Friday, and one volunteer to run the Thursday evening session. Can you nominate someone?",
    hoursAgo: 82,
  },
  {
    id: "lint-bot",
    sender: "Dependabot",
    email: "no-reply@github.com",
    subject: "[tenex/platform] Bump undici from 6.19.2 to 6.19.8",
    excerpt:
      "Bumps undici from 6.19.2 to 6.19.8. This release fixes a header-smuggling edge case flagged as moderate severity. Merge when CI passes — no breaking changes are documented for this range.",
    hoursAgo: 88,
  },
  {
    id: "reimbursement",
    sender: "Expensify",
    email: "concierge@expensify.com",
    subject: "Your June report was approved — $412.88 reimbursed Friday",
    excerpt:
      "Your expense report 'June client travel' was fully approved. $412.88 will land in your account with Friday's payroll. No further action needed.",
    hoursAgo: 92,
  },
];

/** Recurring senders that realistically appear many times in a week. */
const RECURRING: Array<Omit<Seed, "id" | "hoursAgo">> = [
  {
    sender: "GitHub",
    email: "notifications@github.com",
    subject: "[tenex/platform] PR #### review requested",
    excerpt:
      "Review requested on a pull request touching the ingestion normalizer. Changed files: 4. The author flagged one open question about header parsing for forwarded mail.",
  },
  {
    sender: "Morning Brew",
    email: "crew@morningbrew.com",
    subject: "☕ Daily brief",
    excerpt:
      "Today: chip subsidies get a sequel, streaming bundles quietly raise prices again, and the strange economics of stadium naming rights. Unsubscribe anytime.",
    gmailLabels: ["Promotions"],
    listUnsubscribe: true,
  },
  {
    sender: "Linear",
    email: "notifications@linear.app",
    subject: "Weekly digest: Platform team",
    excerpt:
      "Completed last week: 14 issues. In progress: 9. Blocked: 2 — both waiting on the auth vendor. Cycle health is trending up for the third week.",
  },
  {
    sender: "Datadog",
    email: "alerts@datadoghq.com",
    subject: "[Recovered] p95 latency on /api/classify",
    excerpt:
      "Monitor recovered: p95 latency on /api/classify returned below the 2s threshold after 12 minutes. Peak was 3.4s. This alert has auto-resolved; no acknowledgment required.",
  },
  {
    sender: "Substack",
    email: "no-reply@substack.com",
    subject: "New post from a writer you follow",
    excerpt:
      "A writer you follow just published: 'Notes on triage — what ERs know that inboxes don't.' Read it on the web or in the app. Unsubscribe from these notifications in settings.",
    listUnsubscribe: true,
  },
  {
    sender: "Notion",
    email: "team@makenotion.com",
    subject: "What's new in Notion — July",
    excerpt:
      "This month: faster databases, formula improvements, and a new template gallery for engineering teams. See everything that shipped in July. Unsubscribe.",
    gmailLabels: ["Promotions"],
    listUnsubscribe: true,
  },
];

function expandSeed(seed: Seed, now: number): ThreadSummary {
  const date = new Date(now - seed.hoursAgo * 3_600_000).toISOString();
  const preview =
    seed.excerpt.length > 140 ? `${seed.excerpt.slice(0, 140).trimEnd()}…` : seed.excerpt;
  return {
    id: `demo-${seed.id}`,
    sender: seed.sender,
    email: seed.email,
    subject: seed.subject,
    preview,
    excerpt: seed.excerpt,
    date,
    unread: seed.unread ?? false,
    gmailLabels: seed.gmailLabels ?? [],
    listUnsubscribe: seed.listUnsubscribe ?? false,
    messageCount: seed.messageCount ?? 1,
    latestMessageId: `demo-${seed.id}-m${seed.messageCount ?? 1}`,
  };
}

export function buildDemoThreads(now: number): ThreadSummary[] {
  const base = SEEDS.map((seed) => expandSeed(seed, now));
  const recurring: ThreadSummary[] = [];
  for (let i = 0; i < 24; i++) {
    const template = RECURRING[i % RECURRING.length];
    const occurrence = Math.floor(i / RECURRING.length) + 1;
    const hoursAgo = 6 + i * 7.3;
    recurring.push(
      expandSeed(
        {
          ...template,
          id: `${template.sender.toLowerCase().replace(/[^a-z]+/g, "-")}-${occurrence}-${i}`,
          subject: template.subject.replace("####", String(4_820 - i * 3)),
          hoursAgo,
        },
        now,
      ),
    );
  }
  return [...base, ...recurring].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

/**
 * Hand-written message histories for the demo threads worth clicking into.
 * Threads without an entry fall back to a single message built from the seed
 * excerpt — honest, since that IS the message text.
 */
const CONVERSATIONS: Record<string, Array<{ sender: string; email: string; hoursAgo: number; recipients: string; text: string; html?: string }>> = {
  "morning-brew": [
    {
      sender: "Morning Brew",
      email: "crew@morningbrew.com",
      hoursAgo: 12,
      recipients: "to Me",
      text: "Good morning. Markets shrugged off yesterday's inflation print while everyone argued about rare-earth export controls.\n\nPlus: the accounting mistake that vaporized $9B on paper.",
      html: '<div style="background:#f4f1ec;padding:24px 0"><div style="max-width:560px;margin:0 auto;background:#ffffff;padding:28px 32px;font-family:Georgia,serif"><h1 style="font-size:22px;margin:0 0 4px">☕ Morning Brew</h1><p style="color:#8a6d3b;font-size:12px;margin:0 0 18px;text-transform:uppercase;letter-spacing:1px">Daily Brief — July 23</p><p style="font-size:15px;line-height:1.6">Good morning. Markets shrugged off yesterday\'s inflation print while everyone argued about <b>rare-earth export controls</b>.</p><h2 style="font-size:16px;margin:20px 0 8px">📉 The $9B rounding error</h2><p style="font-size:15px;line-height:1.6">One misplaced decimal in a quarterly filing briefly vaporized nine billion dollars of paper value. The correction took four minutes; the memes will last forever.</p><ul style="font-size:15px;line-height:1.7;padding-left:20px"><li>Rate-cut odds edged up to 61%</li><li>Rare-earth spot prices +4.2%</li><li>Retail volumes at a five-week high</li></ul><p style="font-size:15px;line-height:1.6">Read the full brief at <a href="https://www.morningbrew.com" style="color:#1a73e8">morningbrew.com</a>.</p><hr style="border:none;border-top:1px solid #e5e0d8;margin:20px 0"><p style="color:#999;font-size:11px">You are receiving this because you subscribed. <a href="https://www.morningbrew.com" style="color:#999">Unsubscribe</a></p></div></div>',
    },
  ],
  "urgent-checkout": [
    {
      sender: "Marcus Chen",
      email: "marcus@northstar.health",
      hoursAgo: 3,
      recipients: "to Me, Priya",
      text: "Hi — payments are failing for every EU customer in the hosted checkout flow. We started seeing declines at 2:10 PM UTC and can reproduce across three tenants.\n\nThis is blocking today's launch. We need an owner and an ETA before our 4 PM status call. Can you confirm who is driving this?\n\nMarcus\nVP Engineering, Northstar Health",
    },
    {
      sender: "Priya Shah",
      email: "priya@tenex.co",
      hoursAgo: 2,
      recipients: "to Marcus, Me",
      text: "Marcus — acknowledged. We see elevated declines from one EU acquirer starting 2:09 PM UTC. Payments on-call is engaged and we're isolating whether it's the acquirer or our routing change from this morning.\n\nLive status here: https://status.tenex.co/incidents/eu-checkout\n\nAmogh owns the incident from our side and will confirm an ETA within the hour.",
    },
    {
      sender: "Marcus Chen",
      email: "marcus@northstar.health",
      hoursAgo: 1,
      recipients: "to Priya, Me",
      text: "Thanks Priya. Holding the launch until we hear back — please keep this thread updated. If we miss the 4 PM window we slip a week, so an owner confirmation before the call matters.",
    },
  ],
  "contract-redlines": [
    {
      sender: "Priya Shah",
      email: "priya@tenex.co",
      hoursAgo: 26,
      recipients: "to Me, Legal",
      text: "Redlines are back from Northstar's counsel. Everything is agreed except the liability cap — they want 2x fees, our standard is 1x.\n\nLegal drafted fallback language at 1.5x with a carve-out for data incidents.",
    },
    {
      sender: "Priya Shah",
      email: "priya@tenex.co",
      hoursAgo: 2,
      recipients: "to Me",
      text: "Legal is aligned on everything except the liability cap. The customer will accept our fallback language if we confirm it today. Can you sign off on the fallback position by 3 PM so I can send the final draft tonight?",
    },
  ],
  "customer-billing": [
    {
      sender: "Yuki Tanaka",
      email: "yuki@kaizenlabs.jp",
      hoursAgo: 20,
      recipients: "to Me",
      text: "We were invoiced twice for the annual renewal on July 18 — both charges settled. Our finance team closes books on the 25th, so we need the duplicate refunded or a credit memo before then. Can you confirm today?",
    },
    {
      sender: "Yuki Tanaka",
      email: "yuki@kaizenlabs.jp",
      hoursAgo: 18,
      recipients: "to Me",
      text: "Adding our invoice numbers for reference: INV-2026-4417 and INV-2026-4418. Same amount, same PO. Happy to jump on a call if that speeds things up.",
    },
  ],
  "customer-poc": [
    {
      sender: "Amara Diallo",
      email: "amara@finchhealth.com",
      hoursAgo: 70,
      recipients: "to Me",
      text: "The pilot is going well internally — the reconciliation team especially likes the audit trail.",
    },
    {
      sender: "Me",
      email: "me@tenex.co",
      hoursAgo: 68,
      recipients: "to Amara",
      text: "Great to hear. Anything blocking a decision on the annual agreement from your side?",
    },
    {
      sender: "Amara Diallo",
      email: "amara@finchhealth.com",
      hoursAgo: 65,
      recipients: "to Me",
      text: "Our CFO asked whether the proof of concept can include the reconciliation workflow before we sign the annual deal. If that's feasible within the current timeline, we're ready to move to contract this month. What would it take?",
    },
  ],
};

/** Detail for one demo thread, same contract as the live endpoint. */
export function demoThreadDetail(threadId: string, now: number): ThreadDetail | null {
  const all = buildDemoThreads(now);
  const summary = all.find((thread) => thread.id === threadId);
  if (!summary) return null;
  const seedId = threadId.replace(/^demo-/, "");
  const conversation = CONVERSATIONS[seedId];
  const messages: ThreadMessage[] = conversation
    ? conversation.map((message, index) => ({
        id: `${threadId}-m${index + 1}`,
        sender: message.sender,
        email: message.email,
        date: new Date(now - message.hoursAgo * 3_600_000).toISOString(),
        text: message.text,
        html: message.html ?? null,
        recipients: message.recipients,
      }))
    : [
        {
          id: `${threadId}-m1`,
          sender: summary.sender,
          email: summary.email,
          date: summary.date,
          text: summary.excerpt.replace(/^\[earlier\] /m, ""),
          html: null,
          recipients: "to Me",
        },
      ];
  return { id: threadId, subject: summary.subject, messages };
}

/** Serve the demo inbox with the same pagination contract as live Gmail. */
export function demoThreadsPage(pageToken: string | null, now: number): ThreadsResponse {
  const all = buildDemoThreads(now);
  const page = pageToken === "demo-2" ? 1 : 0;
  const start = page * PAGE_SIZE;
  const threads = all.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < all.length;
  return {
    threads,
    nextPageToken: page === 0 && hasMore ? "demo-2" : null,
    email: null,
    mode: "demo",
    skipped: 0,
  };
}
