export type BucketId =
  | "important"
  | "review"
  | "wait"
  | "newsletter"
  | "archive"
  | "escalations";

export type ThreadStatus = "complete" | "review" | "queued" | "classifying";

export type Bucket = {
  id: BucketId | string;
  name: string;
  description: string;
  tone: "violet" | "amber" | "blue" | "green" | "neutral";
  custom?: boolean;
};

export type Classification = {
  bucketId: BucketId | string;
  runnerUpBucketId: BucketId | string | null;
  rationale: string;
  evidence: string[];
  ambiguityReasons: string[];
  needsReview: boolean;
  model: string;
  promptVersion: string;
  taxonomyVersion: number;
  latencyMs: number;
  costMicros: number;
};

export type EmailMessage = {
  id: string;
  sender: string;
  email: string;
  timestamp: string;
  content: string[];
};

export type EmailThread = {
  id: string;
  sender: string;
  email: string;
  initials: string;
  avatarTone: string;
  subject: string;
  preview: string;
  time: string;
  date: string;
  unread: boolean;
  starred?: boolean;
  labels: string[];
  status: ThreadStatus;
  participants: string[];
  messages: EmailMessage[];
  classification: Classification;
  groundTruth: BucketId | string;
};

