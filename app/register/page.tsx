"use client";

// Step 1: email/password/username → Firebase Auth account
// Step 2: selfie capture → POST /api/register-face (Rekognition + Firestore)
// Step 3 (TODO): Google OAuth connection

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { useAuth } from "@/components/AuthProvider";
import WebcamCapture from "@/components/WebcamCapture";

const USERNAME_RE = /^[a-z0-9_]{2,32}$/;

type Step = "form" | "selfie";

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [step, setStep] = useState<Step>("form");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user && step === "form") router.replace("/dashboard");
  }, [user, loading, router, step]);

  async function handleCreateAccount() {
    setError(null);
    if (!USERNAME_RE.test(username)) {
      setError("Username must be 2–32 chars: lowercase letters, numbers, or underscores.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      setUid(cred.user.uid);
      setStep("selfie");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "unknown";
      setError(friendlyAuthError(code));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterFace() {
    if (!capturedBlob || !uid) return;
    setError(null);
    setSubmitting(true);

    const body = new FormData();
    body.append("image", capturedBlob, "selfie.jpg");
    body.append("username", username);
    body.append("uid", uid);

    try {
      const res = await fetch("/api/register-face", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600";

  if (step === "selfie") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 bg-[#080808]">
        <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Take a selfie</h1>
            <p className="text-sm text-zinc-500">
              The mirror uses this photo to recognize you. Face the camera straight on in good lighting.
            </p>
          </div>

          <WebcamCapture onCapture={(blob) => setCapturedBlob(blob)} />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleRegisterFace}
            disabled={!capturedBlob || submitting}
            className="w-full rounded-lg bg-white py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submitting ? "Registering…" : "Complete registration"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-[#080808]">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Create account</h1>
          <p className="text-sm text-zinc-500">Step 1 of 2 — account details.</p>
        </div>

        <div className="space-y-3">
          <div>
            <input
              type="text"
              placeholder="Mirror username (e.g. john_doe)"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className={inputClass}
              autoComplete="off"
            />
            <p className="mt-1.5 text-xs text-zinc-600">
              How the mirror identifies you. Lowercase letters, numbers, underscores.
            </p>
          </div>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={handleCreateAccount}
          disabled={submitting || !email || !password || !confirmPassword || !username}
          className="w-full rounded-lg bg-white py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting ? "Creating account…" : "Next: take a selfie →"}
        </button>

        <p className="text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="text-zinc-300 hover:text-white transition">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function friendlyAuthError(code: string): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with that email already exists.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    default:
      return "Something went wrong. Try again.";
  }
}
