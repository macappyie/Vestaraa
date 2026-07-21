# Wiring up deal-detail, invest & portfolio — console steps

Matches what's already running: Aurora cluster `vestara`, Lambda `get-deals`
(Python, RDS Data API), HTTP API `vestara-api` (`ge2o0vbuo0`), S3 bucket
`vestara-frontend-2026`, CloudFront `vestara-frontend`.

## 1. Create the tables

Aurora console → **Databases → vestara → Query editor**. Connect to the
`vestara` cluster and run `schema.sql` (attached separately). It's
idempotent — safe to run even if `deals` already has rows from `get-deals`,
it won't overwrite existing ones.

If your `deals` table already exists with different column names than what
`get-deals.py` expects, adjust `schema.sql` to match rather than the other
way around — I don't have visibility into its exact current shape from the
screenshots.

## 2. Create three Lambda functions

Same pattern as `get-deals`: Python runtime, paste the code, deploy.

- **`get-deal-detail`** — paste `get-deal-detail.py`
- **`create-investment`** — paste `create-investment.py`
- **`get-portfolio`** — paste `get-portfolio.py`

For each: **Configuration → Environment variables** — copy the same
`DB_CLUSTER_ARN`, `DB_SECRET_ARN`, and `DB_NAME` values `get-deals` uses.

**Configuration → Permissions** — attach the same execution role
`get-deals` uses (or copy its policy) so these have `rds-data:ExecuteStatement`,
`rds-data:BeginTransaction`, `rds-data:CommitTransaction`,
`rds-data:RollbackTransaction`, and `secretsmanager:GetSecretValue`.

## 3. Add routes in API Gateway

`API Gateway → vestara-api → Routes → Create`:

| Route | Integration |
|---|---|
| `GET /deals/{id}` | `get-deal-detail` |
| `POST /investments` | `create-investment` |
| `GET /portfolio` | `get-portfolio` |

## 4. Add a Cognito authorizer, attach it to the two protected routes

`API Gateway → vestara-api → Authorization → Create`:
- Type: **JWT**
- Identity source: `$request.header.Authorization`
- Issuer URL: `https://cognito-idp.us-west-2.amazonaws.com/<your-user-pool-id>`
- Audience: `5rel7shih3irellatp90mk2hoh` (your app client id)

Then on **Routes**, select `POST /investments` and `GET /portfolio` →
**Attach authorizer** → pick the one you just created. Leave
`GET /deals/{id}` (and `GET /deals`) public.

With `$default` stage auto-deploy enabled (it is, per your screenshot),
these go live as soon as you save — no manual deploy step needed.

## 5. Upload the frontend

`S3 → vestara-frontend-2026 → Upload` → add `deal-detail.html`, and
re-upload `index.html` / `dashboard.html` (both were edited to link to it).

Then `CloudFront → vestara-frontend → Invalidations → Create` with path
`/*`, so the edge caches don't keep serving the old versions.

## Notes

- `deal-detail.html`'s `VESTARA_API_URL` is already set to
  `https://ge2o0vbuo0.execute-api.us-west-2.amazonaws.com` — matches your
  API's invoke URL, no change needed there.
- `ai_analysis` on `deals` is a place to cache real AI Investment Analyst
  output (Bedrock) later. Until you build that, the page generates a
  reasonable mock client-side from the deal's own numbers.
- `current_value` on investments starts equal to `amount`. You'll want a
  scheduled job (EventBridge → Lambda) to revalue holdings periodically so
  the portfolio page shows real gains/losses over time.
