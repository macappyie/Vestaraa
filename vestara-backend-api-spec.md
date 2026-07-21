# Vestara — Backend API Spec (Phase 1 gaps)

This lists every endpoint the frontend currently expects but that doesn't exist yet. The frontend (`index.html`, `dashboard.html`, `admin.html`, `developer.html`) is already built and wired to call these once they exist — every "coming soon" alert in the UI marks exactly where.

**What already exists and works today:**
```
GET https://ge2o0vbuo0.execute-api.us-west-2.amazonaws.com/deals
```
Returns `{ "deals": [ { title, location, property_type, est_yield, term_years, funding_goal, funding_raised, status }, ... ] }`

Everything below is new.

---

## 1. Investor — identity verification (KYC/AML)

Currently sign-up/login works (Cognito), but there's no actual identity check after that.

| Endpoint | Method | Purpose |
|---|---|---|
| `/investor/kyc` | `POST` | Submit ID documents for verification (likely proxies to a third-party KYC provider — Persona, Onfido, or Stripe Identity) |
| `/investor/kyc/status` | `GET` | Check current verification status (`pending`, `verified`, `rejected`) |

**Request body (`POST /investor/kyc`):** `{ "user_id": "...", "document_type": "passport|drivers_license", "document_front": "<file/base64>", "document_back": "<file/base64>" }`
**Response:** `{ "status": "pending" }`

---

## 2. Investor — investing

| Endpoint | Method | Purpose |
|---|---|---|
| `/investor/invest` | `POST` | Commit funds to a project (min £100) |
| `/investor/{user_id}/portfolio` | `GET` | Return the investor's real holdings, current value, and returns |

**Request body (`POST /investor/invest`):**
```json
{ "user_id": "...", "project_id": "...", "amount_gbp": 250 }
```
**Response:** `{ "investment_id": "...", "status": "confirmed" }`
Note: this will need real payment handling (Stripe/GoCardless or similar) behind it — this endpoint alone isn't a full payments integration.

**Response (`GET /investor/{user_id}/portfolio`):**
```json
{
  "total_invested_gbp": 1200,
  "current_value_gbp": 1340,
  "avg_yield_pct": 8.1,
  "holdings": [
    { "project_id": "...", "title": "...", "amount_gbp": 500, "current_value_gbp": 540, "status": "active" }
  ]
}
```

---

## 3. Developer — project management

| Endpoint | Method | Purpose |
|---|---|---|
| `/developer/projects` | `POST` | Create a new listing (goes into admin approval queue, status = `pending`) |
| `/developer/projects/{id}` | `PUT` | Edit an existing listing |
| `/developer/{developer_id}/projects` | `GET` | List only this developer's own projects (the current `/deals` endpoint has no owner field, so `developer.html` currently shows everyone's projects — this fixes that) |

**Request body (`POST /developer/projects`):**
```json
{
  "developer_id": "...",
  "title": "Ashwood Riverside Apartments",
  "location": "Manchester, UK",
  "property_type": "Residential",
  "funding_goal": 500000,
  "term_years": 5,
  "est_yield": 8.4,
  "description": "..."
}
```
**Response:** `{ "project_id": "...", "status": "pending" }`

**⚠️ Data model note:** every `deals` record needs a new `developer_id` field going forward so ownership can be tracked. Without it, points above can't actually filter to "my projects."

---

## 4. Developer — documents

| Endpoint | Method | Purpose |
|---|---|---|
| `/developer/projects/{id}/documents` | `POST` | Upload plans, valuation reports, budgets, timelines |
| `/developer/projects/{id}/documents` | `GET` | List uploaded documents for a project |

**Request:** multipart file upload, or a two-step pattern: `POST` returns a pre-signed S3 upload URL, frontend uploads directly to S3.
```json
{ "document_type": "plans|valuation|budget|timeline", "file_name": "..." }
```
**Response:** `{ "upload_url": "https://s3...", "document_id": "..." }`

**Needs:** an S3 bucket for document storage, and access rules (developer can upload/view own, admin can view all).

---

## 5. Developer — construction progress

| Endpoint | Method | Purpose |
|---|---|---|
| `/developer/projects/{id}/progress` | `POST` | Publish a construction update (% complete, notes, photos) — this is what should feed the investor's "Track returns and updates" feed |

**Request body:**
```json
{ "percent_complete": 45, "notes": "Foundation work complete, framing begins next week.", "photo_urls": ["..."] }
```
**Response:** `{ "update_id": "...", "published_at": "..." }`

This is the piece that connects developer updates → investor dashboard. Without it, the "track returns and project updates" investor requirement has nothing to display.

---

## 6. Admin — approvals & compliance

| Endpoint | Method | Purpose |
|---|---|---|
| `/admin/projects/{id}/approve` | `POST` | Approve a pending project — makes it visible on `/deals` |
| `/admin/projects/{id}/reject` | `POST` | Reject with a reason |
| `/admin/compliance/{id}/review` | `POST` | Mark a compliance checklist item reviewed |
| `/admin/compliance/queue` | `GET` | List everything awaiting compliance sign-off (projects and/or investors) |

**Request body (`POST /admin/projects/{id}/approve`):** `{ "admin_id": "...", "notes": "..." }`
**Request body (`POST /admin/projects/{id}/reject`):** `{ "admin_id": "...", "reason": "..." }`

---

## 7. Admin — monitoring & reports

| Endpoint | Method | Purpose |
|---|---|---|
| `/admin/investments` | `GET` | Platform-wide investment exposure (per project, per investor) — flag concentration/unusual activity |
| `/admin/reports/investments` | `GET` | Generate investment report (CSV/PDF export) |
| `/admin/reports/compliance` | `GET` | Generate compliance report |

**Response (`GET /admin/investments`):**
```json
{
  "total_platform_invested_gbp": 890000,
  "flagged_count": 2,
  "by_project": [ { "project_id": "...", "raised_gbp": 74000, "investor_count": 41 } ]
}
```

Reports endpoints should accept a `format=csv|pdf` query param and either stream the file directly or return a download URL.

---

## 8. AI features (all four systems — currently zero backend, only static marketing copy on the homepage)

| Endpoint | Method | Purpose |
|---|---|---|
| `/ai/investment-summary/{project_id}` | `GET` | Plain-English summary, SWOT, estimated yield, exit scenarios, local market trends, key risks for one project |
| `/ai/portfolio-advice/{investor_id}` | `GET` | Concentration/diversification guidance based on the investor's actual holdings |
| `/ai/developer-assistant` | `POST` | Draft a listing from source docs, generate investor updates, forecast cash flow, flag budget risk |
| `/ai/market-intelligence` | `GET` | Aggregated read on house prices, interest rates, rental demand, planning applications, economic indicators |

These will likely call an LLM (e.g. the Anthropic API) server-side, feeding in project data, and should cache results rather than regenerating on every page view.

**Response (`GET /ai/investment-summary/{project_id}`) — example shape:**
```json
{
  "summary": "...",
  "swot": { "strengths": ["..."], "weaknesses": ["..."], "opportunities": ["..."], "threats": ["..."] },
  "estimated_yield_pct": 8.4,
  "exit_scenarios": ["..."],
  "market_trends": "...",
  "key_risks": ["..."]
}
```

---

## Suggested build order (matches frontend priority)

1. **Data model change**: add `developer_id` and `status` (`pending`/`approved`/`rejected`) fields to the deals table — almost everything below depends on this.
2. **Admin approve/reject** (§6) — nothing else in the pipeline matters until this exists.
3. **Developer create/edit/documents** (§3, §4) — so there's something for admin to approve.
4. **Developer progress updates** (§5) — completes the developer-to-investor update loop.
5. **Investor KYC** (§1) — required before real money moves.
6. **Investor invest + portfolio** (§2) — the core revenue feature; needs a payments provider decision first.
7. **AI Investment Analyst** (§8, first endpoint) — highest investor-facing value of the four AI features.
8. **Remaining AI features + admin reports/monitoring** (§6 reports, §8 remaining) — round out the platform.

---

## Open questions for whoever builds this

- **Payments provider**: Stripe, GoCardless, or something else, for the actual investment flow?
- **Document storage**: confirm S3 bucket + access policy (developer upload, admin/investor view).
- **AI provider**: which LLM API for the four AI features, and what's the budget for per-request cost given these will run frequently (e.g. every project summary view)?
- **Auth on new endpoints**: all of these need to check the Cognito JWT and enforce role (investor/developer/admin) — is there already a role field in Cognito user attributes, or does that need adding?
