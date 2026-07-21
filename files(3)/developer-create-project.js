// developer-create-project.js
// Route: POST /developer/projects
// Body:  {
//   "title": "Rainey Fields",
//   "location": "2400 E Cesar Chavez St, Austin, TX",
//   "property_type": "Mixed-use",
//   "est_yield": 8.4,
//   "funding_goal": 500000,
//   "term_years": 3,
//   "description": "..."
// }

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");
const { requireGroup, jsonResponse } = require("./auth");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const DEALS_TABLE = process.env.DEALS_TABLE || "vestara-deals";

const REQUIRED_FIELDS = [
  "title",
  "location",
  "property_type",
  "est_yield",
  "funding_goal",
  "term_years",
];

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
    return jsonResponse(400, {
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  const dealId = randomUUID();
  const now = new Date().toISOString();

  const item = {
    id: dealId,
    title: body.title,
    location: body.location,
    property_type: body.property_type,
    est_yield: Number(body.est_yield),
    funding_goal: Number(body.funding_goal),
    funding_raised: 0,
    term_years: Number(body.term_years),
    description: body.description || "",
    status: "new", // admin must approve before it shows as "live"
    developer_id: claims.sub,
    developer_email: claims.email,
    compliance_reviewed: false,
    docs: [],
    created_at: now,
  };

  await ddb.send(new PutCommand({ TableName: DEALS_TABLE, Item: item }));

  return jsonResponse(201, item);
};
