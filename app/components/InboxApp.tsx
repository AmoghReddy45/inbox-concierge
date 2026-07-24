"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClassifier } from "../hooks/useClassifier";
import { useSelection } from "../hooks/useSelection";
import { useShortcuts, type ShortcutHandlers } from "../hooks/useShortcuts";
import { useTaxonomy } from "../hooks/useTaxonomy";
import { useTheme } from "../hooks/useTheme";
import { useThreadDetail } from "../hooks/useThreadDetail";
import { useThreads, type ThreadSource } from "../hooks/useThreads";
import { useToast } from "../hooks/useToast";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useVoiceProfile } from "../hooks/useVoiceProfile";
import { formatCost } from "../lib/format";
import type { TriageStatusResponse } from "../../lib/types";
import { BucketModal } from "./BucketModal";
import { CommandPalette, type Command } from "./CommandPalette";
import { ConnectScreen } from "./ConnectScreen";
import { DecisionPanel } from "./DecisionPanel";
import { HintBar } from "./HintBar";
import { LoadingSplash } from "./LoadingSplash";
import { ProgressStrip } from "./ProgressStrip";
import { ThreadList } from "./ThreadList";
import { ThreadView } from "./ThreadView";
import { Toast } from "./Toast";
import { TopBar } from "./TopBar";
import { VoiceOnboarding } from "./VoiceOnboarding";
import { VoiceProfileSheet } from "./VoiceProfileSheet";

type Correction = { bucketId: string; latestMessageId: string; correctedAt: number };

const CORRECTIONS_KEY = "tenex.corrections.v1";

const SHORTCUTS: Array<[string, string]> = [
  ["j / k", "Next / previous thread"],
  ["Enter or o", "Open the thread"],
  ["i", "Why this bucket (reasoning panel)"],
  ["c", "Correct the selected thread"],
  ["u", "Undo the last correction"],
  ["/", "Search"],
  ["1–9", "Switch bucket tabs"],
  ["⌘K", "Command palette"],
  ["Esc", "Close thread, panels, and dialogs"],
];

export function InboxApp() {
  const [status, setStatus] = useState<{
    checked: boolean;
    connected: boolean;
    email: string | null;
  }>({ checked: false, connected: false, email: null });
  const [classifier, setClassifier] = useState<TriageStatusResponse>({
    configured: true,
    model: "…",
    promptVersion: "",
  });
  const [source, setSource] = useState<ThreadSource | null>(null);
  const [googleError] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("google_error"),
  );

  const { buckets, taxonomyVersion, addBucket } = useTaxonomy();
  const threadsState = useThreads(source);
  const [corrections, setCorrections] = useState<Map<string, Correction>>(() => {
    if (typeof window === "undefined") return new Map();
    try {
      const raw = window.localStorage.getItem(CORRECTIONS_KEY);
      if (raw) return new Map(Object.entries(JSON.parse(raw) as Record<string, Correction>));
    } catch {
      // Corrupted corrections — start clean.
    }
    return new Map();
  });

  // Corrections become feedback hints for future classify calls (never overrides).
  const feedbackHints = useMemo(() => {
    return [...corrections.entries()]
      .sort((a, b) => b[1].correctedAt - a[1].correctedAt)
      .slice(0, 10)
      .map(([threadId, correction]) => {
        const thread = threadsState.threads.find((candidate) => candidate.id === threadId);
        if (!thread) return null;
        return {
          sender: thread.sender,
          subject: thread.subject,
          correctedToBucketId: correction.bucketId,
        };
      })
      .filter((hint): hint is NonNullable<typeof hint> => hint !== null);
  }, [corrections, threadsState.threads]);

  const { snapshot, retryFailed, pause, resume } = useClassifier(
    buckets,
    taxonomyVersion,
    threadsState.threads,
    feedbackHints,
  );
  const { theme, setTheme } = useTheme();
  const { toast, showToast, dismissToast } = useToast();

  const [activeTab, setActiveTab] = useState<string>("important");
  const [query, setQuery] = useState("");
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ open: boolean; correcting: boolean }>({
    open: false,
    correcting: false,
  });
  const [bucketModalOpen, setBucketModalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [voiceModal, setVoiceModal] = useState<null | "onboarding" | "sheet">(null);
  const voice = useVoiceProfile(source, classifier.configured);
  const undoStack = useRef<Array<{ threadId: string; previous: Correction | null }>>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const helpRef = useFocusTrap<HTMLDivElement>(helpOpen);

  // --- bootstrap: clean url params, probe connection + classifier
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_error") || params.get("connected")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    void fetch("/api/google/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { connected?: boolean; email?: string } | null) => {
        setStatus({
          checked: true,
          connected: Boolean(payload?.connected),
          email: payload?.email ?? null,
        });
        if (payload?.connected) setSource("gmail");
      })
      .catch(() => setStatus({ checked: true, connected: false, email: null }));
    void fetch("/api/ai/triage", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: TriageStatusResponse | null) => {
        if (payload) setClassifier(payload);
      })
      .catch(() => undefined);
  }, []);

  const persistCorrections = useCallback((next: Map<string, Correction>) => {
    setCorrections(next);
    try {
      window.localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(Object.fromEntries(next)));
    } catch {
      // Best-effort.
    }
  }, []);

  // --- derivations
  const threadById = useMemo(
    () => new Map(threadsState.threads.map((thread) => [thread.id, thread])),
    [threadsState.threads],
  );

  const correctionFor = useCallback(
    (threadId: string): Correction | null => {
      const correction = corrections.get(threadId);
      if (!correction) return null;
      const thread = threadById.get(threadId);
      if (!thread || thread.latestMessageId !== correction.latestMessageId) return null;
      if (!buckets.some((bucket) => bucket.id === correction.bucketId)) return null;
      return correction;
    },
    [buckets, corrections, threadById],
  );

  const effectiveBucketId = useCallback(
    (threadId: string): string | null => {
      const correction = correctionFor(threadId);
      if (correction) return correction.bucketId;
      const task = snapshot?.tasks.get(threadId);
      return task?.state === "classified" ? task.decision!.bucketId : null;
    },
    [correctionFor, snapshot],
  );

  const needsReview = useCallback(
    (threadId: string): boolean => {
      if (correctionFor(threadId)) return false;
      const task = snapshot?.tasks.get(threadId);
      return task?.state === "classified" ? task.decision!.needsReview : false;
    },
    [correctionFor, snapshot],
  );

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const bucket of buckets) result[bucket.id] = 0;
    for (const thread of threadsState.threads) {
      const bucketId = effectiveBucketId(thread.id);
      if (bucketId && bucketId in result) result[bucketId] += 1;
      if (bucketId !== "review" && needsReview(thread.id) && "review" in result) {
        result.review += 1;
      }
    }
    return result;
  }, [buckets, effectiveBucketId, needsReview, threadsState.threads]);

  const visibleThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return threadsState.threads
      .filter((thread) => {
        if (normalized) {
          const haystack = `${thread.sender} ${thread.subject} ${thread.preview}`.toLowerCase();
          if (!haystack.includes(normalized)) return false;
        }
        if (activeTab === "all") return true;
        const task = snapshot?.tasks.get(thread.id);
        if (activeTab === "unsorted") return task?.state === "failed";
        if (task?.state === "failed") return false;
        const bucketId = effectiveBucketId(thread.id);
        if (activeTab === "review") return bucketId === "review" || needsReview(thread.id);
        return bucketId === activeTab;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeTab, effectiveBucketId, needsReview, query, snapshot, threadsState.threads]);

  const { selectedId, setSelectedId, moveSelection } = useSelection(visibleThreads);
  const selectedThread = selectedId ? (threadById.get(selectedId) ?? null) : null;
  const failedCount = snapshot?.counts.failed ?? 0;

  const openThread = openThreadId ? (threadById.get(openThreadId) ?? null) : null;
  const detailState = useThreadDetail(openThread ? openThread.id : null, source);

  const openThreadAt = useCallback(
    (threadId: string) => {
      setSelectedId(threadId);
      setOpenThreadId(threadId);
      setPanel({ open: false, correcting: false });
    },
    [setSelectedId],
  );

  /** j/k inside the thread view steps through the visible list explicitly. */
  const navigateThread = useCallback(
    (direction: 1 | -1) => {
      if (!visibleThreads.length) return;
      const currentId = openThreadId ?? selectedId;
      const index = visibleThreads.findIndex((thread) => thread.id === currentId);
      const next =
        index < 0
          ? 0
          : (index + direction + visibleThreads.length) % visibleThreads.length;
      openThreadAt(visibleThreads[next].id);
    },
    [openThreadAt, openThreadId, selectedId, visibleThreads],
  );

  // --- completion toast (real numbers only)
  const lastRunRef = useRef<{ runId: string; announced: boolean }>({ runId: "", announced: true });
  useEffect(() => {
    if (!snapshot || snapshot.total === 0) return;
    if (snapshot.runId !== lastRunRef.current.runId) {
      lastRunRef.current = { runId: snapshot.runId, announced: false };
    }
    const terminal = snapshot.counts.classified + snapshot.counts.failed;
    if (!lastRunRef.current.announced && terminal === snapshot.total && !threadsState.loading) {
      lastRunRef.current.announced = true;
      const cost = snapshot.telemetry.costMicros;
      const parts = [
        `${snapshot.counts.classified} threads sorted`,
        snapshot.counts.failed ? `${snapshot.counts.failed} failed` : null,
        snapshot.counts.cached ? `${snapshot.counts.cached} from cache` : null,
        cost !== null ? formatCost(cost) : null,
      ].filter(Boolean);
      showToast(parts.join(" · "));
    }
  }, [showToast, snapshot, threadsState.loading]);

  // --- actions
  const undoLastCorrection = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    const next = new Map(corrections);
    if (entry.previous) next.set(entry.threadId, entry.previous);
    else next.delete(entry.threadId);
    persistCorrections(next);
    showToast("Correction undone");
  }, [corrections, persistCorrections, showToast]);

  const applyCorrection = useCallback(
    (threadId: string, bucketId: string) => {
      const thread = threadById.get(threadId);
      if (!thread) return;
      undoStack.current.push({ threadId, previous: corrections.get(threadId) ?? null });
      if (undoStack.current.length > 20) undoStack.current.shift();
      const next = new Map(corrections);
      next.set(threadId, {
        bucketId,
        latestMessageId: thread.latestMessageId,
        correctedAt: Date.now(),
      });
      persistCorrections(next);
      const bucket = buckets.find((candidate) => candidate.id === bucketId);
      showToast(`Moved to ${bucket?.name ?? bucketId}`, {
        label: "Undo",
        onAction: undoLastCorrection,
      });
    },
    [buckets, corrections, persistCorrections, showToast, threadById, undoLastCorrection],
  );

  const handleCreateBucket = useCallback(
    (name: string, description: string, example: string) => {
      const bucket = addBucket(name, description, example);
      setBucketModalOpen(false);
      setActiveTab(bucket.id);
      showToast(`"${bucket.name}" created · reclassifying ${threadsState.threads.length} threads`);
    },
    [addBucket, showToast, threadsState.threads.length],
  );

  const handleDisconnect = useCallback(() => {
    void fetch("/api/google/disconnect", { method: "POST" }).finally(() => {
      setStatus({ checked: true, connected: false, email: null });
      setSource(null);
      showToast("Google disconnected");
    });
  }, [showToast]);

  const voiceLearning =
    voice.state.progress !== null && voice.state.progress.stage !== "done";

  const closeVoiceModal = useCallback(() => {
    voice.acknowledge();
    setVoiceModal(null);
  }, [voice]);

  const closeTopmost = useCallback(() => {
    if (paletteOpen) setPaletteOpen(false);
    else if (helpOpen) setHelpOpen(false);
    else if (bucketModalOpen) setBucketModalOpen(false);
    else if (voiceModal) {
      // Only the running learn job pins its modal — progress must stay
      // visible; the profile sheet always closes.
      if (!(voiceLearning && voiceModal === "onboarding")) closeVoiceModal();
    } else if (panel.open) setPanel({ open: false, correcting: false });
    else if (openThreadId) setOpenThreadId(null);
    else if (query) setQuery("");
  }, [
    bucketModalOpen,
    closeVoiceModal,
    helpOpen,
    openThreadId,
    paletteOpen,
    panel.open,
    query,
    voiceLearning,
    voiceModal,
  ]);

  const tabOrder = useMemo(() => [...buckets.map((bucket) => bucket.id), "all"], [buckets]);

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      onNext: () => (openThreadId ? navigateThread(1) : moveSelection(1)),
      onPrevious: () => (openThreadId ? navigateThread(-1) : moveSelection(-1)),
      onOpen: () => selectedThread && openThreadAt(selectedThread.id),
      onEscape: closeTopmost,
      onSearch: () => searchRef.current?.focus(),
      onCorrect: () => selectedThread && setPanel({ open: true, correcting: true }),
      onWhy: () => selectedThread && setPanel({ open: true, correcting: false }),
      onUndo: undoLastCorrection,
      onTab: (index) => {
        if (tabOrder[index]) {
          setOpenThreadId(null);
          setActiveTab(tabOrder[index]);
        }
      },
      onPalette: () => setPaletteOpen((open) => !open),
      onHelp: () => setHelpOpen(true),
    }),
    [
      closeTopmost,
      moveSelection,
      navigateThread,
      openThreadAt,
      openThreadId,
      selectedThread,
      tabOrder,
      undoLastCorrection,
    ],
  );
  useShortcuts(shortcutHandlers);

  const commands = useMemo<Command[]>(
    () => [
      ...buckets.map((bucket, index) => ({
        id: `tab-${bucket.id}`,
        label: `Go to ${bucket.name}`,
        hint: index < 9 ? String(index + 1) : undefined,
        run: () => setActiveTab(bucket.id),
      })),
      { id: "tab-all", label: "Go to All", run: () => setActiveTab("all") },
      { id: "new-bucket", label: "Create a bucket", run: () => setBucketModalOpen(true) },
      ...(failedCount > 0
        ? [{ id: "retry", label: `Retry failed (${failedCount})`, run: () => retryFailed() }]
        : []),
      ...(selectedThread
        ? [
            {
              id: "open-thread",
              label: "Open selected thread",
              hint: "⏎",
              run: () => openThreadAt(selectedThread.id),
            },
            {
              id: "why",
              label: "Why this bucket",
              hint: "I",
              run: () => setPanel({ open: true, correcting: false }),
            },
            {
              id: "correct",
              label: "Correct selected thread",
              hint: "C",
              run: () => setPanel({ open: true, correcting: true }),
            },
          ]
        : []),
      ...(voice.state.stored
        ? [
            {
              id: "voice-profile",
              label: "Voice profile (measured)",
              run: () => setVoiceModal("sheet"),
            },
            ...(voice.state.stale
              ? [
                  {
                    id: "voice-rebuild",
                    label: "Rebuild voice profile (new sent mail since)",
                    run: () => setVoiceModal("onboarding"),
                  },
                ]
              : []),
          ]
        : [
            {
              id: "voice-learn",
              label: "Learn my voice (reply drafts)",
              run: () => setVoiceModal("onboarding"),
            },
          ]),
      {
        id: "theme",
        label: `Theme: switch to ${theme === "carbon" ? "Snow" : "Carbon"}`,
        run: () => setTheme(theme === "carbon" ? "snow" : "carbon"),
      },
      { id: "help", label: "Keyboard shortcuts", hint: "?", run: () => setHelpOpen(true) },
    ],
    [buckets, failedCount, openThreadAt, retryFailed, selectedThread, setTheme, theme, voice.state.stale, voice.state.stored],
  );

  // --- render
  if (!status.checked) {
    return <LoadingSplash status="Getting ready…" />;
  }

  if (!source) {
    return <ConnectScreen googleError={googleError} onExploreDemo={() => setSource("demo")} />;
  }

  if (threadsState.pagesLoaded === 0 && threadsState.loading && !threadsState.error) {
    return (
      <LoadingSplash
        status={
          source === "gmail" ? "Fetching your last 200 threads…" : "Loading the demo inbox…"
        }
      />
    );
  }

  const selectedTask = selectedThread ? snapshot?.tasks.get(selectedThread.id) : undefined;

  return (
    <div className={`app-shell ${panel.open && selectedThread ? "panel-open" : ""}`}>
      {!openThread && (
        <TopBar
          buckets={buckets}
          counts={counts}
          unsortedCount={failedCount}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onNewBucket={() => setBucketModalOpen(true)}
          query={query}
          onQueryChange={setQuery}
          searchRef={searchRef}
          onReclassify={() => retryFailed()}
          reclassifyDisabled={failedCount === 0}
          mode={source}
          email={threadsState.email ?? status.email}
          classifierConfigured={classifier.configured}
          theme={theme}
          onThemeChange={setTheme}
          onSwitchToDemo={() => setSource("demo")}
          onDisconnect={handleDisconnect}
          voiceLabel={voice.state.stored ? "Voice profile" : "Learn my voice"}
          voiceStale={voice.state.stale}
          onVoice={() => setVoiceModal(voice.state.stored ? "sheet" : "onboarding")}
        />
      )}

      <ProgressStrip
        snapshot={snapshot}
        expectedTotal={threadsState.threads.length}
        onPause={pause}
        onResume={resume}
      />

      {threadsState.error && (
        <div className="load-error" role="alert">
          {threadsState.error}
        </div>
      )}
      {!openThread && threadsState.skipped > 0 && (
        <div className="load-notice">
          {threadsState.skipped} thread{threadsState.skipped === 1 ? "" : "s"} could not be fetched
          from Gmail.
        </div>
      )}

      {openThread ? (
        <ThreadView
          key={openThread.id}
          thread={openThread}
          detailState={detailState}
          bucket={
            buckets.find((candidate) => candidate.id === effectiveBucketId(openThread.id)) ?? null
          }
          needsReview={needsReview(openThread.id)}
          voiceStored={voice.state.stored}
          sessionEmail={threadsState.email ?? status.email}
          onOpenWhy={() => setPanel({ open: true, correcting: false })}
          onClose={() => setOpenThreadId(null)}
          onNavigate={navigateThread}
        />
      ) : (
        <main className="list-region" aria-label="Threads">
          <ThreadList
            threads={visibleThreads}
            snapshot={snapshot}
            buckets={buckets}
            effectiveBucketId={effectiveBucketId}
            needsReview={needsReview}
            isCorrected={(threadId) => correctionFor(threadId) !== null}
            activeTab={activeTab}
            loading={threadsState.loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpenThread={openThreadAt}
            onWhy={(correcting) => setPanel({ open: true, correcting })}
            onRetryFailed={() => retryFailed()}
          />
        </main>
      )}

      {panel.open && selectedThread && (
        <DecisionPanel
          key={`${selectedThread.id}:${panel.correcting}`}
          thread={selectedThread}
          task={selectedTask}
          buckets={buckets}
          correctedBucketId={correctionFor(selectedThread.id)?.bucketId ?? null}
          startCorrecting={panel.correcting}
          onCorrect={(bucketId) => applyCorrection(selectedThread.id, bucketId)}
          onRetry={() => retryFailed([selectedThread.id])}
          onClose={() => setPanel({ open: false, correcting: false })}
        />
      )}

      {bucketModalOpen && (
        <BucketModal
          threadCount={threadsState.threads.length}
          onCreate={handleCreateBucket}
          onClose={() => setBucketModalOpen(false)}
        />
      )}

      {voiceModal === "onboarding" && source && (
        <VoiceOnboarding
          mode={source}
          llmConfigured={classifier.configured}
          state={voice.state}
          onStart={voice.start}
          onResume={voice.resumeLearn}
          onClose={closeVoiceModal}
          onViewProfile={() => {
            voice.acknowledge();
            setVoiceModal("sheet");
          }}
        />
      )}

      {voiceModal === "sheet" && voice.state.stored && (
        <VoiceProfileSheet
          stored={voice.state.stored}
          stale={voice.state.stale}
          onRebuild={() => setVoiceModal("onboarding")}
          onClear={() => {
            voice.clear();
            setVoiceModal(null);
            showToast("Voice profile deleted from this browser");
          }}
          onClose={() => setVoiceModal(null)}
          onEdit={voice.applyEdit}
        />
      )}

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}

      {helpOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setHelpOpen(false)}>
          <div
            className="modal help-modal"
            role="dialog"
            aria-label="Keyboard shortcuts"
            ref={helpRef}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Keyboard shortcuts</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setHelpOpen(false)}
              >
                ×
              </button>
            </header>
            <dl className="shortcut-grid">
              {SHORTCUTS.map(([keys, label]) => (
                <div key={keys}>
                  <dt>{label}</dt>
                  <dd>
                    <kbd>{keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      <HintBar
        context={openThread ? "thread" : "list"}
        canDraft={Boolean(voice.state.stored) && !voice.state.stored?.meta.heuristicOnly}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
