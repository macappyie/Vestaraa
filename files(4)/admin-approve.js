// admin-approve.js — REWRITTEN for Aurora PostgreSQL via RDS Data API
// Route: POST /admin/projects/{id}/approve
// Body:  { "admin_id": "...", "action": "approve" | "reject", "notes": "" }
//
// Note: the existing get-deals.py treats status = 'active' as the "live"
// status shown to investors. We follow that convention here (not "live").

const { RDSDataClient, ExecuteStatementCommand } = require("@aws-sdk/client-rds-data");
const { requireGroup, jsonResponse } = require("./auth");

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
    claims = await requireGroup(event, "Admins");
  } catch (e) {
    return jsonResponse(e.statusCode || 401, { error: e.message });
  }

  const dealId = event.pathParameters?.id;
  if (!dealId) {
    return jsonResponse(400, { error: "Missing deal id in path" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { action, notes } = body;
  if (action !== "approve" && action !== "reject") {
    return jsonResponse(400, { error: 'action must be "approve" or "reject"' });
  }

  const existing = await runSql(`SELECT id FROM deals WHERE id = :id`, [
    { name: "id", value: { stringValue: dealId } },
  ]);
  if (!existing[0]) {
    return jsonResponse(404, { error: "Deal not found" });
  }

  const newStatus = action === "approve" ? "active" : "rejected";

  await runSql(
    `UPDATE deals
     SET status = :status, reviewed_by = :reviewer, reviewed_at = now(), review_notes = :notes
     WHERE id = :id`,
    [
      { name: "status", value: { stringValue: newStatus } },
      { name: "reviewer", value: { stringValue: claims.email || claims.sub } },
      { name: "notes", value: { stringValue: notes || "" } },
      { name: "id", value: { stringValue: dealId } },
    ]
  );

  return jsonResponse(200, { deal_id: dealId, status: newStatus });
};
