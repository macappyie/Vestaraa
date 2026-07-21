# Deploying these Lambdas — step by step (AWS Console)

This assumes you already have the Cognito User Pool + API Gateway from the
existing `/deals` endpoint, and are just adding routes to the same API.

## 0. Find your existing setup

- Go to **Cognito → User pools** → open the pool used by `index.html`.
  Copy the **User pool ID** (looks like `us-west-2_xxxxxxxxx`) — you'll need
  it as `COGNITO_USER_POOL_ID`.
- Go to **API Gateway** → find the API behind
  `ge2o0vbuo0.execute-api.us-west-2.amazonaws.com` → note its name, you'll
  add new routes to this same API.

## 1. Create the new DynamoDB table

`vestara-investments`:
- Partition key: `investment_id` (String)
- After creating, go to the table → **Indexes** tab → **Create index**:
  - Partition key: `investor_id` (String)
  - Index name: `investor_id-index`
  - (this powers `investor-portfolio.js`)

Confirm your existing `vestara-deals` table's partition key is `id` (String) —
all the Lambda code above assumes this. Adjust the `Key: { id: ... }` lines
in the code if your actual key name differs.

## 2. Package each Lambda

For each `.js` file in `lambda/` (except `auth.js`, which is shared):

```bash
cd lambda
npm install
zip -r investor-invest.zip investor-invest.js auth.js node_modules package.json
zip -r investor-portfolio.zip investor-portfolio.js auth.js node_modules package.json
zip -r admin-approve.zip admin-approve.js auth.js node_modules package.json
zip -r developer-create-project.zip developer-create-project.js auth.js node_modules package.json
```

## 3. Create each Lambda function

For each zip file, in **Lambda → Create function**:
- Runtime: **Node.js 20.x**
- Upload the corresponding `.zip`
- Set **Handler** to `<filename-without-extension>.handler`
  (e.g. `investor-invest.handler`)
- Under **Configuration → Environment variables**, add:
  - `COGNITO_USER_POOL_ID` = (from step 0)
  - `COGNITO_CLIENT_ID` = `5rel7shih3irellatp90mk2hoh`
  - `DEALS_TABLE` = `vestara-deals`
  - `INVESTMENTS_TABLE` = `vestara-investments`
- Under **Configuration → Permissions**, open the execution role and attach
  a policy allowing `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `Query`,
  `BatchGetItem` on the two tables above (scope to those table ARNs).

## 4. Wire up API Gateway routes

In the existing HTTP API, add these routes, each pointing to its matching
Lambda as integration:

| Method | Route | Lambda |
|---|---|---|
| POST | `/investor/invest` | investor-invest |
| GET | `/investor/portfolio` | investor-portfolio |
| POST | `/admin/projects/{id}/approve` | admin-approve |
| POST | `/developer/projects` | developer-create-project |

For each route, also enable **CORS** the same way the existing `/deals`
route is configured (the Lambda code already returns
`Access-Control-Allow-Origin: *` headers, but API Gateway needs OPTIONS
preflight handling enabled too if it isn't already global on this API).

## 5. Test

```bash
# Get a fresh id_token by signing in on the live site, then check
# sessionStorage in devtools for id_token, then:

curl -X POST https://ge2o0vbuo0.execute-api.us-west-2.amazonaws.com/investor/invest \
  -H "Authorization: Bearer <id_token>" \
  -H "Content-Type: application/json" \
  -d '{"deal_id":"<a real deal id from /deals>","amount":100}'
```

## 6. Frontend changes needed

- `admin.html` — **none**, it already calls the right endpoint.
- `developer.html` — the "Publish new project" form currently has no submit
  handler wired to a fetch call. That's the next piece to build once these
  four are confirmed working — say the word and I'll wire it.
- `dashboard.html` — replace the hardcoded `£0` summary cards with a
  `fetch(VESTARA_API_URL.replace('/deals','/investor/portfolio'))` call, and
  wire the "Invest" button's `alert(...)` to a real
  `fetch('/investor/invest', {...})` call with an amount input. I can write
  this next once the backend is deployed and tested.
