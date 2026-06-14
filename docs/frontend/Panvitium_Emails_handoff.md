# Emails — two-pane mail client (Claude Design integration handoff)

Source design: `Panvitium_Emails.dc.html` (decoded from the Claude Design bundle `Panvitium_Emails.html`,
same gzip+base64 `__bundler/*` format as the Suasio/Maleficia/Aether bundles — manifest = dc-runtime +
woff2 fonts; the design lives in the `__bundler/template` script). Styling is **inline** (the bundle's
`design.css` is empty), as with the Maleficia rework.

## What the design is

An Ubuntu-style **light** desktop mail client (deliberately light inside the dark game — it is the
character's actual terminal program), three regions:

1. **Folder rail (190px)** — orange _Compose_, a _Folders_ header, then _Inbox_ (with an unread badge)
   / _Starred_ / _Sent_ / _Drafts_ / _Junk_. Everything here is **decorative** except the Inbox badge.
2. **Inbox list (362px)** — header (`Inbox` + a decorative search affordance), then rows: unread blue
   dot · sender (bold while unread) · short timestamp · answered `↩` marker · subject · snippet.
3. **Reading pane (flex)** — toolbar (_Reply_, decorative _Forward_/_Archive_, red _Delete_), subject,
   an avatar/sender/address/date header, then one of: a reply hint, the **reply chooser**, or the
   **answered** block, followed by the body.

The design's own window chrome (`‹ Files / Emails / ×`) is dropped on integration: `PcWindow` already
supplies exactly that titlebar. Emails is registered as a `FULLBLEED` program, so the light client is
rendered edge-to-edge in the dark desk surface (no titled card / `h3`), which mirrors the design's own
dark-radial backdrop framing a floating light window.

## What was built (the full persisted mechanic)

Per the scope call: the **whole machinery** for persistent replies + delete, **with the economy
effects left as an empty, documented hook** to be authored in a later iteration.

- **State** (`packages/sim/src/state.ts`): `ReceivedEmail` gains `answeredReply?: number | null` and
  `deleted?: boolean` — additive-optional (ADR-023).
- **Sim** (`packages/sim/src/emails.ts`):
  - `answerEmail(state, id, replyIdx, now)` — records the chosen reply, reads the message, then calls
    the effect hook. Idempotent / overwritable; no-op (same ref) for an unknown or deleted id.
  - `deleteEmail(state, id)` — sets `deleted: true`. A **flag, not a removal**: `deliverEmails` dedups
    by inbox id, so dropping the entry would let the email re-trigger.
  - `applyEmailReplyEffect(state, id, replyIdx)` — **the empty hook**. A pure pass-through today;
    fill it in (switch on `id`, then `replyIdx`) to give replies real economic weight.
  - `unreadCount` now skips deleted mail.
- **Save** (`packages/shared/src/save/state-schema.ts`): `inboxEntrySchema` + encode + decode carry the
  two fields via conditional spread (omitted at default, so saves stay lean and old saves load clean).
- **Store** (`apps/web/src/store/gameStore.ts`): `answerEmail(id, replyIdx)` and `deleteEmail(id)`,
  mirroring `markEmailRead` (debounced autosave).
- **UI** (`apps/web/src/ui/Emails.tsx`): the three-pane client, wired to the real
  `state.lifetime.inbox` + `strings.emails.catalog`. Read / answered / deleted persist in game state;
  only the current selection and whether the chooser is open are local. Avatars (initials + a stable
  hashed colour), the list snippet, and the timestamps are **derived** here — the catalog has no such
  fields.
- **Strings** (`packages/shared/src/strings.ts`): mail-client chrome labels added to `strings.emails`.

## What is intentionally left hanging (your later iterations)

- **Reply content.** The catalog entries (`strings.emails.catalog`) are unchanged — none define
  `replies` yet, so the five existing emails render as plain, unanswerable messages (Reply disabled,
  no hint/chooser). The consuming type already allows it:

  ```ts
  catalog: {
    welcome: {
      from: 'The Management',
      subject: 'Welcome to the work',
      body: '…',
      addr: 'ops@panvitium.example',            // optional — shown under the sender
      replies: [
        { text: 'Acknowledged.',            effect: 'no-op' },
        { text: 'Who is this, really?',     effect: 'reveal a Logos hint / +curiosity' },
      ],
    },
  }
  ```

  Add a `replies` array (and optional `addr`) to any email and its reply flow lights up automatically.
  The `effect` string is **never rendered** — it is the developer-facing spec for what that branch
  should do.

- **Reply effects.** Implement them in `applyEmailReplyEffect`. The per-reply `effect` strings are the
  spec; keep the function pure (no I/O, no `Date.now`) so saves stay deterministic.

## Decorative-only (kept for the diegetic look)

Compose, Starred/Sent/Drafts/Junk, Search, Forward, Archive. Only Inbox, Reply and Delete are wired.

## Tests

- `packages/sim/src/emails.test.ts` — answer (record/overwrite/unknown-id), the no-op hook, delete
  (flag + hidden-from-unread + cannot re-trigger).
- `packages/shared/src/save/save.test.ts` — ADR-023 round-trip for `answeredReply` + `deleted` (and
  defaults omitted).
- `apps/web/src/ui/Emails.test.ts` — empty state, auto-open-newest + read-on-display, delete falls back
  to the next message.
