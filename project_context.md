# Smart Mirror Webapp — Project Context

## Overview
Companion webapp for the Smart Mirror project (see the mirror's own `project_context.md` for hardware/Pi-side details). Two jobs:
1. **Registration** — user creates an account, uploads a selfie that gets indexed into AWS Rekognition under their chosen username, and connects their Google account so the mirror can read their Calendar and Tasks.
2. **Dashboard editor** — drag-and-drop UI for assigning widgets to the 6 mirror regions; saves to Firestore; mirror reads the profile on face match.

Built solo, first webapp project. Local-first development; deployment to Vercel comes later.

## Stack
- **Framework:** Next.js 15 (App Router) + React 19, TypeScript
- **Styling:** Tailwind CSS
- **Auth (webapp):** Firebase Auth — email/password
- **Database:** Firestore
- **Server-side Firestore writes:** Firebase Admin SDK (service account credentials in `.env.local`)
- **Face indexing:** AWS Rekognition `IndexFaces` (Step 2, not yet implemented)
- **Google OAuth:** Google's web application OAuth flow → tokens stored in Firestore (Step 3, not yet implemented)
- **Drag-and-drop:** `dnd-kit` (Step 4, not yet implemented)
- **Hosting:** Vercel (later — currently local-only via `npm run dev`)

## Architecture decisions
- **Single Next.js codebase** for frontend + backend. API routes (`app/api/*/route.ts`) handle anything requiring secrets (AWS, Google client secret, admin Firestore). Browser code never touches secrets.
- **Two Firebase SDKs, two import paths:**
  - `@/lib/firebase-client` — browser, used by `"use client"` components for auth state and reads of the user's own profile
  - `@/lib/firebase-admin` — server only, used in API routes for writes to `googleTokens`, `usernames`, etc. Never import from a client component (would leak the private key into the browser bundle).
- **Firestore tokens decision:** Google OAuth tokens live in Firestore, not on the Pi. Original plan (per mirror's `project_context.md` Step 4) kept tokens on the Pi, but moving the OAuth flow to the webapp made Firestore-side storage strictly simpler. Pi reads tokens via Admin SDK with a service account.
- **Username = Rekognition ExternalImageId.** Enforced unique at registration via a Firestore transaction on `usernames/{username}`. Lowercase alphanumeric + underscore, 2–32 chars.
- **Auth context pattern:** `components/AuthProvider.tsx` wraps the whole app, exposes `useAuth() → { user, loading }` — no prop drilling. Pages do their own route guards via `useEffect` redirects.

## Firestore data model
```
users/{userId}              # Firebase Auth UID
  ├── username              # matches Rekognition ExternalImageId
  ├── email
  ├── faceIndexed: bool
  └── googleConnected: bool

profiles/{userId}
  ├── layout: { top_left, top_right, mid_left, mid_right, bottom_left, bottom_right }
  │           # values are widget name string OR array (for stacked widgets), matching layout.json schema
  └── updatedAt

usernames/{username}        # uniqueness reservations
  └── userId

googleTokens/{userId}       # admin-only, never client-readable
  ├── accessToken
  ├── refreshToken
  ├── expiresAt
  └── scopes
```

## Firestore security rules (`firestore.rules`)
- `users/{uid}` and `profiles/{uid}` — user can read/write only their own
- `usernames/{name}` — anyone can read (for uniqueness checks), no client writes (Admin SDK only)
- `googleTokens/{uid}` — fully locked, Admin SDK only

## Project layout
```
smart-mirror-web/
├── app/
│   ├── layout.tsx                  # Wraps everything in AuthProvider
│   ├── page.tsx                    # Landing — redirects based on auth state
│   ├── login/page.tsx              # Email/password sign-in
│   ├── register/page.tsx           # Email/password + username (selfie/Google added in Steps 2/3)
│   ├── dashboard/page.tsx          # Placeholder — layout editor goes here in Step 4
│   └── api/                        # (Step 2+) — register-face, google/auth, google/callback, profile
├── components/
│   └── AuthProvider.tsx            # Firebase Auth context, useAuth() hook
├── lib/
│   ├── firebase-client.ts          # Browser SDK
│   └── firebase-admin.ts           # Admin SDK (server-only)
├── firestore.rules                 # Deploy via Firebase Console or `firebase deploy`
├── .env.local                      # Secrets, gitignored
└── (standard Next.js scaffold)
```

## Environment variables (`.env.local`)
```
# Firebase client (browser-safe, NEXT_PUBLIC_ prefix exposes them)
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# Firebase Admin (server-only, never expose)
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY      # quoted, literal \n preserved — converted at runtime

# Step 2 — AWS
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, REKOGNITION_COLLECTION_ID

# Step 3 — Google OAuth
# GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI
```

## Build steps & status

### ✅ Step 1 — Scaffold + Firebase Auth (complete)
- `create-next-app` with TS, Tailwind, App Router, Turbopack, no React Compiler, no `src/`
- Firebase project created, Email/Password provider enabled, Firestore in production mode
- Service account JSON downloaded for Admin SDK
- Auth context, login page, register page (account creation only), dashboard placeholder all working
- Route guards via `useEffect` redirects on `/login`, `/register`, `/dashboard`

### Step 2 — Selfie capture + Rekognition IndexFaces (next)
- Webcam capture component (`getUserMedia` API → canvas → JPEG blob)
- `app/api/register-face/route.ts` — POST receives image + username + uid, calls `IndexFaces` with `ExternalImageId=username`, writes `users/{uid}` doc, reserves `usernames/{name}` in a transaction
- AWS IAM user scoped to `rekognition:IndexFaces` + `rekognition:DeleteFaces` only (separate from Pi credentials)
- Retake flow + surface Rekognition `FaceModelVersion` / quality warnings on bad input
- Privacy: image deleted server-side immediately after IndexFaces returns

### Step 3 — Google OAuth (web flow) → Firestore
- New OAuth client in Google Cloud Console, type **Web application**, redirect URI `http://localhost:3000/api/google/callback` (separate from Pi's existing Desktop client)
- Scopes: `calendar.readonly`, `tasks.readonly` (must match `auth_google.py` SCOPES list exactly)
- `app/api/google/auth/route.ts` builds consent URL with `state=<userId>` + `access_type=offline` + `prompt=consent` (force refresh token)
- `app/api/google/callback/route.ts` exchanges code, writes `googleTokens/{uid}` via Admin SDK, sets `users/{uid}.googleConnected=true`
- "Connect Google Calendar" button on `/dashboard` (or end-of-registration flow)

### Step 4 — Layout editor
- `dnd-kit` for drag-and-drop (works with React 19; React Compiler disabled to avoid edge cases)
- Widget palette listing all `_WIDGET_REGISTRY` names from the mirror (kept in sync manually for now — consider a shared schema later)
- 6-region grid mirroring portrait orientation; each region accepts a single widget or a vertical stack
- Save writes `profiles/{uid}` doc; mirror's Step 5 work picks up changes via Firestore listener

### Step 5 — Pi-side integration (mirror project)
- Replace `auth_google.py` local-token flow with Firestore read at face-match time
- `CalendarWidget.set_user()` and `TodoWidget.set_user()` load tokens from Firestore via Admin SDK
- `SmartMirror._rebuild_dashboard()` reads layout from `profiles/{uid}` instead of `profiles/<name>.json`
- Firestore `onSnapshot` listener for hot-reload when webapp saves a new profile
- Cache last-known-good profile + tokens locally for offline fallback

## Key implementation notes
- **Firebase config in browser is not a secret** — `apiKey` etc. are public identifiers; security comes from Firestore rules + Auth, not from hiding the key. Don't waste time obscuring `NEXT_PUBLIC_*` values.
- **Service account private key** — paste from JSON wrapped in double quotes, keep `\n` as the literal two-character escape sequence; `firebase-admin.ts` does `.replace(/\\n/g, "\n")` at startup.
- **Username sync with Rekognition** — the `username` field in Firestore must match the `ExternalImageId` Rekognition stores. Validation regex `^[a-z0-9_]{2,32}$` is intentionally narrower than Rekognition's allowed character set (`[A-Za-z0-9_.\-:]`) to avoid case-sensitivity bugs and special-character ambiguity.
- **Token refresh** — Google access tokens expire after ~1h. Plan: Pi refreshes using stored refresh token, writes new access token back to Firestore. The `google-auth` Python library does this automatically when creds are loaded from JSON. Webapp doesn't refresh.
- **Two OAuth clients in same Google Cloud project** — one Desktop (existing, `auth_google.py`), one Web (new, this webapp). Both work simultaneously against the same scopes.
- **Don't import `firebase-admin` from a client component.** TypeScript won't catch it; you'll get a runtime error or worse, a leaked credential. The convention in this repo: anything in `lib/firebase-admin.ts` is only imported from `app/api/*` route handlers.
- **`useEffect` redirect pattern** — pages check `loading` first, then `user`, then `router.replace()`. Don't redirect during SSR — App Router pages are RSC by default; pages with auth-dependent rendering are marked `"use client"`.
- **Firestore rules deploy** — Console paste-and-publish for now. Switch to `firebase deploy --only firestore:rules` once the Firebase CLI is set up.
- **Vercel deploy** (Step 6, eventually) — push repo to GitHub, import in Vercel, paste env vars in Vercel project settings, update Google OAuth redirect URI to production domain.

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server on http://localhost:3000 (Turbopack) |
| `npm run build` | Production build — run before any deploy to catch type errors |
| `npm run lint` | ESLint check |

## Open questions / decisions deferred
- **Hot-reload in PyQt5** when Firestore profile changes — full layout teardown via `_rebuild_dashboard()` is already proven from Step 3b; should work for live updates too. Confirm during Step 5.
- **Guest mode** for unrecognized faces — defer to Step 6 of the mirror project.
- **Widget registry sync** — webapp needs to know what widgets exist on the mirror. For now, hardcoded list; later, consider a shared `widgets.json` committed to both repos or a Firestore-served catalog.
- **Multiple mirrors per user** — out of scope for v1; current data model assumes one user → one profile.
