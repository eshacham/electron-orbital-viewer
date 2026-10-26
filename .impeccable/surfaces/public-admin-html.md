---
version: 1
slug: "public-admin-html"
primary_target: "public/admin.html"
related_targets: ["src/admin/AdminApp.tsx"]
---

Scope: the owner dashboard's jobs page (`/admin.html`, src/admin/*). Mode: Operate.
Audience and job: the owner today (paying users planned, so the page must grow into a per-user view). Opened right
after a request (follow the job, open its result), in periodic spend and failure reviews, and on the phone for quick
checks. Essentials up front, every detail one step away (quote lines, attempts ledger, files, diagnostics). Must not
look like a busy dashboard.
Chosen structure: the month timeline over a list (dealt card 3), steered by the owner toward the "budget strip and
one-line rows" card: compact chart band, smooth cumulative cost line.
Unresolved: per-user scoping for paying users; how the billed-vs-metered gap is attributed beyond the fixed costs
already known.

## Direction contract

THESIS: The month is one quiet axis: what ran when, what it cost, how close to the cap. Refuses the category's
KPI-tile dashboard and the wide spreadsheet that scrolls cost off screen.

OWN-WORLD: QuantumLab Deep Space and Light Clean tokens unchanged: navy surfaces, Inter with tabular figures, accent
blue only for the cost line, selection and actions; status colours (success, warning, danger, accent) carry meaning
only. Standard MUI controls.

STORY: The owner sees at a glance whether the month is on budget, whether anything is running or failed, and which
jobs missed their prediction; opens a result or a job's details in one action.

FIRST VIEWPORT: Top bar. One budget strip: available of cap with a thin charged/held bar, charged, held, projected,
AWS billed vs meter with the gap. Under it a compact month band (about 120 px): day axis, a bar per job on its day
coloured by status, the smooth monotone cumulative-charged line rising toward a dashed cap line, projection dashed.
Status filter chips and search. Then one-line rows: molecule and formula, status chip, run time against prediction
(a small bar, amber when overrun), memory against prediction, charged of approved, and an Open result / Follow /
Details action; a row opens inline to quote lines, attempts ledger, sizing version, files.

FORM: Month timeline over a list, 3rd of 7 on the ordered list; seed:61064e053c5d03d5

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
