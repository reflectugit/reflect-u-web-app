"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase-client";
import { useAuth } from "@/components/AuthProvider";
import LayoutEditor from "@/components/LayoutEditor";

type UserDoc = { username: string; googleConnected: boolean };

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [docLoading, setDocLoading] = useState(true);
  // Read ?google= query param client-side to avoid Suspense requirement
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);

  useEffect(() => {
    setGoogleStatus(new URLSearchParams(window.location.search).get("google"));
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setUserDoc(snap.data() as UserDoc);
      setDocLoading(false);
    });
  }, [user]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
          <button
            onClick={() => signOut(auth)}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-white"
          >
            Sign out
          </button>
        </header>

        {googleStatus === "success" && (
          <div className="mb-4 rounded-lg border border-green-800 bg-green-950 px-4 py-3 text-sm text-green-300">
            Google Calendar connected successfully.
          </div>
        )}
        {googleStatus === "error" && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
            Failed to connect Google Calendar. Try again.
          </div>
        )}
        {googleStatus === "cancelled" && (
          <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
            Google connection cancelled.
          </div>
        )}

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            <p className="text-zinc-300">
              Signed in as <span className="font-mono text-white">{user.email}</span>
            </p>
            {!docLoading && userDoc && (
              <p className="mt-1 text-sm text-zinc-500">
                Mirror username:{" "}
                <span className="font-mono text-zinc-300">{userDoc.username}</span>
              </p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="mb-3 text-sm font-medium text-zinc-400">Mirror Layout</h2>
            {docLoading ? (
              <p className="text-sm text-zinc-600">Loading…</p>
            ) : (
              <LayoutEditor />
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="mb-3 text-sm font-medium text-zinc-400">Google Calendar</h2>
            {docLoading ? (
              <p className="text-sm text-zinc-600">Loading…</p>
            ) : userDoc?.googleConnected ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-green-400">Connected</span>
                <a
                  href={`/api/auth/google?uid=${user.uid}`}
                  className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300 transition"
                >
                  Reconnect
                </a>
              </div>
            ) : (
              <a
                href={`/api/auth/google?uid=${user.uid}`}
                className="inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                Connect Google Calendar
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
