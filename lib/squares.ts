// Board squares, from the official Transform! v1 board images (strategytools.io). The v2 board the
// Duke session uses may differ - "Other" covers anything not listed.
export const ROLL_COST = 100_000;
export const SQUARES = [
  { name: "GOAL / START", effect: "Settle annual financials, chart your market valuation" },
  { name: "Innovation Strategy", effect: "Pick 1 Innovation Strategy card" },
  { name: "Invest in Leadership", effect: "Invest 10M & get the Super CEO card" },
  { name: "Back Office", effect: "Pay 2 million" },
  { name: "Strategy Jam", effect: "1 core business model + 3M cash, or 3 Explore business models" },
  { name: "Increasing OPEX", effect: "Pay 2.5M" },
  { name: "Foresight", effect: "Fire them: get 1M, or listen: take 2 Weak Signal cards" },
  { name: "Customer Delight", effect: "Get 1M for each Core business" },
  { name: "Capital Markets Day", effect: "Count your cash; over 20M gives 1 Buy analyst card" },
  { name: "Transformation Awards", effect: "A Buy analyst card for every Explore model" },
  { name: "Strategic Acquisition", effect: "Buy for 4M?" },
  { name: "Cultural Wars", effect: "Move back to start, or use the Super CEO card" },
  { name: "Tax Fraud", effect: "Pay 20 million" },
  { name: "Quarterly Earnings", effect: "Get 1M cash" },
  { name: "Management Crisis", effect: "Move back to start" },
  { name: "Cut or Growth?", effect: "Cut cost: get 5M, or invest 2M: get 4 new business models" },
  { name: "First Analyst Introduction", effect: "Get 1 analyst card; 1 business model required per analyst rating level (1-5)" },
  { name: "Lunch with Financial Times", effect: "Pay 200K" },
  { name: "Invest in New Business Models", effect: "Invest 3M for 3 new business model cards" },
  { name: "Pitch the Table", effect: "60 seconds, get 50.000" },
  { name: "Business as Usual", effect: "Get 500.000 in revenue" },
  { name: "Drew a card", effect: "The square told us to draw a card (BOOM!, BUST!, Weak Signal, Market News, Strategic Dilemma...)" },
  { name: "Other", effect: "A square not on this list - describe it" },
] as const;
