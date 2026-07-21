// GET /deals/{id}
// Returns a single deal, including its cached AI Investment Analyst output
// if one has already been generated (see generateAiAnalysis.js).
const { Client } = require('pg');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS'
};

exports.handler = async (event) => {
  const id = event.pathParameters && event.pathParameters.id;
  if (!id) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing deal id' }) };
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query('SELECT * FROM deals WHERE id = $1', [id]);
    if (!rows.length) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Deal not found' }) };
    }
    const deal = rows[0];
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        deal: {
          id: deal.id,
          title: deal.title,
          location: deal.location,
          property_type: deal.property_type,
          est_yield: Number(deal.est_yield),
          term_years: deal.term_years,
          funding_goal: Number(deal.funding_goal),
          funding_raised: Number(deal.funding_raised),
          risk_rating: deal.risk_rating,
          status: deal.status,
          ai_analysis: deal.ai_analysis || null
        }
      })
    };
  } catch (err) {
    console.error('getDealDetail error', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Internal error' }) };
  } finally {
    await client.end();
  }
};
