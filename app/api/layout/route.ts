import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const VALID_WIDGETS = new Set([
  "clock_date", "weather", "calendar", "ticker", "clothing", "stats", "todo", "",
]);
const POSITIONS = [
  "top_left", "top_right", "mid_left", "mid_right", "bottom_left", "bottom_right",
] as const;

async function resolve(request: NextRequest): Promise<{ username: string } | null> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.doc(`users/${decoded.uid}`).get();
    if (!snap.exists) return null;
    const username = snap.data()!.username as string;
    return { username };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const identity = await resolve(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminDb.doc(`ai_profiles/${identity.username}`).get();
  const layout = snap.exists ? (snap.data()?.layout ?? null) : null;
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

  const layout = raw as Record<string, unknown>;
  const cleaned: Record<string, string> = {};
  for (const pos of POSITIONS) {
    const val = (layout[pos] as string | undefined) ?? "";
    if (!VALID_WIDGETS.has(val)) {
      return NextResponse.json({ error: `Invalid widget for ${pos}: "${val}"` }, { status: 400 });
    }
    cleaned[pos] = val;
  }

  await adminDb.doc(`ai_profiles/${identity.username}`).set({ layout: cleaned }, { merge: true });
  return NextResponse.json({ ok: true });
}
