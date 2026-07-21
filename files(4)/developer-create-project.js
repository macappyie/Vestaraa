// developer-create-project.js — REWRITTEN for Aurora PostgreSQL via RDS Data API
// Route: POST /developer/projects

const { RDSDataClient, ExecuteStatementCommand } = require("@aws-sdk/client-rds-data");
const { randomUUID } = require("crypto");
const { requireGroup, jsonResponse } = require("./auth");

const rds = new RDSDataClient({});
const CLUSTER_ARN = process.env.DB_CLUSTER_ARN;
const SECRET_ARN = process.env.DB_SECRET_ARN;
const DATABASE_NAME = process.env.DB_NAME || "postgres";

const REQUIRED_FIELDS = [
  "title",
  "location",
  "property_type",
  "est_yield",
  "funding_goal",
  "term_years",
];

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
    claims = await requireGroup(event, "Developers");
  } catch (e) {
    return jsonResponse(e.statusCode || 401, { error: e.message });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const missing = REQUIRED_FIELDS.filter((f) => body[f] === undefined || body[f] === "");
  if (missing.length) {
    return jsonResponse(400, { error: `Missing required fields: ${missing.join(", ")}` });
  }

  const dealId = randomUUID();

  const inserted = await runSql(
    `INSERT INTO deals
       (id, title, location, property_type, est_yield, funding_goal, funding_raised,
        term_years, status, developer_id, developer_email, description, created_at)
     VALUES
       (:id, :title, :location, :property_type, :est_yield, :funding_goal, 0,
        :term_years, 'new', :developer_id, :developer_email, :description, now())
     RETURNING id, title, location, property_type, est_yield, funding_goal,
               funding_raised, term_years, status`,
    [
      { name: "id", value: { stringValue: dealId } },
      { name: "title", value: { stringValue: body.title } },
      { name: "location", value: { stringValue: body.location } },
      { name: "property_type", value: { stringValue: body.property_type } },
      { name: "est_yield", value: { doubleValue: Number(body.est_yield) } },
      { name: "funding_goal", value: { doubleValue: Number(body.funding_goal) } },
      { name: "term_years", value: { longValue: Number(body.term_years) } },
      { name: "developer_id", value: { stringValue: claims.sub } },
      { name: "developer_email", value: { stringValue: claims.email || "" } },
      { name: "description", value: { stringValue: body.description || "" } },
    ]
  );

  return jsonResponse(201, inserted[0]);
};
