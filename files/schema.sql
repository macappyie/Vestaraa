-- Vestara core schema — Aurora PostgreSQL
-- Run against your Aurora Serverless v2 / Aurora PostgreSQL cluster.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS deals (
  id               TEXT PRIMARY KEY,               -- slug, e.g. 'rainey-fields'
  title            TEXT NOT NULL,
  location         TEXT NOT NULL,
  property_type    TEXT NOT NULL,
  est_yield        NUMERIC(5,2) NOT NULL,
  term_years       INTEGER NOT NULL,
  funding_goal     NUMERIC(14,2) NOT NULL,
  funding_raised   NUMERIC(14,2) NOT NULL DEFAULT 0,
  risk_rating      TEXT NOT NULL DEFAULT 'Low risk',
  status           TEXT NOT NULL DEFAULT 'open',    -- open | funded | closed
  ai_analysis      JSONB,                            -- cached AI Investment Analyst output
  created_by       TEXT,                             -- developer's Cognito sub
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  investor_sub     TEXT NOT NULL,                    -- investor's Cognito sub (from JWT)
  deal_id          TEXT NOT NULL REFERENCES deals(id),
  amount           NUMERIC(14,2) NOT NULL CHECK (amount >= 100),
  current_value    NUMERIC(14,2),                    -- updated periodically; NULL = same as amount
  status           TEXT NOT NULL DEFAULT 'confirmed', -- pending | confirmed | exited
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investments_investor ON investments(investor_sub);
CREATE INDEX IF NOT EXISTS idx_investments_deal ON investments(deal_id);

-- Seed the three demo deals shown on the marketing site, so the API
-- returns real data that matches deal-detail.html's fallback content.
INSERT INTO deals (id, title, location, property_type, est_yield, term_years, funding_goal, funding_raised, risk_rating)
VALUES
  ('rainey-fields', 'Rainey Fields', '2400 E Cesar Chavez St, Austin, TX', 'Mixed-use residential', 8.4, 3, 4200000, 3108000, 'Low risk'),
  ('larimer-row', 'Larimer Row', '2900 Larimer St, Denver, CO', 'Boutique retail + residential', 7.1, 4, 2600000, 1066000, 'Low risk'),
  ('steele-creek-logistics', 'Steele Creek Logistics', '9500 Steele Creek Rd, Charlotte, NC', 'Industrial / logistics', 10.2, 5, 5800000, 1044000, 'Watch')
ON CONFLICT (id) DO NOTHING;
