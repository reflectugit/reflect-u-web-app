"use client";

import { useState, useEffect, useCallback } from "react";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

type Layout = {
  top_left: string;
  top_right: string;
  mid_left: string;
  mid_right: string;
  bottom_left: string;
  bottom_right: string;
};

const DEFAULT_LAYOUT: Layout = {
  top_left: "clock_date",
  top_right: "weather",
  mid_left: "calendar",
  mid_right: "todo",
  bottom_left: "ticker",
  bottom_right: "",
};

const WIDGETS = [
  { value: "", label: "Empty" },
  { value: "clock_date", label: "Clock & Date" },
  { value: "weather", label: "Weather" },
  { value: "calendar", label: "Calendar" },
  { value: "ticker", label: "Ticker" },
  { value: "clothing", label: "Clothing" },
  { value: "stats", label: "Stats" },
  { value: "todo", label: "To-Do" },
];

const POSITIONS: { key: keyof Layout; label: string }[] = [
  { key: "top_left",    label: "Top Left" },
  { key: "top_right",   label: "Top Right" },
  { key: "mid_left",    label: "Middle Left" },
  { key: "mid_right",   label: "Middle Right" },
  { key: "bottom_left", label: "Bottom Left" },
  { key: "bottom_right",label: "Bottom Right" },
];

type Status = "loading" | "idle" | "saving" | "saved" | "error";

export default function LayoutEditor() {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken(auth.currentUser!);
        const res = await fetch("/api/layout", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json() as { layout: Layout | null };
        if (data.layout) setLayout(data.layout);
      } catch {
        // keep DEFAULT_LAYOUT on error
      } finally {
        setStatus("idle");
      }
    })();
  }, []);

  const save = useCallback(async () => {
    setStatus("saving");
    try {
      const token = await getIdToken(auth.currentUser!);
      const res = await fetch("/api/layout", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ layout }),
      });
      if (res.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [layout]);

  const busy = status === "loading" || status === "saving";

  const selectClass =
    "w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white outline-none focus:border-zinc-500 transition disabled:opacity-50";

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Assign a widget to each zone. Changes take effect next time the mirror wakes.
      </p>

      {/* 2-column grid mirroring the physical layout */}
      <div className="grid grid-cols-2 gap-2">
        {POSITIONS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-1.5">
            <p className="text-xs text-zinc-500">{label}</p>
            <select
              value={layout[key]}
              onChange={(e) => setLayout((prev) => ({ ...prev, [key]: e.target.value }))}
              className={selectClass}
              disabled={busy}
            >
              {WIDGETS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="w-full rounded-lg bg-white py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved!" : "Save layout"}
      </button>

      {status === "error" && (
        <p className="text-sm text-red-400">Failed to save. Try again.</p>
      )}
    </div>
  );
}
