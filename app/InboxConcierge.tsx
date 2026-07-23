"use client";

import {
  Archive,
  ArrowLeft,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Clock3,
  Command,
  CornerDownLeft,
  Eye,
  Filter,
  Focus,
  Inbox,
  Keyboard,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Tag,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BUCKETS, DEMO_THREADS } from "./demo-data";
import type { Bucket, EmailThread } from "./types";

type QueueView = "attention" | "review" | "all" | string;
type MobileView = "queue" | "thread";

function bucketById(buckets: Bucket[], id: string | null) {
  return buckets.find((bucket) => bucket.id === id);
}

function statusLabel(thread: EmailThread) {
  if (thread.status === "classifying") return "Classifying";
  if (thread.status === "queued") return "Queued";
  if (thread.classification.needsReview) return "Needs review";
  return "Strong evidence";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function highlightEvidence(text: string, evidence: string[]) {
  const match = evidence.find((quote) => text.toLowerCase().includes(quote.toLowerCase()));
  if (!match) return text;
  const index = text.toLowerCase().indexOf(match.toLowerCase());
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + match.length)}</mark>
      {text.slice(index + match.length)}
    </>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "warning";
}) {
  return (
    <div className={`metric-card ${tone ? `metric-${tone}` : ""}`}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  );
}

export function InboxConcierge() {
  const [threads, setThreads] = useState<EmailThread[]>(DEMO_THREADS);
  const [buckets, setBuckets] = useState<Bucket[]>(DEFAULT_BUCKETS);
  const [selectedId, setSelectedId] = useState("t-003");
  const [queueView, setQueueView] = useState<QueueView>("attention");
  const [query, setQuery] = useState("");
  const [taxonomyVersion, setTaxonomyVersion] = useState(2);
  const [classifiedCount, setClassifiedCount] = useState(168);
  const [running, setRunning] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("queue");
  const [draftName, setDraftName] = useState("");
  const [draftDefinition, setDraftDefinition] = useState("");
  const [draftExample, setDraftExample] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [lastCorrection, setLastCorrection] = useState<{
    id: string;
    previousBucketId: string;
    previousNeedsReview: boolean;
  } | null>(null);
  const [source, setSource] = useState<"demo" | "gmail">("demo");
  const [sourceEmail, setSourceEmail] = useState<string | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedThread =
    threads.find((thread) => thread.id === selectedId) ?? threads[0];

  const counts = useMemo(() => {
    return buckets.reduce<Record<string, number>>((acc, bucket) => {
      acc[bucket.id] = threads.filter(
        (thread) => thread.classification.bucketId === bucket.id,
      ).length;
      return acc;
    }, {});
  }, [buckets, threads]);

  const visibleThreads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return threads.filter((thread) => {
      const matchesQuery =
        !normalizedQuery ||
        [thread.sender, thread.subject, thread.preview, ...thread.labels]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      if (!matchesQuery) return false;
      if (queueView === "all") return true;
      if (queueView === "review") return thread.classification.needsReview;
      if (queueView === "attention") {
        return ["important", "escalations", "review"].includes(
          thread.classification.bucketId,
        );
      }
      return thread.classification.bucketId === queueView;
    });
  }, [query, queueView, threads]);

  const fixtureMetrics = useMemo(() => {
    const importantBuckets = new Set(["important", "escalations"]);
    const trulyImportant = threads.filter((thread) =>
      importantBuckets.has(thread.groundTruth),
    );
    const importantFound = trulyImportant.filter((thread) =>
      importantBuckets.has(thread.classification.bucketId),
    );
    const importantArchived = trulyImportant.filter(
      (thread) => thread.classification.bucketId === "archive",
    );
    const reviewCount = threads.filter(
      (thread) => thread.classification.needsReview,
    ).length;
    const averageLatency = Math.round(
      threads.reduce((sum, thread) => sum + thread.classification.latencyMs, 0) /
        threads.length,
    );
    const totalCost =
      threads.reduce((sum, thread) => sum + thread.classification.costMicros, 0) /
      1_000_000;

    return {
      recall: `${Math.round((importantFound.length / trulyImportant.length) * 100)}%`,
      falseArchive: `${Math.round(
        (importantArchived.length / trulyImportant.length) * 100,
      )}%`,
      reviewRate: `${Math.round((reviewCount / threads.length) * 100)}%`,
      latency: `${averageLatency} ms`,
      cost: `$${totalCost.toFixed(3)}`,
    };
  }, [threads]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const selectThread = useCallback((id: string) => {
    setSelectedId(id);
    setTechnicalOpen(false);
    setCorrectionOpen(false);
    setMobileView("thread");
  }, []);

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (!visibleThreads.length) return;
      const currentIndex = visibleThreads.findIndex((thread) => thread.id === selectedId);
      const nextIndex =
        currentIndex < 0
          ? 0
          : (currentIndex + direction + visibleThreads.length) % visibleThreads.length;
      selectThread(visibleThreads[nextIndex].id);
    },
    [selectThread, selectedId, visibleThreads],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setShortcutOpen(false);
        setComposerOpen(false);
        setCorrectionOpen(false);
        setQualityOpen(false);
        setAccountOpen(false);
        return;
      }
      if (typing) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        moveSelection(1);
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        setCorrectionOpen(true);
      } else if (event.key === "?") {
        event.preventDefault();
        setShortcutOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveSelection]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setClassifiedCount((current) => {
        if (current >= 200) {
          window.clearInterval(timer);
          setRunning(false);
          showToast(`Taxonomy v${taxonomyVersion} finished · 200 threads checked`);
          return 200;
        }
        return Math.min(200, current + 8);
      });
    }, 180);
    return () => window.clearInterval(timer);
  }, [running, showToast, taxonomyVersion]);

  useEffect(() => {
    fetch("/api/google/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.connected) {
          setSource("gmail");
          setSourceEmail(payload.email ?? null);
        }
      })
      .catch(() => undefined);
  }, []);

  const correctClassification = (bucketId: string) => {
    if (!selectedThread) return;
    setLastCorrection({
      id: selectedThread.id,
      previousBucketId: selectedThread.classification.bucketId,
      previousNeedsReview: selectedThread.classification.needsReview,
    });
    setThreads((current) =>
      current.map((thread) =>
        thread.id === selectedThread.id
          ? {
              ...thread,
              status: "complete",
              classification: {
                ...thread.classification,
                bucketId,
                needsReview: false,
                taxonomyVersion,
              },
            }
          : thread,
      ),
    );
    setCorrectionOpen(false);
    const bucket = bucketById(buckets, bucketId);
    showToast(`Moved to ${bucket?.name ?? "new bucket"} · correction recorded`);

    const nextReview = threads.find(
      (thread) => thread.id !== selectedThread.id && thread.classification.needsReview,
    );
    if (nextReview) window.setTimeout(() => selectThread(nextReview.id), 240);
  };

  const undoCorrection = () => {
    if (!lastCorrection) return;
    setThreads((current) =>
      current.map((thread) =>
        thread.id === lastCorrection.id
          ? {
              ...thread,
              classification: {
                ...thread.classification,
                bucketId: lastCorrection.previousBucketId,
                needsReview: lastCorrection.previousNeedsReview,
              },
            }
          : thread,
      ),
    );
    selectThread(lastCorrection.id);
    setLastCorrection(null);
    showToast("Correction undone");
  };

  const createBucket = () => {
    if (!draftName.trim() || !draftDefinition.trim()) return;
    const id = `${slugify(draftName)}-${Date.now()}`;
    const nextVersion = taxonomyVersion + 1;
    setBuckets((current) => [
      ...current,
      {
        id,
        name: draftName.trim(),
        description: draftDefinition.trim(),
        tone: "blue",
        custom: true,
      },
    ]);
    setThreads((current) =>
      current.map((thread) => ({
        ...thread,
        status: "queued",
        classification: {
          ...thread.classification,
          taxonomyVersion: nextVersion,
        },
      })),
    );
    setTaxonomyVersion(nextVersion);
    setClassifiedCount(0);
    setRunning(true);
    setComposerOpen(false);
    setDraftName("");
    setDraftDefinition("");
    setDraftExample("");
    showToast(`Taxonomy v${nextVersion} created · reclassification started`);
  };

  const runSelectedWithAi = async () => {
    if (!selectedThread || triaging) return;
    setTriaging(true);
    try {
      const response = await fetch("/api/ai/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread: {
            id: selectedThread.id,
            sender: selectedThread.sender,
            subject: selectedThread.subject,
            messages: selectedThread.messages.map((message) => ({
              sender: message.sender,
              content: message.content,
            })),
          },
          taxonomy: buckets.map(({ id, name, description }) => ({
            id,
            name,
            description,
          })),
          taxonomyVersion,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.decision) throw new Error("Classification failed");
      setThreads((current) =>
        current.map((thread) =>
          thread.id === selectedThread.id
            ? {
                ...thread,
                status: payload.decision.needsReview ? "review" : "complete",
                classification: {
                  ...thread.classification,
                  ...payload.decision,
                  model: payload.meta?.model ?? thread.classification.model,
                  latencyMs: payload.meta?.latencyMs ?? thread.classification.latencyMs,
                  taxonomyVersion,
                },
              }
            : thread,
        ),
      );
      showToast(
        payload.meta?.fallback
          ? "Decision refreshed with the deterministic demo classifier"
          : "Decision refreshed with Kimi K3",
      );
    } catch {
      showToast("The decision could not be refreshed. The last valid result is still shown.");
    } finally {
      setTriaging(false);
    }
  };

  const loadGmailSnapshot = async () => {
    if (loadingSource) return;
    setLoadingSource(true);
    try {
      const response = await fetch("/api/gmail/threads", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload?.threads)) throw new Error("Gmail load failed");
      const liveThreads: EmailThread[] = payload.threads.map(
        (thread: {
          id: string;
          sender: string;
          email: string;
          initials: string;
          subject: string;
          preview: string;
          date: string;
          unread: boolean;
          labels: string[];
          messageCount: number;
        }, index: number) => {
          const date = new Date(thread.date);
          return {
            id: `gmail-${thread.id}`,
            sender: thread.sender,
            email: thread.email,
            initials: thread.initials,
            avatarTone: ["#f0eaff", "#e7f5ff", "#e7f8f0", "#fff2dc"][index % 4],
            subject: thread.subject,
            preview: thread.preview,
            time: date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            date: date.toLocaleString(),
            unread: thread.unread,
            labels: thread.labels.slice(0, 2),
            status: "queued" as const,
            participants: [thread.sender, "You"],
            messages: [
              {
                id: `gmail-message-${thread.id}`,
                sender: thread.sender,
                email: thread.email,
                timestamp: date.toLocaleString(),
                content: [thread.preview],
              },
            ],
            classification: {
              bucketId: "review",
              runnerUpBucketId: "important",
              rationale: "This live thread has been loaded but not sent to a model. Refresh the decision to classify it.",
              evidence: [thread.preview],
              ambiguityReasons: ["Live Gmail thread has not been classified yet"],
              needsReview: true,
              model: "pending",
              promptVersion: "triage-v4",
              taxonomyVersion,
              latencyMs: 0,
              costMicros: 0,
            },
            groundTruth: "review",
          };
        },
      );
      if (!liveThreads.length) throw new Error("No recent threads");
      setThreads(liveThreads);
      setSelectedId(liveThreads[0].id);
      setQueueView("all");
      setSource("gmail");
      setSourceEmail(payload.email ?? sourceEmail);
      setClassifiedCount(0);
      setAccountOpen(false);
      setMobileView("thread");
      showToast(`${liveThreads.length} recent Gmail threads loaded · none sent to AI`);
    } catch {
      showToast("The Gmail snapshot could not be loaded. Demo data is still available.");
    } finally {
      setLoadingSource(false);
    }
  };

  const selectedBucket = bucketById(
    buckets,
    selectedThread?.classification.bucketId ?? null,
  );
  const runnerUpBucket = bucketById(
    buckets,
    selectedThread?.classification.runnerUpBucketId ?? null,
  );
  const overlapWarning = /customer|urgent|important|reply|blocker/i.test(
    `${draftName} ${draftDefinition}`,
  );

  return (
    <main className={`workspace-shell mobile-${mobileView} inspector-${inspectorOpen ? "open" : "closed"}`}>
      <section className="queue-pane" aria-label="Inbox decision queue">
        <header className="pane-header brand-header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <Focus size={15} strokeWidth={2.4} />
            </span>
            <div>
              <strong>Inbox Concierge</strong>
              <span>Tenex lab</span>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Workspace menu"
            onClick={() => setAccountOpen((open) => !open)}
          >
            <Menu size={17} />
          </button>
          {accountOpen && (
            <div className="popover account-popover">
              <div className="account-summary">
                <span className="avatar avatar-small" style={{ background: "#ece8ff" }}>
                  AR
                </span>
                <div>
                  <strong>Amogh Reddy</strong>
                  <span>{source === "gmail" ? sourceEmail ?? "Google connected" : "Demo inbox"}</span>
                </div>
              </div>
              <a className="menu-row" href="/api/google/start">
                <LockKeyhole size={15} />
                {source === "gmail" ? "Reconnect Google" : "Connect Google"}
              </a>
              {source === "gmail" && (
                <button className="menu-row" onClick={loadGmailSnapshot} disabled={loadingSource}>
                  {loadingSource ? <LoaderCircle className="spin" size={15} /> : <Inbox size={15} />}
                  Load recent threads
                </button>
              )}
              <button className="menu-row" onClick={() => setAccountOpen(false)}>
                <Settings2 size={15} /> Settings
              </button>
            </div>
          )}
        </header>

        <div className="queue-controls">
          <div className="queue-view-tabs" aria-label="Queue views">
            <button
              className={queueView === "attention" ? "active" : ""}
              onClick={() => setQueueView("attention")}
            >
              Attention <span>{threads.filter((thread) => ["important", "escalations", "review"].includes(thread.classification.bucketId)).length}</span>
            </button>
            <button
              className={queueView === "review" ? "active" : ""}
              onClick={() => setQueueView("review")}
            >
              Review <span>{threads.filter((thread) => thread.classification.needsReview).length}</span>
            </button>
            <button
              className={queueView === "all" ? "active" : ""}
              onClick={() => setQueueView("all")}
            >
              All <span>{threads.length}</span>
            </button>
          </div>

          <div className={`run-progress ${running ? "is-running" : ""}`}>
            <div className="run-progress-copy">
              <div>
                {running ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}
                <strong>{running ? "Reclassifying" : "Snapshot ready"}</strong>
              </div>
              <span className="mono">{classifiedCount} / 200 · TAXONOMY V{taxonomyVersion}</span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${(classifiedCount / 200) * 100}%` }} />
            </div>
          </div>

          <div className="search-control">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this snapshot"
              aria-label="Search this inbox snapshot"
            />
            <kbd>/</kbd>
          </div>

          <div className="bucket-strip" aria-label="Buckets">
            {buckets.map((bucket) => (
              <button
                key={bucket.id}
                className={`bucket-chip ${queueView === bucket.id ? "active" : ""}`}
                onClick={() => setQueueView(bucket.id)}
                title={bucket.description}
              >
                <span className={`tone-dot tone-${bucket.tone}`} />
                {bucket.name}
                <small>{counts[bucket.id] ?? 0}</small>
              </button>
            ))}
            <button className="bucket-chip add-bucket-chip" onClick={() => setComposerOpen(true)}>
              <Plus size={13} /> New bucket
            </button>
          </div>
        </div>

        <div className="queue-list-header">
          <span>{visibleThreads.length} decisions</span>
          <button className="text-icon-button" aria-label="Filter queue">
            <Filter size={14} /> Filter
          </button>
        </div>

        <div className="thread-list">
          {visibleThreads.length ? (
            visibleThreads.map((thread) => {
              const bucket = bucketById(buckets, thread.classification.bucketId);
              return (
                <button
                  key={thread.id}
                  className={`thread-row ${selectedThread?.id === thread.id ? "selected" : ""} ${thread.unread ? "unread" : ""}`}
                  onClick={() => selectThread(thread.id)}
                >
                  <span className="avatar" style={{ background: thread.avatarTone }}>
                    {thread.initials}
                  </span>
                  <span className="thread-row-content">
                    <span className="thread-row-topline">
                      <strong>{thread.sender}</strong>
                      <time>{thread.time}</time>
                    </span>
                    <span className="thread-subject">{thread.subject}</span>
                    <span className="thread-preview">{thread.preview}</span>
                    <span className="thread-meta">
                      <span className={`status-pill tone-${bucket?.tone ?? "neutral"}`}>
                        {bucket?.name ?? "Unsorted"}
                      </span>
                      {thread.classification.needsReview && (
                        <span className="review-flag">
                          <CircleAlert size={11} /> Review
                        </span>
                      )}
                    </span>
                  </span>
                  {thread.unread && <span className="unread-dot" aria-label="Unread" />}
                </button>
              );
            })
          ) : (
            <div className="empty-queue">
              <Inbox size={24} />
              <strong>Nothing needs your attention.</strong>
              <span>Nicely done.</span>
            </div>
          )}
        </div>

        <footer className="queue-footer">
          <button onClick={() => setQualityOpen(true)}>
            <BarChart3 size={15} /> Quality
          </button>
          <button onClick={() => setShortcutOpen(true)}>
            <Keyboard size={15} /> Shortcuts
          </button>
          <button onClick={() => setCommandOpen(true)}>
            <Command size={15} /> <kbd>⌘K</kbd>
          </button>
        </footer>
      </section>

      <section className="thread-pane" aria-label="Selected email thread">
        <header className="pane-header thread-header">
          <button
            className="icon-button mobile-back"
            aria-label="Back to queue"
            onClick={() => setMobileView("queue")}
          >
            <ArrowLeft size={17} />
          </button>
          <div className="thread-breadcrumb">
            <span>Decision queue</span>
            <ChevronRight size={13} />
            <strong>{selectedBucket?.name ?? "Unsorted"}</strong>
          </div>
          <div className="thread-toolbar">
            <button className="icon-button" aria-label="Previous thread" onClick={() => moveSelection(-1)}>
              <ChevronDown className="rotate-180" size={16} />
            </button>
            <button className="icon-button" aria-label="Next thread" onClick={() => moveSelection(1)}>
              <ChevronDown size={16} />
            </button>
            <button className="icon-button" aria-label="More actions">
              <MoreHorizontal size={17} />
            </button>
            {!inspectorOpen && (
              <button
                className="icon-button"
                aria-label="Open decision inspector"
                onClick={() => setInspectorOpen(true)}
              >
                <PanelRightOpen size={17} />
              </button>
            )}
          </div>
        </header>

        {selectedThread && (
          <div className="thread-scroll">
            <article className="message-canvas">
              <div className="message-title-row">
                <div>
                  <div className="eyebrow-row">
                    {selectedThread.labels.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  <h1>{selectedThread.subject}</h1>
                </div>
                <button className="icon-button" aria-label="Thread notifications">
                  <Bell size={16} />
                </button>
              </div>

              <div className="participant-line">
                <div className="avatar-stack">
                  {selectedThread.participants.slice(0, 3).map((participant, index) => (
                    <span
                      key={participant}
                      className="avatar avatar-small"
                      style={{ background: [selectedThread.avatarTone, "#eef1f3", "#e8f4ff"][index] }}
                      title={participant}
                    >
                      {participant
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                  ))}
                </div>
                <span>{selectedThread.participants.join(", ")}</span>
                <span className="participant-count">{selectedThread.messages.length} message{selectedThread.messages.length > 1 ? "s" : ""}</span>
              </div>

              <div className="thread-messages">
                {selectedThread.messages.map((message, index) => (
                  <section className="email-message" key={message.id}>
                    <header>
                      <span className="avatar" style={{ background: index === 0 ? selectedThread.avatarTone : "#eef1f3" }}>
                        {message.sender
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <div>
                        <strong>{message.sender}</strong>
                        <span>{message.email}</span>
                      </div>
                      <time>{message.timestamp}</time>
                    </header>
                    <div className="message-body">
                      {message.content.map((paragraph) => (
                        <p key={paragraph}>{highlightEvidence(paragraph, selectedThread.classification.evidence)}</p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <div className="read-only-callout">
                <ShieldCheck size={16} />
                <div>
                  <strong>No changes were made in Gmail</strong>
                  <span>Inbox Concierge recommends decisions; this demo has read-only access.</span>
                </div>
              </div>
            </article>
          </div>
        )}
      </section>

      {inspectorOpen && selectedThread && (
        <aside className="inspector-pane" aria-label="Classification decision inspector">
          <header className="pane-header inspector-header">
            <div>
              <span className="mono">DECISION</span>
              <strong>Classification</strong>
            </div>
            <div className="header-actions">
              <button
                className="icon-button"
                aria-label="Open quality panel"
                onClick={() => setQualityOpen(true)}
              >
                <BarChart3 size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Close decision inspector"
                onClick={() => setInspectorOpen(false)}
              >
                <PanelRightClose size={16} />
              </button>
            </div>
          </header>

          <div className="inspector-scroll">
            <section className="decision-hero">
              <div className="decision-status-row">
                <span className={`decision-state ${selectedThread.classification.needsReview ? "warning" : "good"}`}>
                  {selectedThread.classification.needsReview ? (
                    <CircleAlert size={13} />
                  ) : (
                    <Check size={13} />
                  )}
                  {statusLabel(selectedThread)}
                </span>
                <span className="mono">V{taxonomyVersion}</span>
              </div>
              <span className={`bucket-icon tone-${selectedBucket?.tone ?? "neutral"}`}>
                {selectedThread.classification.needsReview ? <CircleHelp size={18} /> : <Tag size={18} />}
              </span>
              <h2>{selectedBucket?.name ?? "Unsorted"}</h2>
              <p>{selectedBucket?.description}</p>
            </section>

            {selectedThread.classification.ambiguityReasons.length > 0 && (
              <section className="inspector-section ambiguity-section">
                <div className="section-label">
                  <CircleAlert size={14} /> Why it needs review
                </div>
                <ul>
                  {selectedThread.classification.ambiguityReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="inspector-section">
              <div className="section-label">
                <Eye size={14} /> Why this decision
              </div>
              <p className="rationale">{selectedThread.classification.rationale}</p>
              <div className="evidence-list">
                {selectedThread.classification.evidence.map((quote) => (
                  <button
                    className="evidence-quote"
                    key={quote}
                    onClick={() => showToast("Evidence highlighted in the message")}
                  >
                    “{quote}”
                  </button>
                ))}
              </div>
            </section>

            {runnerUpBucket && (
              <section className="inspector-section runner-up-section">
                <span className="section-kicker">WHAT ELSE IT COULD BE</span>
                <div className="runner-up-card">
                  <span className={`tone-dot tone-${runnerUpBucket.tone}`} />
                  <div>
                    <strong>{runnerUpBucket.name}</strong>
                    <span>{runnerUpBucket.description}</span>
                  </div>
                </div>
              </section>
            )}

            <section className="inspector-section correction-section">
              <button className="primary-button" onClick={() => setCorrectionOpen(true)}>
                Correct classification <kbd>C</kbd>
              </button>
              <button className="secondary-button" onClick={runSelectedWithAi} disabled={triaging}>
                {triaging ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
                Refresh decision
              </button>
              <p>Corrections are recorded as evidence. They do not silently retrain the system.</p>
            </section>

            <section className="inspector-section technical-section">
              <button className="technical-toggle" onClick={() => setTechnicalOpen((open) => !open)}>
                <span>
                  <Layers3 size={14} /> Technical details
                </span>
                <ChevronDown className={technicalOpen ? "rotate-180" : ""} size={15} />
              </button>
              {technicalOpen && (
                <dl className="technical-grid">
                  <div>
                    <dt>Model</dt>
                    <dd>{selectedThread.classification.model}</dd>
                  </div>
                  <div>
                    <dt>Prompt</dt>
                    <dd>{selectedThread.classification.promptVersion}</dd>
                  </div>
                  <div>
                    <dt>Taxonomy</dt>
                    <dd>v{selectedThread.classification.taxonomyVersion}</dd>
                  </div>
                  <div>
                    <dt>Latency</dt>
                    <dd>{selectedThread.classification.latencyMs} ms</dd>
                  </div>
                  <div>
                    <dt>Content hash</dt>
                    <dd>sha256:{selectedThread.id.replace("t-", "8d4")}</dd>
                  </div>
                  <div>
                    <dt>Estimated cost</dt>
                    <dd>${(selectedThread.classification.costMicros / 1_000_000).toFixed(4)}</dd>
                  </div>
                </dl>
              )}
            </section>
          </div>
        </aside>
      )}

      {correctionOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setCorrectionOpen(false)}>
          <div className="popover correction-popover" role="dialog" aria-label="Correct classification" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="mono">CORRECTION</span>
                <strong>Move this thread</strong>
              </div>
              <button className="icon-button" aria-label="Close" onClick={() => setCorrectionOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <div className="correction-options">
              {buckets.map((bucket) => (
                <button key={bucket.id} onClick={() => correctClassification(bucket.id)}>
                  <span className={`bucket-icon small tone-${bucket.tone}`}>
                    {bucket.id === "archive" ? <Archive size={15} /> : <Tag size={15} />}
                  </span>
                  <span>
                    <strong>{bucket.name}</strong>
                    <small>{bucket.description}</small>
                  </span>
                  {selectedThread.classification.bucketId === bucket.id && <Check size={15} />}
                </button>
              ))}
            </div>
            <footer>
              <ShieldCheck size={14} /> This records evidence only. Gmail stays unchanged.
            </footer>
          </div>
        </div>
      )}

      {composerOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setComposerOpen(false)}>
          <div className="modal bucket-modal" role="dialog" aria-modal="true" aria-labelledby="bucket-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="modal-icon"><Tag size={18} /></span>
                <div>
                  <span className="mono">TAXONOMY V{taxonomyVersion + 1}</span>
                  <h2 id="bucket-modal-title">Create a custom bucket</h2>
                </div>
              </div>
              <button className="icon-button" aria-label="Close" onClick={() => setComposerOpen(false)}>
                <X size={17} />
              </button>
            </header>
            <div className="modal-body">
              <label>
                <span>Bucket name</span>
                <input
                  autoFocus
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="e.g. Customer escalations"
                />
              </label>
              <label>
                <span>What belongs here?</span>
                <textarea
                  value={draftDefinition}
                  onChange={(event) => setDraftDefinition(event.target.value)}
                  placeholder="External customer email reporting a blocker, outage, billing problem, or deadline where I have not replied..."
                  rows={4}
                />
              </label>
              <label>
                <span>Example <small>Optional</small></span>
                <input
                  value={draftExample}
                  onChange={(event) => setDraftExample(event.target.value)}
                  placeholder="Checkout is down and we need an ETA before 4 PM."
                />
              </label>
              {overlapWarning && (
                <div className="overlap-warning">
                  <CircleAlert size={16} />
                  <div>
                    <strong>Possible overlap with Important</strong>
                    <span>Define the external-customer or unanswered-message signal to make the boundary clearer.</span>
                  </div>
                </div>
              )}
              <div className="version-note">
                <RefreshCw size={15} />
                <span>Saving creates taxonomy v{taxonomyVersion + 1} and reclassifies all 200 threads. Existing v{taxonomyVersion} decisions remain auditable.</span>
              </div>
            </div>
            <footer>
              <button className="secondary-button" onClick={() => setComposerOpen(false)}>Cancel</button>
              <button className="primary-button" onClick={createBucket} disabled={!draftName.trim() || !draftDefinition.trim()}>
                Create & reclassify <CornerDownLeft size={14} />
              </button>
            </footer>
          </div>
        </div>
      )}

      {qualityOpen && (
        <div className="drawer-scrim" role="presentation" onMouseDown={() => setQualityOpen(false)}>
          <aside className="quality-drawer" role="dialog" aria-label="Quality and evaluation" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="mono">EVALUATION</span>
                <h2>Quality, not vibes.</h2>
                <p>Measured on this 12-thread hand-labeled demo fixture.</p>
              </div>
              <button className="icon-button" aria-label="Close quality panel" onClick={() => setQualityOpen(false)}>
                <X size={17} />
              </button>
            </header>
            <div className="quality-content">
              <div className="quality-summary">
                <ShieldCheck size={20} />
                <div>
                  <strong>The expensive error is visible.</strong>
                  <span>One customer escalation abstained to review; no important thread was recommended for archive.</span>
                </div>
              </div>
              <div className="metric-grid">
                <MetricCard label="Important recall" value={fixtureMetrics.recall} detail="4 of 5 surfaced" tone="warning" />
                <MetricCard label="False archive" value={fixtureMetrics.falseArchive} detail="0 important hidden" tone="good" />
                <MetricCard label="Review rate" value={fixtureMetrics.reviewRate} detail="2 explicit abstentions" />
                <MetricCard label="Schema valid" value="100%" detail="12 of 12 decisions" tone="good" />
                <MetricCard label="Median-like avg." value={fixtureMetrics.latency} detail="Demo observations" />
                <MetricCard label="Fixture cost" value={fixtureMetrics.cost} detail="12 classifications" />
              </div>
              <section className="quality-section">
                <div className="quality-section-title">
                  <span>Bucket outcomes</span>
                  <span className="mono">PROMPT TRIAGE-V4</span>
                </div>
                {buckets.slice(0, 6).map((bucket) => {
                  const total = threads.filter((thread) => thread.groundTruth === bucket.id).length;
                  const correct = threads.filter(
                    (thread) => thread.groundTruth === bucket.id && thread.classification.bucketId === bucket.id,
                  ).length;
                  const percentage = total ? Math.round((correct / total) * 100) : 0;
                  return (
                    <div className="bucket-metric" key={bucket.id}>
                      <div>
                        <span className={`tone-dot tone-${bucket.tone}`} />
                        <strong>{bucket.name}</strong>
                      </div>
                      <div className="bucket-metric-track"><span style={{ width: `${percentage}%` }} /></div>
                      <span>{total ? `${correct}/${total}` : "—"}</span>
                    </div>
                  );
                })}
              </section>
              <section className="quality-section run-manifest">
                <div className="quality-section-title"><span>Run manifest</span></div>
                <dl>
                  <div><dt>Model</dt><dd>kimi-k3</dd></div>
                  <div><dt>Prompt</dt><dd>triage-v4</dd></div>
                  <div><dt>Taxonomy</dt><dd>v{taxonomyVersion}</dd></div>
                  <div><dt>Fixture</dt><dd>demo-fixture-12</dd></div>
                  <div><dt>Permission</dt><dd>gmail.readonly</dd></div>
                </dl>
              </section>
            </div>
          </aside>
        </div>
      )}

      {commandOpen && (
        <div className="overlay command-overlay" role="presentation" onMouseDown={() => setCommandOpen(false)}>
          <div className="command-palette" role="dialog" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-input">
              <Search size={17} />
              <input autoFocus placeholder="Search threads or run a command…" />
              <kbd>ESC</kbd>
            </div>
            <div className="command-group">
              <span className="mono">NAVIGATE</span>
              <button onClick={() => { setQueueView("review"); setCommandOpen(false); }}><CircleAlert size={16} /> Open review queue <kbd>G R</kbd></button>
              <button onClick={() => { setQualityOpen(true); setCommandOpen(false); }}><BarChart3 size={16} /> Open quality report <kbd>G Q</kbd></button>
              <button onClick={() => { setComposerOpen(true); setCommandOpen(false); }}><Plus size={16} /> Create custom bucket <kbd>B</kbd></button>
            </div>
            <div className="command-group">
              <span className="mono">CURRENT THREAD</span>
              <button onClick={() => { setCorrectionOpen(true); setCommandOpen(false); }}><Tag size={16} /> Correct classification <kbd>C</kbd></button>
              <button onClick={() => { runSelectedWithAi(); setCommandOpen(false); }}><RefreshCw size={16} /> Refresh decision <kbd>R</kbd></button>
            </div>
          </div>
        </div>
      )}

      {shortcutOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setShortcutOpen(false)}>
          <div className="modal shortcut-modal" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span className="modal-icon"><Keyboard size={18} /></span><h2>Move at inbox speed</h2></div>
              <button className="icon-button" aria-label="Close" onClick={() => setShortcutOpen(false)}><X size={17} /></button>
            </header>
            <div className="shortcut-grid">
              <span>Next thread</span><kbd>J</kbd>
              <span>Previous thread</span><kbd>K</kbd>
              <span>Search snapshot</span><kbd>/</kbd>
              <span>Correct classification</span><kbd>C</kbd>
              <span>Command palette</span><kbd>⌘ K</kbd>
              <span>Close panel</span><kbd>ESC</kbd>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          <span>{toast}</span>
          {lastCorrection && (
            <button onClick={undoCorrection}><Undo2 size={13} /> Undo</button>
          )}
        </div>
      )}
    </main>
  );
}
