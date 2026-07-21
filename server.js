/*
  Vestara — Checkout backend
  --------------------------
  This is the ONLY place the Stripe secret key should ever live.
  Deploy this small server separately from your static CloudFront site —
  e.g. on Render, Railway, Vercel (as a serverless function), or Fly.io.
  CloudFront cannot run this file itself; it only serves static HTML/JS.

  Setup:
    1. npm init -y
    2. npm install express stripe cors
    3. Set the STRIPE_SECRET_KEY environment variable on your hosting
       platform's dashboard (do NOT paste the key directly in this file,
       and do NOT commit it to git).
    4. node server.js
    5. Put the resulting URL into BACKEND_URL in invest-widget.html
*/

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY); // read from env, never hardcode
const app = express();

app.use(cors());
app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { dealName, amountGBP } = req.body;

    if (!amountGBP || amountGBP < 100) {
      return res.status(400).json({ error: "Minimum investment is £100." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: "Investment: " + (dealName || "Vestara Deal"),
              description: "Simulated investment on Vestara (sandbox/demo)"
            },
            unit_amount: Math.round(amountGBP * 100) // pence
          },
          quantity: 1
        }
      ],
      success_url: "https://d2ua02znp13fke.cloudfront.net/?invest=success",
      cancel_url: "https://d2ua02znp13fke.cloudfront.net/?invest=cancelled"
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong starting checkout." });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log("Vestara checkout backend running on port " + PORT));
