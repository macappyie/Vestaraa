// GET /portfolio
// Protected by the API Gateway Cognito authorizer. Returns every
// investment belonging to the caller, joined with the deal it's in,
// in the shape dashboard.html's renderPortfolio() expects.
const { Client } = require('pg');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS'
};

exports.handler = async (event) => {
  const claims = event.requestContext &&
    event.requestContext.authorizer &&
    event.requestContext.authorizer.claims;
  const investorSub = claims && claims.sub;

  if (!investorSub) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT i.id, i.deal_id, i.amount, i.current_value, i.status, i.created_at,
              d.title, d.location, d.est_yield, d.term_years
       FROM investments i
       JOIN deals d ON d.id = i.deal_id
       WHERE i.investor_sub = $1
       ORDER BY i.created_at DESC`,
      [investorSub]
    );

    const holdings = rows.map((r) => ({
      investment_id: r.id,
      deal_id: r.deal_id,
      title: r.title,
      location: r.location,
      amount: Number(r.amount),
      current_value: r.current_value != null ? Number(r.current_value) : Number(r.amount),
      est_yield: Number(r.est_yield),
      term_years: r.term_years,
      status: r.status,
      created_at: r.created_at
    }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ holdings }) };
  } catch (err) {
    console.error('getPortfolio error', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Internal error' }) };
  } finally {
    await client.end();
  }
};
