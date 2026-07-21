// investor-portfolio.js
// Route: GET /investor/portfolio
//
// Returns the caller's investments joined with current deal info, so
// dashboard.html can replace its hardcoded £0 summary cards with real data.
//
// Requires a Global Secondary Index on vestara-investments:
//   GSI name: "investor_id-index"
//   Partition key: investor_id (S)
// (Create this in the DynamoDB console/CLI before deploying — see
//  DEPLOY.md step 2.)

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchGetCommand,
} = require("@aws-sdk/lib-dynamodb");
const { requireAuth, jsonResponse } = require("./auth");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const DEALS_TABLE = process.env.DEALS_TABLE || "vestara-deals";
const INVESTMENTS_TABLE =
  process.env.INVESTMENTS_TABLE || "vestara-investments";

exports.handler = async (event) => {
  let claims;
  try {
    claims = await requireAuth(event);
  } catch (e) {
    return jsonResponse(e.statusCode || 401, { error: e.message });
  }

  const investmentsResult = await ddb.send(
    new QueryCommand({
      TableName: INVESTMENTS_TABLE,
      IndexName: "investor_id-index",
      KeyConditionExpression: "investor_id = :id",
      ExpressionAttributeValues: { ":id": claims.sub },
    })
  );
  const investments = investmentsResult.Items || [];

  if (investments.length === 0) {
    return jsonResponse(200, {
      total_invested: 0,
      current_est_value: 0,
      avg_est_yield: null,
      holdings: [],
    });
  }

  // Fetch the deals these investments belong to (for title/yield display).
  const dealIds = [...new Set(investments.map((inv) => inv.deal_id))];
  const dealsResult = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [DEALS_TABLE]: { Keys: dealIds.map((id) => ({ id })) },
      },
    })
  );
  const dealsById = {};
  (dealsResult.Responses?.[DEALS_TABLE] || []).forEach((d) => {
    dealsById[d.id] = d;
  });

  let totalInvested = 0;
  let yieldWeightedSum = 0;
  const holdings = investments
    .filter((inv) => inv.status === "confirmed")
    .map((inv) => {
      const deal = dealsById[inv.deal_id] || {};
      const amount = parseFloat(inv.amount) || 0;
      const estYield = parseFloat(deal.est_yield) || 0;
      totalInvested += amount;
      yieldWeightedSum += amount * estYield;
      return {
        investment_id: inv.investment_id,
        deal_id: inv.deal_id,
        title: deal.title || "Unknown project",
        location: deal.location || "",
        amount,
        est_yield: estYield,
        invested_at: inv.created_at,
      };
    });

  const avgYield =
    totalInvested > 0 ? yieldWeightedSum / totalInvested : null;

  // Simple current-value estimate for the POC: principal + (yield * time-held).
  // Replace with real valuation logic once you have a source of truth for it.
  const currentEstValue = totalInvested; // placeholder — see note above

  return jsonResponse(200, {
    total_invested: totalInvested,
    current_est_value: currentEstValue,
    avg_est_yield: avgYield !== null ? Number(avgYield.toFixed(2)) : null,
    holdings,
  });
};
