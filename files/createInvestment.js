// POST /investments
// Protected by the API Gateway Cognito authorizer (see template.yaml) —
// the investor's identity comes from the verified JWT claims, never from
// the request body.
const { Client } = require('pg');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { deal_id, amount } = body;
  const claims = event.requestContext &&
    event.requestContext.authorizer &&
    event.requestContext.authorizer.claims;
  const investorSub = claims && claims.sub;

  if (!investorSub) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
  }
  if (!deal_id || !amount || Number(amount) < 100) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'deal_id and amount (>= 100) are required' }) };
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query('BEGIN');

    const dealRes = await client.query('SELECT * FROM deals WHERE id = $1 FOR UPDATE', [deal_id]);
    if (!dealRes.rows.length) {
      await client.query('ROLLBACK');
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Deal not found' }) };
    }
    const deal = dealRes.rows[0];
    if (deal.status !== 'open') {
      await client.query('ROLLBACK');
      return { statusCode: 409, headers: CORS_HEADERS, body: JSON.stringify({ error: 'This deal is no longer accepting investment' }) };
    }

    const insertRes = await client.query(
      `INSERT INTO investments (investor_sub, deal_id, amount, current_value, status)
       VALUES ($1, $2, $3, $3, 'confirmed') RETURNING id, created_at`,
      [investorSub, deal_id, amount]
    );

    await client.query(
      'UPDATE deals SET funding_raised = funding_raised + $1, updated_at = now() WHERE id = $2',
      [amount, deal_id]
    );

    await client.query('COMMIT');

    return {
      statusCode: 201,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        investment: {
          id: insertRes.rows[0].id,
          deal_id,
          amount: Number(amount),
          status: 'confirmed',
          created_at: insertRes.rows[0].created_at
        }
      })
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('createInvestment error', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Internal error' }) };
  } finally {
    await client.end();
  }
};
