# Electron Orbital Viewer: business-model proposal

Prepared 2026-10-08 for the owner. Sources: `README.md` (features, "Computed molecules"), `docs/HANDOFF.md` Phase 6B-3 (measured AWS job costs), `docs/superpowers/specs/2026-10-05-on-demand-generation-design.md` §10–11 (fixed costs), `tools/jobs/prices.py` and `tools/jobs/sizing.py` (Fargate rates and sizes), `/tmp/research-user-needs.md` (audiences, competitors), plus the web sources cited inline and listed at the end. Prices were checked on 2026-10-08. Where a vendor does not publish a price, this report says so.

---

## 0. The answer in one paragraph

**Keep the viewer, library and lessons free. Charge for computation only, through a prepaid balance with a 4× markup on AWS cost plus a 2¢ per-job platform fee. Sell it through a Merchant of Record (Paddle), with a $10 minimum top-up.** Every signed-in user gets 5 free small calculations a month. Molecules someone has already computed are free to everyone. A typical small molecule then costs the user 4–5¢, and a drug-sized one (caffeine) costs 25–90¢. That is roughly half of Rowan's pay-as-you-go rate.

AWS costs only 6–24 % of each sale. After Paddle's fee, a $10 top-up leaves about $6.50–8 of contribution. One top-up a month covers the fixed AWS bill (≈ $0.50/month), and 15–16 top-ups cover $100 a month of the owner's time and overhead.

Add pooled **Lab balances** (invoiced, $250+) when research groups ask for them. Add **classroom licences** ($2 per student per term, $100 minimum per course) once the Phase 7 lessons and a teacher page exist. Classroom compute costs almost nothing, because a class computes the same molecules and dedupe serves them from the cache.

**Do not build subscriptions now.** The units and payment setup leave room to add them later.

---

## 1. Comparable pricing

### 1.1 Computational chemistry: cloud and web

| Product | Model and unit | Price points | Free tier | Academic terms | Source |
|---|---|---|---|---|---|
| **Rowan** (closest web competitor) | Credits: **1 credit = 1 minute** of compute. CPU 1 credit/min, GPU 3/min, H100/H200 7/min. | **$0.04 per credit** bought outright. Purchased credits valid 1 year, non-refundable. Subscriptions come with weekly credits that don't roll over. Team: 2,000 credits/week, price on request. | Free: 500 credits at sign-up + 20/week | Free Academic: 100 credits/week. Individual academic: **$65/month or $702/year**, 500 credits/user/week (cut from 1,250 in 2026). Group academic: on request. | [pricing](https://rowansci.com/pricing), [credits FAQ](https://www.rowansci.com/blog/credits-faq), [billing docs](https://docs.rowansci.com/tutorials/account/credits-and-billing), [newsletter](https://rowansci.substack.com/p/gpu-accelerated-dft) |
| **WebMO** | Perpetual licence per server instance, plus optional maintenance. Also hosted "WebMO Cloud". | Pro $1,200 / Enterprise $2,400 academic. $3,000 / $6,000 commercial or multi-site. Maintenance $480 / $960 a year academic. Site licence = 3× a single licence. **WebMO Cloud from $25/month.** | Basic edition free (self-hosted) | Academic price is 40 % of commercial | [pricing](https://www.webmo.net/get/pricing.html) |
| **ChemCompute** | Free, NSF-sponsored. Runs GAMESS, Psi4, PySCF, NAMD and Jupyter on SDSC's Expanse. | $0 | Everything | Undergraduates and their instructors; no permission needed | [chemcompute.org](https://chemcompute.org/), [instructors](https://chemcompute.org/instructors) |
| **Q-Chem** (licence) | Perpetual licence per seat or cluster | Academic: $1,080 for one 32-core seat, $9,720 unlimited site. Commercial: $6,480 per seat, $25,920 site. | IQmol runs small free jobs on Q-Chem's server | Academic ≈ 1/6 of commercial | [pricing](https://www.q-chem.com/purchase/pricing/) |
| **Q-Chem Q-Cloud** | Subscription per number of seats; runs on AWS | Academic $174/month for 10 seats, up to $522/month for 100. Commercial $1,044–1,392/month. About 10 % off for annual billing. | — | as left | [Q-Cloud pricing](https://q-chem.com/purchase_qcloud/pricing/) |
| **ORCA** | Free for academic use (registration required). Commercial licences through FACCTs, price on request. | n/a | Academic | Free | [FACCTs](https://www.faccts.de/orca/), [MPI KoFo](https://www.kofo.mpg.de/en/research/services/orca) |
| **Spartan '26** (Wavefunction) | Perpetual licence + maintenance | Academic $1,800 (≤ 16 cores). Government $3,600. Commercial $5,400. **Spartan Student $60 per student**, or $800 per university licence, with lab packs of 5 for $3,200 and 10 for $6,000. | — | Academic = 1/3 of commercial | [Spartan pricing](https://www.wavefun.com/spartan-pricing), [Student](https://store.wavefun.com/product_p/spstudent.htm), [university](https://store.wavefun.com/Spartan_Student_for_Universities_p/spstudentuniv.htm) |
| **Schrödinger / LiveDesign** | Enterprise tokens and licences; not published | Not published. A third-party listing quotes an academic "Premium, 30 tokens" package from **$7,500/year**. | — | Discounts on request | [Capterra](https://www.capterra.com/p/207300/Schrodinger/), [IntuitionLabs](https://intuitionlabs.ai/software/drug-discovery-research/computational-chemistry/schrodinger) |
| **QC Ware Promethium** (GPU DFT) | Per compute-hour, billed by the second | $18/h on V100, $30/h on A100, $100/h for the QC Score workflow. These are legacy rates; new customers get a quote. An academic rate of $20/h has been reported. | Free trial | ~33 % off | [pricing](https://www.promethium.qcware.com/pricing) |
| **Iambic (Entos) Qcore / Envision** | Free for academics; commercial terms not published | n/a | Academic | Free | [Iambic on X](https://x.com/iambic_ai/status/1377297574026117120), [Qcore](https://software.entos.ai/qcore) |
| **Azure Quantum Elements** (Accelerated DFT) | Enterprise Azure service | **Not published** | — | — | [Azure blog](https://azure.microsoft.com/en-us/blog/quantum/2024/06/18/introducing-two-powerful-new-capabilities-in-azure-quantum-elements-generative-chemistry-and-accelerated-dft/) |

### 1.2 Free viewers (the baseline the viewer competes with)

| Product | Price | Licence | Source |
|---|---|---|---|
| Avogadro 2 | Free (desktop) | BSD-3 | [avogadro.cc](https://avogadro.cc/) |
| Mol* | Free (web) | MIT | [Mol* paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC8262734/) |
| NGL | Free (web) | MIT | [NGL](https://github.com/nglviewer/nglview) |

**Conclusion:** nobody pays for a viewer. A viewer is how you build an audience and get cited, not how you make money.

### 1.3 Education

| Product | Model | Price | Source |
|---|---|---|---|
| ChemCollective (CMU) | Free, funded by NSF and the US Department of Education | $0 | [chemcollective.org](https://chemcollective.org/), [EurekAlert](https://www.eurekalert.org/news-releases/508458) |
| Labster | Institutional licence, or per course through the bookstore | **$5,000 minimum a year.** About $50 per student per year on average. Explorer plan reported at $3,000/year for 50 students. Homeschool from $150/year. | [compare plans](https://www.labster.com/compare-plans), [Software Advice](https://www.softwareadvice.com/product/521469-Labster/), [Homeschool Buyers Club](https://homeschoolbuyersclub.com/products/labster) |
| Spartan Student | Per student | $60 | as above |
| Rowan Education | Free credits for students; course pricing on request | not published | [rowansci.com/education](https://rowansci.com/education) |

### 1.4 General "compute credits" products (patterns to borrow)

| Product | Unit | Price | Free / discounts | Source |
|---|---|---|---|---|
| Google Colab | Compute units (CU) | Pro $9.99/month for 100 CU. Pro+ $49.99/month for 600 CU. Pay-as-you-go $9.99 per 100 CU. | Free tier | [Colab pricing summary](https://aicoolies.com/pricing/google-colab) |
| Modal | Per core-second and GiB-second | CPU $0.0000131 per core-second; memory $0.00000222 per GiB-second | **$30/month of free credit.** Academics get up to $10k in credits. | [modal.com/pricing](https://modal.com/pricing) |
| Replicate | Per second of hardware, or per output | $0.000025/s for a small CPU up to $0.0112/s for 8× H100 | — | [replicate.com/pricing](https://replicate.com/pricing) |

**Patterns:**
- Compute is sold in small units that track metered time.
- The free tier is a recurring monthly allowance, not a one-off trial.
- Credits expire after 12 months (Rowan).
- Prepaid packs are the entry point; subscriptions are a volume discount on top.

### 1.5 What this means for pricing

- Rowan's $0.04/min sets the market rate for "web DFT for chemists". Rowan has far more features (conformers, ML potentials, NMR, pKa). This app's differentiators are its visuals, provenance and shareable links. **Price compute at about half of Rowan.**
- ChemCompute, ORCA, Avogadro and Mol* are free. **Teaching compute and viewing cannot be charged for directly.** Teachers will pay for convenience: lessons, a class dashboard, and no admin.
- Labster ($50 per student per year) and Spartan Student ($60) show what institutions pay for well-packaged teaching software. This app can enter far below that, at about $2 per student per term.

---

## 2. Every cost the app pays

### 2.1 Fixed monthly (today, from spec §11 and Phase 6B-3)

| Item | $/month |
|---|---|
| ECR (~1 GB image) | 0.10 |
| Cost Explorer API (31 calls × $0.01) | 0.31 |
| DynamoDB, Lambda, API Gateway, S3, SNS at owner volume | < 0.10 |
| CloudWatch logs and alarms, Cognito (≤ 10,000 MAU), Budgets, gateway endpoints | 0.00 |
| **AWS fixed total** | **≈ 0.35–0.50** |
| *Added once charging starts:* custom domain (Route 53 hosted zone $0.50 + domain ≈ $15/year) | ≈ 1.75 |
| *Added:* SES for sign-up and receipt e-mail ($0.10 per 1,000) | ≈ 0.00–0.10 |
| **Cash fixed costs once live** | **≈ $2.50/month** |

The owner's time (support, refunds, keeping prices current) is the real fixed cost. This report values it at **$100/month** (about 2 hours at $50/hour) to set the profit bar.

### 2.2 Per job (AWS)

**Compute (Fargate ARM64, us-east-1, from `prices.py`, plus $0.005/h for the public IPv4 address while a task runs):**

| Size | vCPU / GB | Spot $/h | On-demand $/h | Retail at 4×: Spot / on-demand |
|---|---|---|---|---|
| S | 2 / 8 | 0.035 | 0.098 | $0.14 / $0.39 per hour |
| M | 4 / 16 | 0.065 | 0.19 | $0.26 / $0.77 |
| L | 16 / 64 | 0.24 | 0.75 | $0.97 / $3.00 |
| XL | 32 / 244 | 0.61 | 1.91 | $2.46 / $7.64 |

Fargate bills per second with a 1-minute minimum. That is why water costs $0.0005.

**Storage (S3 Standard, $0.023/GB-month):**
- The library's 36 molecules take 23 MB, about 0.65 MB each.
- Allowing 5 MB per computed result, plus logs, for 12 months: 0.06 GB-month = **$0.0014 per job**. PUT and GET requests add < $0.0001.

**The quote already prices storage and delivery.** `tools/jobs/prices.py` (PRICES_VERSION 2, Phase 6C) uses S3 at $0.023/GB-month and CloudFront at $0.085/GB with the free tier *not* subtracted. A ≤ 5 MB result therefore costs ≈ $0.0013 to keep for 12 months and ≈ $0.0004 per download. The retail lines proposed below ($0.005 each) cover both with room to spare.

**Delivery (CloudFront):**
- The always-free tier covers 1 TB and 10 million requests a month ([CloudFront free tier](https://perfsys.com/blog/cloudfront-pricing-guide/)), about 200,000 result views at 5 MB.
- Past that, ≈ $0.085/GB, or $0.0004 per view.
- **Effectively $0 at any plausible volume.**

**API, Lambda and DynamoDB:**
- HTTP API costs $1.00 per million calls. DynamoDB on-demand costs $0.625 per million writes and $0.125 per million reads ([DynamoDB pricing](https://www.bytebase.com/blog/understanding-dynamodb-pricing/)).
- The status panel polls every 5 s. An hour of watching is 720 calls, about **$0.001**. Negligible, but it grows with watch time, not job size; a 30-second poll after the first minute would cut it by 6×.

**Accounts:**
- Cognito Essentials is free for 10,000 MAU (monthly active users), then **$0.015 per MAU** ([Cognito pricing](https://aws.amazon.com/cognito/pricing/)). Only people who compute need an account; viewers never do.
- Cognito's built-in e-mail is capped at **50 e-mails a day**, so public sign-up needs SES ([Cognito e-mail settings](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html)).

**Measured jobs** (AWS cost = compute + $0.002 for storage, delivery and API). The retail price uses the formula proposed in §3, Option A.

| Job (Phase 6B-3) | AWS compute | AWS all-in | **Retail price** | Gross margin | Rowan at $0.04/min (rough) |
|---|---|---|---|---|---|
| water single (S Spot, measured) | $0.0005 | $0.0025 | **$0.04** | 94 % | $0.04 (1 min) |
| water optimise (S Spot, measured) | $0.0005 | $0.0025 | **$0.04** | 94 % | $0.04 |
| benzene single (S Spot, measured) | $0.0026 | $0.0046 | **$0.05** | 91 % | $0.18 (4.4 min) |
| ethanol optimise (S Spot, measured) | $0.0032 | $0.0052 | **$0.05** | 90 % | $0.17 |
| caffeine single (M Spot, measured) | $0.053 | $0.055 | **$0.25** | 78 % | $2.09 (52 min) |
| caffeine single (L Spot, predicted) | $0.069 | $0.071 | **$0.31** | 77 % | $0.69 (17 min) |
| caffeine optimise (L Spot, predicted) | $0.146 | $0.148 | **$0.62** | 76 % | $1.47 (37 min) |
| caffeine optimise (L on-demand, measured) | $0.219 | $0.221 | **$0.91** | 76 % | $0.68 (17 min) |

Rowan's machines and methods differ, so its per-minute equivalent is indicative only.

**Drug-sized molecules (30–50 heavy atoms) are bigger than caffeine (14 heavy atoms).** Sizing scales with N^3.5, so expect $0.50–3 per single point and several dollars per optimisation at retail. Many such jobs will hit today's 1–2 h ceilings and be refused. The research market this app can serve now is **small molecules up to caffeine size**.

### 2.3 Payment processing

| Option | Fee | $10 top-up | $25 | $50 | Tax handled? |
|---|---|---|---|---|---|
| Stripe Payments (US card) | 2.9 % + $0.30. International cards +1.5 %, currency conversion +1 %. | $0.59 | $1.03 | $1.75 | **No.** Stripe Tax costs 0.5 % per transaction or $0.50 per API transaction. Subscriptions need Stripe Billing, 0.7 % on pay-as-you-go. |
| **Paddle** (Merchant of Record) | 5 % + $0.50, all-in | **$1.00 (10 %)** | $1.75 (7 %) | $3.00 (6 %) | **Yes**: VAT, GST and US sales tax, invoices, fraud, chargebacks. Prices under $10 need a bespoke quote. |
| Lemon Squeezy (Merchant of Record) | 5 % + $0.50, plus 0.5–1 % for some payment methods | $1.00 | $1.75 | $3.00 | Yes. It is being folded into Stripe Managed Payments. |
| Stripe Managed Payments (Merchant of Record) | Stripe fees + 3.5 % (≈ 6.4 % + $0.30) | $0.94 | $1.90 | $3.50 | Yes. Generally available April 2026 in about 35–39 countries. |

Sources: [Stripe pricing](https://stripe.com/pricing), [Paddle pricing](https://www.paddle.com/pricing), [Lemon Squeezy pricing](https://www.lemonsqueezy.com/pricing), [Stripe Managed Payments summary](https://dodopayments.com/blogs/lemonsqueezy-review).

**Chargebacks:**
- On plain Stripe, each dispute costs **$15**, win or lose until countered ([Stripe](https://stripe.com/pricing)). One dispute erases the margin on about 2–3 $10 top-ups.
- A Merchant of Record absorbs disputes and fraud screening, including the card-testing fraud that hits low-price checkouts.

### 2.4 Taxes: why a Merchant of Record for a solo owner

**What selling directly would require:**
- **EU:** a non-EU seller of e-services to consumers owes EU VAT **from the first euro**, at the buyer's country rate. That means registering for the non-Union One-Stop-Shop and filing quarterly ([vatcalc](https://www.vatcalc.com/eu/eu-vat-on-b2c-digital-services-after-1-july-2021-moss-oss/), [SimplyVAT](https://simplyvat.com/non-union-oss/)).
- **UK, Norway, Switzerland, Australia and others:** similar rules.
- **US:** about 25 states tax SaaS in some form. Nexus is usually triggered at $100,000 of sales (Illinois dropped its 200-transaction test in 2026) ([TaxCloud](https://taxcloud.com/blog/saas-sales-tax-by-state/), [Avalara](https://www.avalara.com/us/en/learn/guides/state-by-state-guide-economic-nexus-laws.html)).

Selling to students and individual researchers worldwide is B2C-heavy, so these rules bite from the first sale.

**What a Merchant of Record changes:**
- Paddle is the legal seller. It collects and remits all of the above and issues compliant invoices and receipts.
- The owner sells only to Paddle. That is one B2B customer and one payout, which is a far simpler domestic position.
- The owner still owes home-country income tax, and possibly home VAT on the supply to Paddle (usually zero-rated as an export of services). **One hour with a local accountant before launch** settles this.

**Cost:** the extra ~2–3 points of fee over plain Stripe cost less than a single VAT filing service, and far less than the owner's time.

---

## 3. Three business models

**What stays free forever in all three:**
- the four viewer modes;
- the curated library;
- lessons (Phase 7);
- viewing and sharing any computed molecule by link;
- export;
- **any molecule already computed by anyone.** Dedupe already returns the existing result, and charging nothing for it is the best marketing line the app has.

This is the audience engine. Teachers link to it, researchers cite it, and each share link is an advert.

### Option A: free viewer + prepaid compute balance (pay as you go)

**Pricing:**

| Item | Price |
|---|---|
| Viewer, library, lessons, cached results | Free |
| Free allowance (signed-in, verified e-mail) | **5 small calculations a month**: S size, Spot, ≤ 10 min predicted. Covers water, benzene and ethanol. Does not roll over. |
| Compute | **4 × AWS cost** on billed seconds. Retail rates in §2.2: e.g. L Spot $0.97/h, L on-demand $3.00/h. |
| Storage, 12 months | $0.005 per job |
| Delivery | $0.005 per job |
| Platform fee (the quote's existing line, now non-zero) | **$0.02 per job** |
| Spot interruptions | **Free**: the user pays for the attempt that finished, and the platform absorbs reclaimed attempts |
| Failed on our side | **Free** (v1: charge only DONE jobs) |
| Top-up packs | **$10 · $25 · $50** (the $50 pack gives $55 of balance). Minimum $10. Balance in dollars, valid 12 months. |
| Hold | The quote's **maximum** is held at submit and the unused part released at settle. This reuses the existing meter's reserve/settle logic, per user. |

**Unit economics (Paddle):**

| | $10 pack | $25 pack | $50 pack (+$5 bonus) |
|---|---|---|---|
| Paddle fee | $1.00 | $1.75 | $3.00 |
| AWS if spent on caffeine-size jobs (≈ 23 % of retail) | $2.30 | $5.75 | $12.65 |
| AWS if spent on small jobs (≈ 8 %) | $0.80 | $2.00 | $4.40 |
| Failed jobs and interruptions absorbed (≈ 3 % of retail) | $0.30 | $0.75 | $1.65 |
| **Contribution** | **$6.40–7.90** | **$16.75–20.50** | **$32.70–40.95** |

**Break-even:**
- AWS fixed costs ($0.50/month): **1 top-up a month**.
- Cash fixed costs including the domain ($2.50): **1 top-up**.
- $100/month of owner time and overhead: **14–16 × $10 top-ups**, or **6 × $25**.

**Free-tier cost:**
- 5 small jobs ≈ $0.013 of AWS per active free user a month. 1,000 active free users ≈ $13/month.
- Put a **global free pool cap of $20/month of AWS**. When it is used up, free calculations pause until the 1st and paid users are unaffected.
- Funded from paid contribution, the free pool costs about 3 top-ups a month.

**Scenarios (monthly):**

| | Paying users × average top-up | Gross | Paddle | AWS (variable + free pool + fixed) | Net before owner time |
|---|---|---|---|---|---|
| Launch | 5 × $10 | $50 | $5 | ≈ $10 + $5 + $2.50 | **≈ $28** |
| Traction | 30 × $20 | $600 | $45 | ≈ $110 + $20 + $2.50 | **≈ $420** |
| Good | 100 × $25 | $2,500 | $175 | ≈ $450 + $20 + $2.50 | **≈ $1,850** |

**Risks:**
- **Low ceiling.** Jobs cost cents, so revenue grows only with heavy users. This is the reason to add Lab and classroom revenue later.
- **Abuse of the free tier.** Throwaway accounts. Mitigations: verified e-mail, the global free pool cap, one concurrent free job, and S size only.
- **Hold size.** A Spot job holds three attempts, e.g. caffeine optimise holds 9× its expected bill (about $5.35 retail against a $0.62 expected price). The $10 minimum top-up covers caffeine-size holds. Jobs whose maximum exceeds the balance should say "top up $X to run this".
- **Expiry rules.** Rowan's 12-month expiry is the precedent. Refund any unused balance on request within 14 days of purchase; this satisfies the EU withdrawal right and Paddle's policy.
- **Industrial confidentiality.** Results are public-by-link, and dedupe crosses users. Pharma will not submit proprietary structures to a solo-run site. Do not count on industry revenue in v1.

**Operational needs:** accounts with self sign-up; Paddle checkout and webhooks; a per-user balance ledger; Paddle receipts; automatic no-charge on failure; per-user limits.

### Option B: freemium subscription tiers

| Tier | Price | Included each month | Limits | Overage |
|---|---|---|---|---|
| Free | $0 | 5 small calculations | S, Spot, 1 concurrent | n/a |
| Student | $4/month or $36/year | $3 of compute balance | S–L, Spot only, academic e-mail | Prepaid top-up at retail |
| Researcher | $15/month or $150/year | $12 of compute balance | All sizes, on-demand allowed, 3 concurrent | Retail |
| Lab (5 seats) | $60/month or $600/year | $50 pooled | All sizes, shared projects, invoice | Retail |

Included balance does not roll over, as with Rowan's weekly credits.

**Unit economics:**
- **Researcher $15:** Paddle $1.25. Worst-case AWS if fully used ≈ 23 % × $12 = $2.76. **Contribution ≥ $11 a month.** Break-even on $100 of owner time is **9 subscribers**.
- **Student $4:** Paddle $0.70 (17.5 %). AWS ≤ $0.70. Contribution ≈ $2.60.
- **Lab $60:** Paddle $3.50, AWS ≤ $11.50, contribution ≈ $45.
- Unused allowance is pure margin (breakage). Most subscribers will not use their $12.

**Risks:**
- **Demand is bursty.** Research compute comes in project bursts, and researchers churn between bursts.
- **Recurring billing adds work:** dunning, proration, cancellations, monthly allowance resets, plan changes and more support tickets.
- Paying for an allowance you don't use feels bad at this price level. The whole value is $12 of compute for a tool with fewer features than Rowan, whose academic plan is $65/month.
- **Students rarely pay monthly** for chemistry tools; the course or department pays.

**Operational needs:** everything in A, plus subscription webhooks (created, renewed, past due, cancelled), monthly grant jobs, a plan management page and proration rules.

### Option C: institutional and classroom licences

| Product | Price | Includes |
|---|---|---|
| Course licence | **$2 per student per term, $100 minimum per course** | Roster by join code, teacher dashboard (who did which lesson), assignment links, 10 small calculations per student (cached results free), invoice/PO. |
| Department/site licence | **$1,000/year** | Unlimited courses and students. Fair-use compute pool of $100 AWS a year. Named contact. |
| Lab balance (research group) | Prepaid **$250 minimum**, by invoice | A pooled Option A balance shared by group members, plus 5 % bonus balance |

**Unit economics:**
- **A 100-student course:** $200. Paddle ≈ $10.50. AWS: in theory 100 × 10 × $0.0025 = $2.50, but a class computes the same molecules, so dedupe makes it ≈ $0.10. **Contribution ≈ $189 (≈ 95 %).**
- **Department licence $1,000:** Paddle $50.50, AWS ≤ $100. **Contribution ≥ $850.**
- **Break-even on $100/month:** one course licence a month, or one department licence a year covers about 8 months.
- **Benchmarks:** Labster ≈ $50 per student per year with a $5,000 minimum; Spartan Student $60 per student. **$2 per student is an easy purchase on a teacher's discretionary budget or a P-card** (a university purchasing card), so it avoids procurement.

**Risks:**
- **Not sellable yet.** Lessons, the teacher page, the Methods page and a citation/DOI are all Phase 7 and not built (`/tmp/research-user-needs.md`).
- **Free competitors.** ChemCompute, ChemCollective and ORCA are free, so the product must be convenience and pedagogy, not compute.
- **Academic budget cycles.** US fiscal years start 1 July; course software is chosen in **April–May for fall** and **October–November for spring**. A launch that misses those windows waits 6 months.
- **Procurement paperwork.** Institutions above P-card limits ask for W-9 or vendor forms, accessibility statements (VPAT) and student data agreements (FERPA, GDPR). Keep student data minimal: a join code and a display name, no e-mail required.
- Sales take the owner's time: e-mails, demos.

**Operational needs:** organisations and rosters, join codes, a teacher dashboard, invoicing (Paddle supports invoices), seat counting, and an accessibility statement.

---

## 4. Recommendation: Option A now, Lab balances next, classroom licences after Phase 7

**Why A first:**
1. **Cash arrives before cost and there is no credit risk.** The existing reserve/settle meter becomes a per-user ledger. No subscriptions, dunning or proration.
2. **Margins are good at small scale:**
   - AWS takes 6–24 % of each sale and Paddle 6–10 %.
   - One top-up a month covers fixed AWS costs, and about 15 top-ups cover $100 of owner time.
3. **It matches how researchers use compute (in bursts),** and Rowan's own unit (prepaid credits valid 12 months).
4. **It tests willingness to pay with the least to build.** If 30% or more of paying users top up every month for 3 months, *then* offer a Researcher subscription (Option B) as a discount for them. Until then, B adds work without adding revenue.

### Rollout order

| Step | When | What | Pricing |
|---|---|---|---|
| 1 | Now → launch | Option A for individuals | Free tier: 5 small calculations a month. Retail 4× AWS + $0.03 per job (2¢ platform fee, 0.5¢ storage, 0.5¢ delivery). Packs $10/$25/$50(+$5). |
| 2 | When ≥ 3 research groups ask, or at month 3 | **Lab balance**: Option A with a shared organisation balance and an invoice | $250 minimum, +5 % bonus |
| 3 | After Phase 7 (lessons, teacher page, citation/DOI). Sell by **April–May 2027 for fall 2027**. | Option C course licence; department licence on request | $2 per student per term, $100 minimum; site licence $1,000/year |
| 4 | Only if usage data justify it | Option B Researcher subscription | $15/month with $12 included |

**Prices to put on the pricing page** (plain language for non-chemists):
- "Small molecules (water, benzene, ethanol): about 4–5¢ each, and 5 free every month."
- "Drug-sized molecules like caffeine: about 25–60¢ on Spot, 90¢ on demand."
- "Already computed by anyone: free."
- "If it fails on our side, you pay nothing."

### Minimum to build before charging money

**1. A domain and legal pages.** Paddle reviews the site before approving it.
- A custom domain (a payment page on `*.cloudfront.net` looks like phishing).
- Terms of service, a privacy policy, a refund policy (unused balance refundable within 14 days; failed jobs never charged), and a pricing page.

**2. Public accounts.**
- Cognito self sign-up with e-mail verification through **SES** (the default sender stops at 50 e-mails a day).
- MFA optional for customers, still required for the owner.
- The admin role kept separate from customers.

**3. A per-user balance ledger in DynamoDB,** in integer micro-dollars like today's meter:
- `BALANCE#<user>` with conditional *hold the maximum at submit* and *settle actual × 4 + fees*, exactly once.
- A month-start free allowance counter.
- An append-only `LEDGER#<user>#<ts>` entry for every top-up, hold, settle, refund and adjustment.

**4. Paddle integration.**
- Overlay checkout for the three packs.
- A webhook Lambda, with a verified signature and idempotent on the transaction ID: completed → credit the balance; refund or chargeback → debit, and block new jobs while the balance is negative.
- Paddle issues receipts and invoices; no invoice engine is needed.

**5. The quote turns into a price.**
- The compute line at retail, the platform fee at $0.02, storage and delivery at $0.005 each.
- "Estimate" and "maximum (held)" both shown.
- A free allowance or cached result shows as $0.00 with the reason.

**6. Automatic no-charge.**
- FAILED settles the user at $0, whatever the cause (v1).
- Spot-reclaimed attempts are never charged.
- Watch the failure rate in `/admin.html`; if users farm failures, change the rule to "no charge when the failure is ours".

**7. Limits and guards.**
- Per user: 1 concurrent free job, 3 paid; a $20/day default spend limit the user can raise.
- A global free pool of $20/month of AWS.
- Replace the fixed $10 AWS Budget with **$50 + 30 % of the last 30 days' top-ups**, keeping the deny-SubmitJob action and the kill switch (`jobs.sh pause`) as the last resort.
- The status panel's polling slowed to 30 s after the first minute.

**8. Admin.**
- A per-user ledger view in `/admin.html`.
- Manual credit and refund (goodwill).
- A daily check that the sum of ledgers matches Paddle payouts plus AWS cost (the existing Cost Explorer job extended).

**Not needed before charging:** subscriptions, organisations, invoices for POs (step 2), the teacher dashboard (step 3), private or non-deduped results (only if an industrial customer asks and pays), or an API.

### Decisions the owner must make

1. **Merchant of Record: Paddle** (recommended: all-in fee, invoices for institutions later) **or Stripe Managed Payments** (similar cost, newer).
2. **Markup: 4×** (recommended; about half of Rowan's rate) or 3× (more competitive, contribution per $10 falls by about $0.60–1.70).
3. **Free tier size: 5 small calculations a month with a $20 global pool** (recommended).
4. **The one-hour accountant consult** on home-country tax treatment of Paddle payouts.

---

## Sources

- Rowan: https://rowansci.com/pricing · https://www.rowansci.com/blog/credits-faq · https://docs.rowansci.com/tutorials/account/credits-and-billing · https://rowansci.substack.com/p/gpu-accelerated-dft · https://rowansci.com/education · https://rowansci.com/blog/what-we-learned-from-our-user-survey
- WebMO: https://www.webmo.net/get/pricing.html
- ChemCompute: https://chemcompute.org/ · https://chemcompute.org/instructors
- Q-Chem: https://www.q-chem.com/purchase/pricing/ · https://q-chem.com/purchase_qcloud/pricing/
- ORCA: https://www.faccts.de/orca/ · https://www.kofo.mpg.de/en/research/services/orca
- Spartan: https://www.wavefun.com/spartan-pricing · https://store.wavefun.com/product_p/spstudent.htm · https://store.wavefun.com/Spartan_Student_for_Universities_p/spstudentuniv.htm
- Schrödinger: https://www.capterra.com/p/207300/Schrodinger/ · https://intuitionlabs.ai/software/drug-discovery-research/computational-chemistry/schrodinger
- QC Ware Promethium: https://www.promethium.qcware.com/pricing
- Iambic/Entos: https://x.com/iambic_ai/status/1377297574026117120 · https://software.entos.ai/qcore
- Azure Quantum Elements: https://azure.microsoft.com/en-us/blog/quantum/2024/06/18/introducing-two-powerful-new-capabilities-in-azure-quantum-elements-generative-chemistry-and-accelerated-dft/
- Avogadro: https://avogadro.cc/ · Mol*: https://pmc.ncbi.nlm.nih.gov/articles/PMC8262734/ · NGL: https://github.com/nglviewer/nglview
- ChemCollective: https://chemcollective.org/ · https://www.eurekalert.org/news-releases/508458
- Labster: https://www.labster.com/compare-plans · https://www.softwareadvice.com/product/521469-Labster/ · https://homeschoolbuyersclub.com/products/labster
- Colab: https://aicoolies.com/pricing/google-colab · Modal: https://modal.com/pricing · Replicate: https://replicate.com/pricing
- Stripe: https://stripe.com/pricing · Paddle: https://www.paddle.com/pricing · Lemon Squeezy: https://www.lemonsqueezy.com/pricing · Stripe Managed Payments: https://dodopayments.com/blogs/lemonsqueezy-review
- AWS: https://aws.amazon.com/cognito/pricing/ · https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html · https://perfsys.com/blog/cloudfront-pricing-guide/ · https://www.bytebase.com/blog/understanding-dynamodb-pricing/ · https://smtpedia.com/amazon-aws-ses-pricing/
- Tax: https://www.vatcalc.com/eu/eu-vat-on-b2c-digital-services-after-1-july-2021-moss-oss/ · https://simplyvat.com/non-union-oss/ · https://taxcloud.com/blog/saas-sales-tax-by-state/ · https://www.avalara.com/us/en/learn/guides/state-by-state-guide-economic-nexus-laws.html
- In-repo: `README.md`, `docs/HANDOFF.md` (Phase 6B-3), `docs/superpowers/specs/2026-10-05-on-demand-generation-design.md` §10–11, `tools/jobs/prices.py`, `tools/jobs/sizing.py`, `/tmp/research-user-needs.md`
