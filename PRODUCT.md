# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Learners and teachers** (co-primary) studying or teaching atomic and molecular structure: they turn, cut open
  and read off real orbitals, shells, densities and bonds to understand why chemistry behaves as it does.
- **Researchers** (co-primary) who need the pictures to be scientifically credible: they check methods, numbers,
  references and provenance before trusting or reusing a figure.
- **The owner** (today the only account in the `owners` group) requests new molecule calculations, approves their
  cost, and monitors jobs, spend and results on the owner dashboard (`/admin.html`).
- **Paying users are planned** (roadmap Phase 8): the jobs and requesting surfaces must be able to grow from an
  owner-only view into a per-user view. Pricing, accounts and limits for them are not decided.

## Product Purpose

QuantumLab is an interactive 3D viewer for atomic and molecular structure in the browser, live at
https://d3rhfcclqjt4tf.cloudfront.net. Four modes: **Orbitals** (exact hydrogen-like orbitals), **Atoms** (any
element Z = 1–118 solved from scratch by a self-consistent field, drilled from atom to shell to orbital), **Bonds**
(H₂⁺ exactly and ten diatomics from a quantum-chemistry pipeline, with potential curves and MO diagrams) and
**Molecules** (a 25-molecule library plus on-demand computed molecules: density, electrostatic potential, every MO).
Success: a learner understands what they see, a teacher can show it, and a researcher can verify it.

## Positioning

The pictures are computed, not illustrated: real many-electron solutions and quantum-chemistry results, each with
its method, accuracy against published references, and provenance stated beside it. New molecules are computed on
demand by an owner-approved, metered job pipeline with a hard spending cap.

## Operating Context

- Desktop, tablet and phone browsers; dark and light themes; shared links reproduce a view.
- Owner workflow: sign in → request a molecule (structure resolved from a name/SMILES) → preview the structure and a
  quote (spot vs on-demand, estimate and maximum, line-item breakdown) → approve up to a maximum → follow the job →
  open the result → reconcile jobs and cost on the owner dashboard.
- The owner dashboard today: a jobs table (molecule, recipe, method, size, capacity, status and stage, times,
  predicted vs actual time and memory, approved maximum vs charged cost, result and file links) and a cost panel
  (spent, reserved, remaining of the monthly cap, a projection, a daily-spend chart, AWS's billed figure beside the
  app's own meter).

## Capabilities and Constraints

- Front end: React 19, MUI 7, Redux Toolkit, three.js (one WebGL canvas per page), Vite, TypeScript. The owner
  dashboard is a separate Vite entry whose code must never reach the viewer's bundle (checked on every deploy).
- Jobs back end on AWS (API Gateway + Cognito JWT with a server-side `owners` group check, Lambda, Batch/Fargate,
  DynamoDB, S3, CloudFront). Monthly compute cap $8.80, enforced by the app's meter, plus an AWS Budget stop at $10.
- Known open product work (Phase 6G-3, owner dashboard): reconcile AWS-billed vs metered cost with an explained
  delta; make the jobs table scannable (keep molecule, status, runtime, cost and an obvious "Open result" in the row;
  move files and diagnostics into details; budget summary above the history); show prediction quality per sizing
  version.
- Undecided: anything about paying users (accounts, pricing, quotas, per-user privacy of jobs).

## Brand Commitments

- Name: **QuantumLab**.
- Science colours are never altered for style: orbital phase colours (ψ > 0 / ψ < 0), density and ESP maps keep
  their own colours, the same in both themes, never whitened or tinted (owner, 2026-10-18).
- Every number shown states what it is: method, units, and whether it was calculated or measured.

## Evidence on Hand

- 25 library molecules and 10 Bonds systems of published v3 data (CloudFront `molecules/v3/`), with methods,
  reference values (NIST, CCCBDB) and validation lines.
- Real job history on the owner dashboard (e.g. theobromine: $0.51 approved maximum, $0.04 charged, 8 m 02 s actual
  vs 13 m 29 s predicted). No testimonials, customers, usage statistics or prices for paying users exist; do not
  fabricate them.

## Product Principles

1. **Computed, not drawn.** Never show a picture or number the app did not compute or source; say how it was made.
2. **Honest about limits.** State model limitations, errors against references and missing data plainly.
3. **Spending is explicit.** No compute runs without an approved maximum; cost and its basis are always visible.
4. **One picture, many readers.** The same view serves a learner, a teacher and a researcher; depth is reachable,
   not imposed.
5. **Grow without rework.** Owner-only surfaces (requesting, jobs, cost) are built so they can become per-user.

## Accessibility & Inclusion

Every colour on screen has a key; names contain their visible labels (WCAG 2.5.3); keyboard and screen-reader access
to every number (e.g. the Structure tables mirror the on-model labels); reduced motion respected.
