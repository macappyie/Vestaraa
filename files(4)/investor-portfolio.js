// investor-portfolio.js — REWRITTEN for Aurora PostgreSQL via RDS Data API
// Route: GET /investor/portfolio

const { RDSDataClient, ExecuteStatementCommand } = require("@aws-sdk/client-rds-data");
const { requireAuth, jsonResponse } = require("./auth");

const rds = new RDSDataClient({});
const CLUSTER_ARN = process.env.DB_CLUSTER_ARN;
const SECRET_ARN = process.env.DB_SECRET_ARN;
const DATABASE_NAME = process.env.DB_NAME || "postgres";

async function runSql(sql, parameters = []) {
  const command = new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN,
    secretArn: SECRET_ARN,
    database: DATABASE_NAME,
    sql,
    parameters,
    formatRecordsAs: "JSON",
  });
  const response = await rds.send(command);
  return response.formattedRecords ? JSON.parse(response.formattedRecords) : [];
}

exports.handler = async (event) => {
  let claims;
  try {
    claims = await requireAuth(event);
  } catch (e) {
    return jsonResponse(e.statusCode || 401, { error: e.message });
  }

  const holdings = await runSql(
    `SELECT i.investment_id, i.deal_id, i.amount, i.created_at AS invested_at,
            d.title, d.location, d.est_yield
     FROM investments i
     JOIN deals d ON d.id = i.deal_id
     WHERE i.investor_id = :investor_id AND i.status = 'confirmed'
     ORDER BY i.created_at DESC`,
    [{ name: "investor_id", value: { stringValue: claims.sub } }]
  );

  if (holdings.length === 0) {
    return jsonResponse(200, {
      total_invested: 0,
      current_est_value: 0,
      avg_est_yield: null,
      holdings: [],
    });
  }

  let totalInvested = 0;
  let yieldWeightedSum = 0;
  holdings.forEach((h) => {
    const amount = parseFloat(h.amount) || 0;
    const estYield = parseFloat(h.est_yield) || 0;
    totalInvested += amount;
    yieldWeightedSum += amount * estYield;
  });

  const avgYield = totalInvested > 0 ? yieldWeightedSum / totalInvested : null;
  const currentEstValue = totalInvested; // placeholder valuation — see note in original plan

  return jsonResponse(200, {
    total_invested: totalInvested,
    current_est_value: currentEstValue,
    avg_est_yield: avgYield !== null ? Number(avgYield.toFixed(2)) : null,
    holdings,
  });
};
