import type { ThreadSummary } from "../../lib/types";
import type { ReplyLikelihood, VoiceExemplar, VoiceProfile } from "../../lib/voice-types";
import { situationOfParent, type Situation } from "./voice-corpus";

/**
 * Deterministic situation detection and exemplar matching — no embeddings,
 * no model calls. The reply-likelihood note renders BEFORE any spend and
 * only ever states measured numbers from the profile.
 */

export type ThreadSituation = Situation | "bulk";

const NOREPLY_PATTERN = /no-?reply|do-?not-?reply|notifications?@|updates@|mailer-daemon/i;

export function detectThreadSituation(
  thread: Pick<ThreadSummary, "subject" | "excerpt" | "listUnsubscribe" | "email">,
  bucketId: string | null,
): ThreadSituation {
  if (thread.listUnsubscribe || NOREPLY_PATTERN.test(thread.email)) return "bulk";
  if (bucketId === "newsletter" || bucketId === "archive") return "bulk";
  if (bucketId === "escalations") return "escalation";
  return situationOfParent(`${thread.subject}. ${thread.excerpt.slice(0, 400)}`);
}

export function computeReplyLikelihood(
  situation: ThreadSituation,
  profile: VoiceProfile,
): ReplyLikelihood {
  const replies = profile.corpus.replyCount;
  if (situation === "bulk") {
    return {
      level: "unknown",
      note: "Bulk or no-reply mail — reply behavior was not measured for list mail.",
    };
  }
  const entry = profile.replyBehavior.respondsTo.find(
    (candidate) => candidate.situation === situation,
  );
  const latency = entry && entry.typicalLatency !== "n/a" ? `, typically within ${entry.typicalLatency}` : "";
  if (entry && entry.count >= 3) {
    return {
      level: "typical",
      note: `${entry.count} of your last ${replies} replies answered ${situation} mail${latency}.`,
    };
  }
  if (entry) {
    return {
      level: "sometimes",
      note: `Only ${entry.count} of your last ${replies} replies answered ${situation} mail${latency}.`,
    };
  }
  if (profile.replyBehavior.neverObserved.includes(situation)) {
    return {
      level: "no-evidence",
      note: `None of your last ${replies} studied replies answered ${situation} mail.`,
    };
  }
  return { level: "unknown", note: "No measured reply behavior for this situation." };
}

/**
 * Draft-input excerpt: the latest message in full (budgeted) plus brief
 * one-line context for up to four earlier messages. <= 2,400 chars.
 */
export function buildDraftExcerpt(
  messages: Array<{ sender: string; date: string; text: string }>,
): string {
  if (!messages.length) return "";
  const latest = messages[messages.length - 1];
  const lines: string[] = [];
  for (const message of messages.slice(0, -1).slice(-4)) {
    lines.push(
      `[${message.sender} · ${message.date.slice(0, 10)}] ${message.text.replace(/\s+/g, " ").slice(0, 160)}`,
    );
  }
  lines.push(`[LATEST · ${latest.sender} · ${latest.date.slice(0, 10)}]`);
  lines.push(latest.text.slice(0, 1_800));
  return lines.join("\n").slice(0, 2_400);
}

/** Score: +3 same situation, +2 same internal/external side, +1 recent half. */
export function matchExemplars(
  profile: VoiceProfile,
  target: { situation: ThreadSituation; internal: boolean },
  max = 3,
): VoiceExemplar[] {
  if (!profile.exemplars.length) return [];
  const byRecency = [...profile.exemplars].sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  );
  const recentCut = byRecency[Math.floor((byRecency.length - 1) / 2)].sentAt;
  const score = (exemplar: VoiceExemplar) =>
    (exemplar.situation === target.situation ? 3 : 0) +
    (exemplar.internal === target.internal ? 2 : 0) +
    (exemplar.sentAt >= recentCut ? 1 : 0);
  return [...profile.exemplars]
    .sort(
      (a, b) =>
        score(b) - score(a) || new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    )
    .slice(0, max);
}
