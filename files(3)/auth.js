// auth.js — shared helper for verifying Cognito JWTs inside Lambda.
// Used by every protected endpoint so we never trust the frontend's own
// (unverified) JWT decode for authorization decisions.
//
// npm install aws-jwt-verify

const { CognitoJwtVerifier } = require("aws-jwt-verify");

// Fill these in from your Cognito User Pool (same pool used by index.html's
// COGNITO_DOMAIN / COGNITO_CLIENT_ID).
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID; // e.g. "us-west-2_xxxxxxxxx"
const CLIENT_ID = process.env.COGNITO_CLIENT_ID; // "5rel7shih3irellatp90mk2hoh"

const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: "id", // frontend sends the id_token, not access_token
  clientId: CLIENT_ID,
});

/**
 * Verifies the Authorization header and returns decoded claims.
 * Throws if missing/invalid — callers should catch and return 401.
 */
async function requireAuth(event) {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const err = new Error("Missing Authorization header");
    err.statusCode = 401;
    throw err;
  }
  const token = authHeader.slice("Bearer ".length);
  try {
    const claims = await verifier.verify(token);
    return claims; // includes sub, email, "cognito:groups", etc.
  } catch (e) {
    const err = new Error("Invalid or expired token");
    err.statusCode = 401;
    throw err;
  }
}

/**
 * Same as requireAuth but also checks the caller belongs to `groupName`
 * (e.g. "Admins" or "Developers"). Throws 403 if not a member.
 */
async function requireGroup(event, groupName) {
  const claims = await requireAuth(event);
  const groups = claims["cognito:groups"] || [];
  if (!groups.includes(groupName)) {
    const err = new Error(`Requires ${groupName} group membership`);
    err.statusCode = 403;
    throw err;
  }
  return claims;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // Match the CORS behaviour your existing /deals endpoint already uses.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

module.exports = { requireAuth, requireGroup, jsonResponse };
