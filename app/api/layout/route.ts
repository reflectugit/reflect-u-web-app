import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const VALID_WIDGETS = new Set([
  "clock_date", "weather", "calendar", "ticker", "clothing", "stats", "todo",
]);
const POSITIONS = [
  "top_left", "top_right", "mid_left", "mid_right", "bottom_left", "bottom_right",
] as const;

// Normalize a zone value from Firestore: string | string[] → string[]
function normalizeZone(val: unknown): string[] {
  if (typeof val === "string") return val ? [val] : [];
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string" && v !== "");
  return [];
}

// Validate and clean a zone value from the request body.
// Returns a normalized string[] (empty strings already removed), or null if invalid.
function validateZone(val: unknown): string[] | null {
  const items: unknown[] = typeof val === "string" ? (val ? [val] : [])
    : Array.isArray(val) ? val
    : null!;
  if (!items) return null;
  const filtered = items.filter((v): v is string => typeof v === "string" && v !== "");
  if (filtered.some((v) => !VALID_WIDGETS.has(v))) return null;
  return filtered;
}

async function resolve(request: NextRequest): Promise<{ username: string } | null> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.doc(`users/${decoded.uid}`).get();
    if (!snap.exists) return null;
    return { username: snap.data()!.username as string };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const identity = await resolve(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminDb.doc(`ai_profiles/${identity.username}`).get();
  if (!snap.exists || !snap.data()?.layout) {
    return NextResponse.json({ layout: null });
  }

  const raw = snap.data()!.layout as Record<string, unknown>;
  const layout: Record<string, string[]> = {};
  for (const pos of POSITIONS) {
    layout[pos] = normalizeZone(raw[pos]);
  }
  return NextResponse.json({ layout });
}

export async function PUT(request: NextRequest) {
  const identity = await resolve(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { layout?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.layout;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "layout must be an object" }, { status: 400 });
  }

  const input = raw as Record<string, unknown>;
  const cleaned: Record<string, string[]> = {};
  for (const pos of POSITIONS) {
    const result = validateZone(input[pos] ?? []);
    if (result === null) {
      return NextResponse.json({ error: `Invalid widget value for ${pos}` }, { status: 400 });
    }
    cleaned[pos] = result;
  }

  await adminDb.doc(`ai_profiles/${identity.username}`).set({ layout: cleaned }, { merge: true });
  return NextResponse.json({ ok: true });
}
