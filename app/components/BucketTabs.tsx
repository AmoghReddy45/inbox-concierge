"use client";

import { Plus } from "lucide-react";
import type { Bucket } from "../../lib/taxonomy";

export type TabId = string; // bucket id | "all" | "unsorted"

type Props = {
  buckets: Bucket[];
  counts: Record<string, number>;
  unsortedCount: number;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  onNewBucket: () => void;
};

export function BucketTabs({
  buckets,
  counts,
  unsortedCount,
  activeTab,
  onSelectTab,
  onNewBucket,
}: Props) {
  return (
    <nav className="bucket-tabs" aria-label="Buckets">
      {buckets.map((bucket) => (
        <button
          key={bucket.id}
          type="button"
          className={`tab ${activeTab === bucket.id ? "is-active" : ""} ${bucket.id === "review" ? "tab-review" : ""}`}
          aria-current={activeTab === bucket.id ? "page" : undefined}
          title={bucket.description}
          onClick={() => onSelectTab(bucket.id)}
        >
          {bucket.name}
          <span className="tab-count">{counts[bucket.id] ?? 0}</span>
        </button>
      ))}
      {unsortedCount > 0 && (
        <button
          type="button"
          className={`tab tab-unsorted ${activeTab === "unsorted" ? "is-active" : ""}`}
          onClick={() => onSelectTab("unsorted")}
        >
          Unsorted
          <span className="tab-count">{unsortedCount}</span>
        </button>
      )}
      <button
        type="button"
        className={`tab ${activeTab === "all" ? "is-active" : ""}`}
        onClick={() => onSelectTab("all")}
      >
        All
      </button>
      <button type="button" className="tab tab-add" aria-label="New bucket" onClick={onNewBucket}>
        <Plus size={13} aria-hidden="true" />
      </button>
    </nav>
  );
}
