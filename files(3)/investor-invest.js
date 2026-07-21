// investor-invest.js
// Route: POST /investor/invest
// Body:  { "deal_id": "abc123", "amount": 250 }
//
// POC behaviour: records the investment and bumps the deal's funding_raised.
// No real payment gateway — amount is just recorded as "confirmed" directly.
// When you're ready for real payments, insert a Stripe PaymentIntent step
// between "validate" and "write investment as confirmed" below, and set
// status to "pending" until the webhook confirms it.

const {
  DynamoDBClient,
} = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");
const { requireAuth, jsonResponse } = require("./auth");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const DEALS_TABLE = process.env.DEALS_TABLE || "vestara-deals";
const INVESTMENTS_TABLE =
  process.env.INVESTMENTS_TABLE || "vestara-investments";
const MIN_INVESTMENT = 100;

exports.handler = async (event) => {
  let claims;
  try {
    claims = await requireAuth(event);
  } catch (e) {
    return jsonResponse(e.statusCode || 401, { error: e.message });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { deal_id, amount } = body;
  if (!deal_id || typeof amount !== "number") {
    return jsonResponse(400, {
      error: "deal_id (string) and amount (number) are required",
    });
  }
  if (amount < MIN_INVESTMENT) {
    return jsonResponse(400, {
      error: `Minimum investment is £${MIN_INVESTMENT}`,
    });
  }

  // Load the deal to validate it's actually investable right now.
  const dealResult = await ddb.send(
    new GetCommand({ TableName: DEALS_TABLE, Key: { id: deal_id } })
  );
  const deal = dealResult.Item;
  if (!deal) {
    return jsonResponse(404, { error: "Deal not found" });
  }
  if (deal.status !== "live") {
    return jsonResponse(400, {
      error: `Deal is not open for investment (status: ${deal.status})`,
    });
  }

  const goal = parseFloat(deal.funding_goal) || 0;
  const raised = parseFloat(deal.funding_raised) || 0;
  if (goal > 0 && raised + amount > goal) {
    return jsonResponse(400, {
      error: `This investment would exceed the funding goal. £${(
        goal - raised
      ).toFixed(2)} remaining.`,
    });
  }

  const investmentId = randomUUID();
  const now = new Date().toISOString();

  // Write the investment record.
  await ddb.send(
    new PutCommand({
      TableName: INVESTMENTS_TABLE,
      Item: {
        investment_id: investmentId,
        investor_id: claims.sub,
        investor_email: claims.email,
        deal_id,
        amount,
        status: "confirmed", // POC: no payment gateway, so confirm immediately
        created_at: now,
      },
    })
  );

  // Bump the deal's funding_raised.
  await ddb.send(
    new UpdateCommand({
      TableName: DEALS_TABLE,
      Key: { id: deal_id },
      UpdateExpression:
        "SET funding_raised = if_not_exists(funding_raised, :zero) + :amount",
      ExpressionAttributeValues: { ":amount": amount, ":zero": 0 },
    })
  );

  return jsonResponse(200, {
    investment_id: investmentId,
    status: "confirmed",
    deal_id,
    amount,
  });
};
