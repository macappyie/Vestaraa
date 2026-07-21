# Vestara — Phase 1 MVP Implementation Roadmap
**Invest Smarter. Build Wealth Together.**

Timeline: 3–6 months | Current status: Admin approval Lambda in progress (IAM permissions)

---

## 0. Foundation & Infrastructure (Weeks 1–3)

Everything else depends on this being solid first.

| Component | What to build | Notes |
|---|---|---|
| **AWS Account setup** | Org structure, separate dev/staging/prod accounts or environments | Avoid building everything in one account long-term |
| **Aurora PostgreSQL** | Schema design: `users`, `projects`, `investments`, `documents`, `kyc_status`, `transactions`, `portfolio_updates` | You already have `vestara` cluster running with Data API |
| **IAM roles & policies** | One role per Lambda function, least-privilege, no wildcard `*` actions | You're already hitting this — good, this is the right discipline |
| **API Gateway** | REST or HTTP API, route structure (`/investor/*`, `/developer/*`, `/admin/*`) | Decide auth model now (Cognito recommended) |
| **Auth (Cognito)** | User pools for Investors, Developers, Admins with role-based groups | Needed before KYC/signup work starts |
| **S3 buckets** | Separate buckets: `vestara-documents` (plans/valuations), `vestara-kyc-docs` (encrypted), `vestara-static-assets` | KYC bucket needs stricter encryption + access logging |
| **CloudFront + React hosting** | CDN in front of S3-hosted React build | Can be done in parallel with backend |
| **Secrets Manager + KMS** | Centralize DB creds, third-party API keys | You're mid-setup on this already |

**Exit criteria:** A Lambda can authenticate a Cognito user, read/write Aurora via Data API, and read/write S3 — end to end, with correct IAM.

---

## 1. Investor Flow (Weeks 3–8)

| Feature | Backend | Frontend |
|---|---|---|
| **Sign up + identity verification (KYC)** | Cognito signup → Lambda triggers KYC via third-party provider (e.g., Onfido, Veriff) → store status in `kyc_status` table | Signup form, document upload, verification status screen |
| **Browse available projects** | Lambda + Aurora query for `status = 'approved'` projects | Project listing grid, filters (location, yield, risk) |
| **View AI-generated summaries** | Lambda → Bedrock call → cache result in Aurora/S3 (don't regenerate every view) | Summary card on project detail page |
| **Invest from £100** | Lambda handles investment creation, payment integration (Stripe/GoCardless), writes to `investments` table | Investment flow: amount input → payment → confirmation |
| **Track returns & updates** | Lambda aggregates investment performance from `transactions` + `portfolio_updates` | Portfolio dashboard: holdings, returns, timeline of updates |

**Key dependency:** Payments. Decide provider early (Stripe Connect is common for marketplace-style investment flows) — this affects your data model for `transactions`.

---

## 2. Developer Flow (Weeks 5–10, parallel to Investor flow)

| Feature | Backend | Frontend |
|---|---|---|
| **Create project listings** | Lambda + Aurora insert into `projects` (status: `draft`) | Multi-step listing form |
| **Upload plans, valuations, budgets, timelines** | Lambda generates pre-signed S3 URLs for direct upload → metadata in `documents` table | Drag-and-drop uploader, file list per project |
| **Publish construction progress** | Lambda updates `projects.progress_log` (JSON or separate table) | Progress timeline UI, photo/update uploads |

---

## 3. Admin Flow (Weeks 6–10, this is where you are now)

| Feature | Backend | Frontend |
|---|---|---|
| **Approve projects** | `vestara-admin-approve-project` Lambda (in progress) | Approval queue, project detail review screen |
| **Review compliance** | Lambda checks KYC status, document completeness before allowing approval | Compliance checklist UI |
| **Monitor investments** | Lambda + Aurora aggregation queries | Admin dashboard: investment volume, active projects |
| **Generate reports** | Lambda triggers QuickSight dataset refresh or generates PDF/CSV via Lambda | Report download/view screen |

**Immediate next step for you:** finish IAM fix on `vestara-admin-approve-project-role-p4un97wl` (Secrets Manager access), then verify with a real approve action end-to-end — Lambda → Aurora write → status change reflected for investors.

---

## 4. AI Features (Weeks 8–14, layered on top of working data flows)

Don't build AI features until the underlying data (projects, investments, users) is reliably flowing — otherwise you're building on sand.

| AI Feature | Approach |
|---|---|
| **AI Investment Analyst** (summary, SWOT, yield, exit scenarios, market trends, risks) | Bedrock (Claude) call with structured prompt, fed project data (budget, location, timeline, valuation docs) → structured JSON output → rendered on project page |
| **AI Portfolio Advisor** (exposure/diversification insights) | Lambda aggregates investor's holdings → Bedrock call reasons over the portfolio → returns advisory text |
| **AI Developer Assistant** (listing generation, investor updates, cash flow forecast, budget risk) | Bedrock calls scoped per task; cash flow forecasting may need a lightweight model/calc layer in addition to LLM reasoning |
| **AI Market Intelligence** | Separate ingestion pipeline (scheduled Lambda / EventBridge) pulling house price indices, interest rates, planning application data from external APIs → stored in Aurora → surfaced via Bedrock-generated commentary |

**Note:** Market Intelligence is the most infra-heavy AI feature — it needs a data ingestion pipeline, not just an LLM call. Consider scoping this last or with reduced ambition for MVP (e.g., manually curated data + AI commentary, rather than full automated ingestion).

---

## 5. Reporting & Analytics (Weeks 12–16)

- **QuickSight** dashboards for admin: investment volume, project pipeline, compliance status
- Feed from Aurora via a QuickSight-compatible data source (direct connection or periodic export)

---

## 6. Testing, Compliance & Launch Prep (Weeks 14–20+)

- Security review of IAM policies (least privilege audit — you're already building this habit)
- FCA/regulatory compliance review (property investment platforms are regulated in the UK — confirm legal requirements before public launch)
- Load testing on API Gateway + Lambda
- Pen testing on auth flows and payment handling
- Beta cohort of investors/developers before public launch

---

## Suggested Build Order (Priority)

1. **Foundation** (auth, DB schema, IAM discipline) — blocks everything
2. **Developer: create listing + upload docs** — you need projects to exist before investors can browse
3. **Admin: approve project** — you're already here
4. **Investor: browse + view summary (static/manual first, AI later) + invest**
5. **AI Investment Analyst** — highest-value AI feature, do this before the others
6. **Investor: portfolio tracking**
7. **AI Portfolio Advisor**
8. **AI Developer Assistant**
9. **QuickSight reporting**
10. **AI Market Intelligence** — most complex, least urgent for MVP

---

## Open Decisions to Make Soon

- **Payments provider** (Stripe Connect vs. alternative) — affects data model
- **KYC provider** — affects signup flow and compliance posture
- **Bedrock model choice** per AI feature (cost vs. quality tradeoff — e.g., Haiku for quick updates, Sonnet/Opus for investment analysis)
- **Regulatory registration status** — this typically gates public launch, not just tech readiness
