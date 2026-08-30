# Next session prompt

Paste everything below the line into a fresh session started in this repo.

---

You are continuing work on the multi-electron atom viewer in this repo, on the
branch `feat/multi-electron-atoms` (already checked out, tree clean, 1330 tests
passing, build clean).

**Read `docs/HANDOFF.md` first, in full.** Then skim
`docs/superpowers/specs/2026-08-29-multi-electron-atoms.md` — especially §2 and
the three addenda at the end. Those two documents carry the architecture, the
decisions that cost real effort to reach, and the reasoning you must not
re-litigate. `README.md` describes the app itself.

## Your standing authority

Eyal has pre-approved all of this. **Do not stop to ask for permission or
confirmation. Do not pause between tasks to check in.**

- Change, add or delete any file in this repo.
- Add dependencies if a task genuinely needs one (prefer not to; the project has
  deliberately stayed dependency-free).
- Search the web freely.
- Run the app, drive it with browser automation, take screenshots.
- Commit as you go.
- Run `./infra/deploy.sh` at the very end, once every gate below passes.

**Where anything is ambiguous, make the judgment call yourself and keep
moving.** Record each call and its reasoning in `docs/HANDOFF.md` so it can be
reviewed afterwards. A wrong call that is written down is cheap; stopping to ask
is not. The only things that should ever halt you are a destructive operation
you did not intend, or a security-sensitive action.

## The work, in priority order

Each item is done when it is committed, tested, **and verified in the running
app** — not when the tests go green. See "How to work" below for why that
distinction matters here.

### 1. Composition readability
Iron's M shell currently renders five overlapping translucent d orbitals as an
unreadable gold blob. The overlap is physically honest and must remain the
default — they genuinely occupy the same space, which is the teaching point —
but there must be a way to read it. Make clicking a subshell chip isolate that
subshell's orbitals, and clicking it again restore the full view. Verify with
iron (5 d orbitals) and uranium (7 f orbitals).

### 2. Rename the second mode
"Hydrogen-like" becomes **"Basic Orbitals"** and its nucleus (Z) control is
removed — atom mode covers every element, so a second element control was
redundant and confusing. Fix Z = 1 internally. Update the README, any copy that
names the mode, and the tests. Addendum 2 records what this costs (He⁺/Li²⁺ and
the 1/Z scaling demonstration are no longer reachable); that cost is accepted.

### 3. Clickable rings and explicit deselect
Testing showed the drill-down is not discoverable — a user could not tell what
clicking a shell chip did, or how to undo it. Make the rings themselves
clickable in the 3D view to drill into that shell; the pointer→radius mapping
already exists for the hover linkage, so this is mostly wiring. Add an explicit
deselect affordance rather than relying on the breadcrumb alone.

### 4. Periodic table selector
Replace the 118-item dropdown with a real periodic table in its own collapsible
panel above the viewer. **Colour by block (s/p/d/f), not by chemical family** —
block is derivable from `configurationFor(Z)`, whereas families are an external
taxonomy the app does not compute, and block colour predicts which orbital
shapes the composition view will show. Highlight the selected element's whole
column on hover and selection, because a group *is* a column precisely because
its members share a valence configuration. Keep the dropdown as the
narrow-screen fallback. Full design in Addendum 3.

### 5. Core versus valence
An element's chemistry is almost entirely its outermost shell. Distinguish the
valence shell from the inert core in the atom view, so group behaviour becomes
visible directly — Li/Na/K all showing one lonely s electron outside a closed
core, F/Cl both one short of full, Ne/Ar both sealed. Design note at the end of
the "what makes atoms look different" section of the spec.

### 6. Finish
- Update `README.md` so it describes the app as it now is.
- Update `docs/HANDOFF.md`: current state, every judgment call you made, and
  anything left outstanding.
- Full suite green, `npm run build` clean, `npx tsc --noEmit` clean.
- Drive the whole app once end to end: several elements at all three levels,
  both modes, phone width, and confirm no console errors.
- Then run `./infra/deploy.sh`. If it fails, diagnose and fix it; deployment is
  part of "done", not an optional extra.

## How to work

**Use subagents via the Agent tool, one implementer at a time**, reviewing each
diff before moving on. Read `docs/HANDOFF.md`'s process notes before dispatching
anything.

**The single most important rule when dispatching:** tell every subagent to run
commands in the **foreground** and never in the background. A subagent that
backgrounds a long command and ends its turn is stranded permanently — the
completion notification routes to the parent, not to it. Two agents were lost
this way. State expected durations in the dispatch (focused jest a few seconds,
`npx jest` ~75 s, `npm run build` ~20 s) so a multi-minute foreground wait reads
as normal.

**Verify in the live app, not only in tests.** Every serious defect in this
project was invisible to a green suite: Numerov tests that used a constant input
under which correct and broken code produce identical output; a grid bug
returning a 41 % wrong energy with 1084 tests passing; argon rendering 21× too
small with 1260 passing; a cache that never once hit in the running app while a
test measured it at 3210 ms → 0.001 ms. Unit tests validated the functions;
nothing validated the system. Drive the app.

**Do not regress what is already working.** In particular: the ring-contrast
acceptance test (peak-to-trough ≥ 0.35 for Ar and U), the NIST benchmark
agreement, hydrogen-like framing, the hover linkage in both directions, the
profile cache, and the level transitions. Check them after any change to
colours, shaders, framing or state.

**Keep the honesty requirements** in spec §7. Never label an orbital eigenvalue
an ionisation energy. The cut-face legend says D(r) = 4πr²ρ(r). The model's
approximations stay stated and reachable in the UI.

Work through all six items without stopping. Eyal will review when you are done.
