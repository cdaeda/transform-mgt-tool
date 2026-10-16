"use client";

import { useEffect, useSyncExternalStore } from "react";

// One shared, browser-cached copy of /api/dashboard for the certificate and the dashboard.
// Shows the last known numbers instantly, refreshes in the background (stale-while-revalidate).
const KEY = "transform.overview.v1";
type Entry = { data: Record<string, unknown> & { error?: string }; at: number; refreshing: boolean; error?: string };

let entry: Entry | null = null;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function fromStorage() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) entry = { ...(JSON.parse(raw) as Entry), refreshing: false };
  } catch {
    /* private mode / blocked storage: just fetch */
  }
}

let inflight: Promise<void> | null = null;
export function refreshOverview() {
  fromStorage();
  if (inflight) return inflight;
  entry = entry ? { ...entry, refreshing: true } : null;
  emit();
  inflight = fetch("/api/dashboard")
    .then((r) => r.json())
    .then((data) => {
      if (data.error) entry = entry ? { ...entry, refreshing: false, error: data.error } : { data, at: Date.now(), refreshing: false, error: data.error };
      else {
        entry = { data, at: Date.now(), refreshing: false };
        try {
          localStorage.setItem(KEY, JSON.stringify(entry));
        } catch {
          /* storage full or blocked: keep it in memory */
        }
      }
    })
    .catch((e) => {
      entry = entry ? { ...entry, refreshing: false, error: String(e) } : null;
    })
    .finally(() => {
      inflight = null;
      emit();
    });
  return inflight;
}

const subscribe = (cb: () => void) => (subs.add(cb), () => void subs.delete(cb));
const snapshot = () => (fromStorage(), entry);

// `version` bumps (bookings, edits, syncs) trigger a background refresh.
export function useOverview<T>(version: number) {
  const e = useSyncExternalStore(subscribe, snapshot, () => null);
  useEffect(() => {
    refreshOverview();
  }, [version]);
  return e as (Omit<Entry, "data"> & { data: T }) | null;
}
