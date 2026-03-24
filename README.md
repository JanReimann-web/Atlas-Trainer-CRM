# Atlas Trainer CRM

Responsive AI-assisted CRM for a high-touch personal trainer workflow:

- lead pipeline and client conversion
- prepaid package tracking with remaining sessions
- calendar and reminder visibility
- body assessment history
- workout plans plus live `planned vs actual` execution
- AI recap and next-session draft generation
- communication timeline and finance overview
- English default locale with Estonian translations

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.example` to `.env.local` when you are ready to connect real services.

The current implementation now supports:

- Firebase Auth sign-in and Firestore-backed CRM persistence
- Firebase Storage initialization for future file uploads
- OpenAI routes server-side with live model calls plus deterministic fallback draft builders
- Microsoft Graph readiness visible in settings, without live sync yet

Required variables:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_WORKSPACE_ID=primary

OPENAI_API_KEY=
OPENAI_MODEL=
```

## Firebase notes

- Enable `Email/Password` in Firebase Authentication.
- Create a Firestore database before signing in.
- The app seeds the shared workspace automatically on first login if Firestore is empty.
- If your Firestore rules are no longer in test mode, allow authenticated users to read and write the workspace data used by the app.

## Main routes

- `/` dashboard
- `/leads`
- `/clients`
- `/clients/[clientId]`
- `/clients/[clientId]/sessions/[sessionId]`
- `/calendar`
- `/plans`
- `/communications`
- `/finance`
- `/settings`
- `/activity`

## Notes

- The workout execution screen is the core flow. It opens from a client profile with a prefilled planned workout and lets the coach record actual performance live.
- AI never auto-sends. Drafts remain editable and are only logged to the communication timeline after coach approval.
- OpenAI failures fall back to deterministic drafts so the workflow still works during outages or model errors.
- Microsoft Graph email/calendar sync is still scaffolded for a later phase and is not required for the current Firebase/OpenAI setup.
