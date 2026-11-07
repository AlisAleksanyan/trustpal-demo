# TrustPal

**Good deeds should count.** TrustPal connects people with causes that need money, time, and skills. AI helps structure contribution opportunities; PayPal Sandbox records financial contributions; authorized human reviewers control verification and Trust Points.

- [Public interactive demo](https://trustpal-impact-agent-2c03171881269a4c.agents.public.astropods.ai/)
- [2:45 demonstration video](https://youtu.be/fBjznQbokoc)

## What is demonstrated

1. Offer €10 and two hours of English teaching. Live AI matches the offer to a published education cause and explains an editable plan.
2. Approve a PayPal Sandbox payment. The server captures the order and records the result as a LIVE contribution allocation.
3. Inspect that capture in the AG Grid Impact Command Center and Global Impact Map. Demo history remains labeled.
4. Submit a skills offer for human review. In the public Steward Console, rehearse a fictional evidence review and preview the server-defined points calculation without issuing points.
5. Explore a seeded Creator Level profile and propose a cause of your own.

## Architecture and tools

React/Vite renders the frontend. A Node.js server serves the production build and same-origin APIs. PayPal JavaScript SDK v6 handles buyer approval; server-side Orders v2 routes create and capture orders. PayPal's official AI Toolkit informed integration work. PayPal is hard-locked to Sandbox.

Astropods hosts the deployed application and provides its AI Gateway, using the configured model `gpt-5-6-terra`. Matching, evidence planning, cause-draft assistance, and read-only impact analysis use schema-validated model responses. Credentials remain server-side. Missing AI configuration produces a clearly labeled fallback.

AG Grid supports cause discovery, editable giving plans, payment/campaign/leaderboard tables, and the steward review queue. The custom SVG map uses a locally bundled Natural Earth basemap and aggregates by cause country. Funding coverage and share of selected contribution receipts are separate metrics; volunteer needs are not converted into money.

## Local setup

Requires Node.js 24 and npm. No production PayPal credentials are needed or supported.

```sh
npm ci
cp .env.example .env.local
```

Configure your own PayPal Sandbox application's `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env.local`. Keep `PAYPAL_ENVIRONMENT=sandbox`. Never commit `.env.local` or use a `VITE_` prefix for secrets. Astropods supplies gateway credentials in its deployment workflow; local AI can use the explicit fallback when they are not configured. Leave `STEWARD_ACCESS_TOKEN` empty for the public rehearsal mode.

```sh
npm run build:render
node --env-file=.env.local server/app-server.mjs
```

Open http://localhost:4173/. For frontend development, use `npm run dev`; the Vite configuration includes the app API middleware.

A judge can explore the public demo without a TrustPal account. Completing a payment requires a PayPal Sandbox buyer account. Do not use a real PayPal account or enter sensitive personal information.

## Checks

```sh
npm test
npm run build
```

The project contains tests for payment capture handling, protected human review, rate limits and validation, analytics aggregation, geographic missingness, coverage vs. contribution-share arithmetic, and hosting packaging. The demo video shows a completed €10 Sandbox capture and its LIVE record.

## Boundaries and security

All causes, recipients, baseline campaign balances, profiles, and DEMO history are fictional. LIVE rows are completed PayPal Sandbox captures, with no real money donated. The payment flow uses one merchant and internal cause allocations; real multi-NGO settlement requires production recipient onboarding.

AI requests are bounded and limited to 20 per visitor per hour. Anonymous users cannot issue verified points or perform shared protected reviews. The public rehearsal changes only local page state. Queue records, audit history, capture analytics and rate limits are in memory and reset on restart; this prototype runs as a single process.

Recurring payments, automatic payouts, durable user accounts/storage, production NGO onboarding, and portable identity across other services are future work. Trust Points are contribution records, not an independently validated measure of financial creditworthiness.

## Source and asset licensing

The MIT license in LICENSE applies to original project code. Third-party packages remain subject to their own licenses. AG Grid Enterprise, AG Charts Enterprise and AG Studio require appropriate vendor licenses; no license key is included. Do not assume those packages are covered by this project's MIT license. The public demo's license is configured at runtime.

Natural Earth map data is public domain; see `src/geo/README.md`. Cause images are illustrative, fictional project assets. The demo video includes disclosed AI-generated fictional Maya illustrations, ElevenLabs-generated narration, and original synthesized music. Video-production recordings and private development history are not part of this source snapshot.
