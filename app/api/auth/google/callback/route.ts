import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // uid passed through from /api/auth/google
  const error = searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(`${origin}/dashboard?google=cancelled`);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!tokenRes.ok) {
    console.error("Google token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(`${origin}/dashboard?google=error`);
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type: string;
    scope: string;
  };

  const uid = state;

  try {
    // Preserve existing refresh_token if Google didn't return a new one
    // (only happens on re-auth without prompt:consent, but kept for safety)
    const existing = await adminDb.doc(`googleTokens/${uid}`).get();
    const existingRefreshToken = existing.exists ? (existing.data()?.refresh_token ?? null) : null;

    const batch = adminDb.batch();
    batch.set(adminDb.doc(`googleTokens/${uid}`), {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? existingRefreshToken,
      token_type: tokens.token_type,
      expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
      scope: tokens.scope,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(adminDb.doc(`users/${uid}`), { googleConnected: true }, { merge: true });
    await batch.commit();
  } catch (err) {
    console.error("Firestore write error:", err);
    return NextResponse.redirect(`${origin}/dashboard?google=error`);
  }

  return NextResponse.redirect(`${origin}/dashboard?google=success`);
}
