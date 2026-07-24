"use client";

import { useCallback, useEffect, useState } from "react";
import { computeTaxonomyVersion, DEFAULT_BUCKETS, toTaxonomy, type Bucket } from "../../lib/taxonomy";

const STORAGE_KEY = "tenex.taxonomy.v1";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const TONE_CYCLE: Bucket["tone"][] = ["blue", "green", "violet", "amber", "neutral"];

/**
 * Bucket list + content-derived taxonomy version. Custom buckets persist in
 * localStorage; the version is null until first computed (classification
 * waits for it).
 */
function readStoredBuckets(): Bucket[] {
  if (typeof window === "undefined") return DEFAULT_BUCKETS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Bucket[];
      if (Array.isArray(parsed) && parsed.every((bucket) => bucket?.id && bucket?.name)) {
        return parsed;
      }
    }
  } catch {
    // Corrupted storage — fall back to defaults.
  }
  return DEFAULT_BUCKETS;
}

export function useTaxonomy() {
  const [buckets, setBuckets] = useState<Bucket[]>(readStoredBuckets);
  const [taxonomyVersion, setTaxonomyVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void computeTaxonomyVersion(toTaxonomy(buckets)).then((version) => {
      if (!cancelled) setTaxonomyVersion(version);
    });
    return () => {
      cancelled = true;
    };
  }, [buckets]);

  const persist = useCallback((next: Bucket[]) => {
    setBuckets(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort persistence.
    }
  }, []);

  const addBucket = useCallback(
    (name: string, description: string, example?: string) => {
      const base = slugify(name) || "bucket";
      let id = base;
      let suffix = 2;
      while (buckets.some((bucket) => bucket.id === id)) id = `${base}-${suffix++}`;
      const fullDescription = example?.trim()
        ? `${description.trim()} Example: "${example.trim()}"`
        : description.trim();
      const tone = TONE_CYCLE[buckets.filter((bucket) => bucket.custom).length % TONE_CYCLE.length];
      const bucket: Bucket = { id, name: name.trim(), description: fullDescription, tone, custom: true };
      persist([...buckets, bucket]);
      return bucket;
    },
    [buckets, persist],
  );

  const removeBucket = useCallback(
    (id: string) => {
      const target = buckets.find((bucket) => bucket.id === id);
      if (!target?.custom) return;
      persist(buckets.filter((bucket) => bucket.id !== id));
    },
    [buckets, persist],
  );

  return { buckets, taxonomyVersion, addBucket, removeBucket };
}
