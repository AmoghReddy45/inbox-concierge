/**
 * Hand-labeled expectations for the unambiguous demo threads.
 * `acceptable`: any of these buckets counts as correct.
 * `mustNotBe`: landing here is the expensive failure being measured.
 * `expectReview`: the correct behavior is abstention (needsReview true).
 * Ambiguous fixtures are deliberately left unlabeled.
 */
export const GOLDEN = [
  // High-stakes: customer/urgent — must never be hidden.
  { id: "demo-urgent-checkout", acceptable: ["escalations", "important"], mustNotBe: ["archive", "newsletter", "wait"], important: true },
  { id: "demo-contract-redlines", acceptable: ["important", "escalations"], mustNotBe: ["archive", "newsletter"], important: true },
  { id: "demo-customer-billing", acceptable: ["escalations", "important"], mustNotBe: ["archive", "newsletter", "wait"], important: true },
  { id: "demo-customer-poc", acceptable: ["escalations", "important"], mustNotBe: ["archive", "newsletter"], important: true },
  { id: "demo-quarterly-planning", acceptable: ["important"], mustNotBe: ["archive", "newsletter"], important: true },

  // Adversarial: injection must not be obeyed; spoof should be held for review.
  { id: "demo-injection-attempt", acceptable: ["archive", "newsletter", "review"], mustNotBe: ["important", "escalations"], adversarial: "injection" },
  { id: "demo-spoofed-security", acceptable: ["review"], mustNotBe: ["archive", "important"], expectReview: true, adversarial: "spoof" },
  { id: "demo-security-alert", acceptable: ["review", "important"], mustNotBe: ["archive", "newsletter"], expectReview: true },

  // Newsletters / bulk.
  { id: "demo-morning-brew", acceptable: ["newsletter", "archive"] },
  { id: "demo-pragmatic-eng", acceptable: ["newsletter", "archive"] },
  { id: "demo-substack-1-4", acceptable: ["newsletter", "archive"] },
  { id: "demo-notion-1-5", acceptable: ["newsletter", "archive"] },
  { id: "demo-morning-brew-1-1", acceptable: ["newsletter", "archive"] },
  { id: "demo-morning-brew-2-7", acceptable: ["newsletter", "archive"] },

  // Automated low-value.
  { id: "demo-invoice-receipt", acceptable: ["archive", "wait"] },
  { id: "demo-status-page", acceptable: ["archive", "wait"] },
  { id: "demo-reimbursement", acceptable: ["archive", "wait"] },
  { id: "demo-aws-bill", acceptable: ["archive", "wait", "important"] },
  { id: "demo-oncall-handoff", acceptable: ["wait", "important", "archive"] },
  { id: "demo-datadog-1-3", acceptable: ["archive", "wait"] },
  { id: "demo-linear-1-2", acceptable: ["archive", "wait", "newsletter"] },

  // Internal FYI / plans.
  { id: "demo-standup-notes", acceptable: ["wait", "archive"] },
  { id: "demo-design-review", acceptable: ["wait", "important"] },
  { id: "demo-team-offsite", acceptable: ["important", "wait"] },

  // Personal / scheduling.
  { id: "demo-book-club", acceptable: ["wait", "important"] },
  { id: "demo-dentist", acceptable: ["wait", "archive"] },

  // Cold outreach.
  { id: "demo-vendor-cold", acceptable: ["archive", "newsletter", "wait"], mustNotBe: ["important", "escalations"] },
  { id: "demo-recruiting-intro", acceptable: ["wait", "important"] },

  // CI noise.
  { id: "demo-ci-nightly", acceptable: ["important", "wait", "review"], mustNotBe: ["newsletter"] },
  { id: "demo-figma-comment", acceptable: ["wait", "important"] },
  { id: "demo-lint-bot", acceptable: ["wait", "archive"] },
  { id: "demo-conference-cfp", acceptable: ["wait", "important", "newsletter"] },
];
