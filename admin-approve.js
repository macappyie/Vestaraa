// admin-approve.js
// Route: POST /admin/projects/{id}/approve
// Body:  { "admin_id": "...", "action": "approve" | "reject", "notes": "" }
//
// This is the exact endpoint admin.html's adminAction() already calls —
// no frontend changes needed, just deploy this and wire the route.
//
// Note: admin_id in the body is for display/logging only. The REAL identity
// check is the requireGroup("Admins") call below — never trust the body.

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");
const { requireGroup, jsonResponse } = require("./auth");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const DEALS_TABLE = process.env.DEALS_TABLE || "vestara-deals";

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
    return jsonResponse(400, {
      error: 'action must be "approve" or "reject"',
    });
  }

  const existing = await ddb.send(
    new GetCommand({ TableName: DEALS_TABLE, Key: { id: dealId } })
  );
  if (!existing.Item) {
    return jsonResponse(404, { error: "Deal not found" });
  }

  const newStatus = action === "approve" ? "live" : "rejected";

  await ddb.send(
    new UpdateCommand({
      TableName: DEALS_TABLE,
      Key: { id: dealId },
      UpdateExpression:
        "SET #status = :status, reviewed_by = :reviewer, reviewed_at = :now, review_notes = :notes",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": newStatus,
        ":reviewer": claims.email || claims.sub,
        ":now": new Date().toISOString(),
        ":notes": notes || "",
      },
    })
  );

  return jsonResponse(200, { deal_id: dealId, status: newStatus });
};
