# Vestara — deal detail, invest & portfolio backend

Adds three endpoints to your existing API (which already serves `GET /deals`
via Cognito domain `us-west-2xcbkylnie` / client `5rel7shih3irellatp90mk2hoh`):

| Method | Path              | Auth               | Purpose |
|--------|-------------------|--------------------|---------|
| GET    | `/deals/{id}`     | none               | Single deal + cached AI analysis |
| POST   | `/investments`    | Cognito (JWT)      | Record an investment, bump `funding_raised` |
| GET    | `/portfolio`      | Cognito (JWT)      | Caller's holdings, joined with deal info |

## Deploy

1. **Database**: run `schema.sql` against your Aurora PostgreSQL cluster. It
   creates `deals` and `investments` and seeds the three demo deals so the
   API's output matches what `deal-detail.html` already shows as a fallback.

2. **Lambdas**: `cd backend/lambda && npm install` to vendor the `pg`
   driver, since SAM packages `node_modules` alongside the handler.

3. **Deploy the stack**:
   ```
   sam build --template backend/template.yaml
   sam deploy --guided \
     --parameter-overrides \
       DatabaseUrl="postgres://USER:PASS@YOUR-CLUSTER-ENDPOINT:5432/vestara" \
       CognitoUserPoolArn="arn:aws:cognito-idp:us-west-2:ACCOUNT_ID:userpool/POOL_ID" \
       VpcSubnetIds="subnet-aaa,subnet-bbb" \
       VpcSecurityGroupIds="sg-ccc"
   ```
   The Lambdas run inside your VPC so they can reach Aurora directly — use
   the same private subnets/security group your other DB clients use.

4. **Point the frontend at it**: the new API's base URL is in the stack
   output `ApiUrl`. In `deal-detail.html`, set `VESTARA_API_URL` to that
   value (it currently points at the same host as your `/deals` endpoint —
   update if this deploys to a different API Gateway).

## Notes / next steps

- `createInvestment.js` trusts the Cognito authorizer's verified claims for
  `investor_sub` — the client never supplies who the investor is, only
  `deal_id` and `amount`.
- `ai_analysis` on the `deals` table is a JSONB cache slot for the AI
  Investment Analyst's output (summary, SWOT, exit scenarios, market
  trends, key risks) so you don't call Bedrock on every page view. Until
  that generation Lambda exists, `deal-detail.html` builds a reasonable
  mock client-side from the deal's own numbers — swap that out once the
  real analyst is wired up.
- `current_value` on investments is left equal to `amount` at creation
  time; you'll want a scheduled job (EventBridge + Lambda) that revalues
  holdings periodically so the portfolio page shows real gains/losses.
