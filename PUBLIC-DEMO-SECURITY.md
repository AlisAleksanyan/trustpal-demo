# TrustPal public demo security

TrustPal is a fictional hackathon prototype. The anonymous deployment is intentionally limited:

- AI generation routes allow 20 requests per hashed visitor address per hour.
- AI requests are same-origin, schema validated, body-size limited, time limited, and capped at 1,200 output tokens.
- The AG Studio Agent Framework calls the Astropods gateway through `/ai-api/studio-turn`; no model credential enters the browser. Its tool set can query data and change the local dashboard, but contains no payment, verification, or Trust Point mutation tool.
- The server—not the browser—selects published causes for AI matching and skill evidence.
- Anonymous skill offers are submitted for human review; they cannot issue Trust Points.
- Steward Console offers a clearly labelled public rehearsal that changes only page-local state. Server-side verification requires a random `STEWARD_ACCESS_TOKEN` of at least 32 characters, held in browser memory for the current console session only. There is no default credential. Without this environment variable, shared verification is locked.
- Approved review requires three explicit evidence confirmations and a review note. The server calculates points from the published rate, rejects duplicate reviews, and records an audit entry. Submitted free-text notes are visible only to authenticated stewards. Skill submissions/reviews are limited to 10 per visitor per hour and 4 KB per request.
- Published funding, profiles, and verified impact records are canonical build data. Browser storage can retain only sanitized pending cause drafts.
- PayPal is hard-locked to Sandbox APIs and the Sandbox JavaScript SDK. A non-Sandbox environment stops server startup.
- PayPal and Astropods credentials are server-side environment variables. Only PayPal's browser-safe client token is returned to the v6 SDK.
- The AG Studio browser licence is returned separately by `/impact-api/studio-config`, as required by AG Studio. It grants no API access and is never mixed with PayPal or AI credentials.
- Completed Sandbox captures update an append-only in-memory analytics overlay. They do not change canonical campaign totals, profiles, or verified contribution records.
- The live dashboard clearly labels fictional seeded rows as `DEMO` and real Sandbox captures as `LIVE`; contributor labels are pseudonymous.
- PayPal capture webhooks are signature-verified, deduplicated by event ID, and limited to completed, denied, and refunded capture events.
- PayPal Sandbox routes have a separate 60-request-per-visitor hourly limit.
- The demo stores no production customer database and contains only fictional seeded profiles, causes, and recipients.

Queue submissions, review audit, Sandbox capture overlays, and rate limits are in memory and reset when the process restarts. A production system needs durable storage, individual steward accounts with scoped permissions, and a shared rate-limit store. The demo intentionally supports one replica.
