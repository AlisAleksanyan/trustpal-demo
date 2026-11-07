# TrustPal partner deployment

TrustPal can run as one full-stack service. The browser calls same-origin `/ai-api/*` and `/paypal-api/*` routes, so PayPal secrets and Astropods credentials never enter the client bundle.

## Primary: Astropods

Astropods is the primary deployment because its `gateway` model provider injects `ASTRO_GATEWAY_URL` and `ASTRO_GATEWAY_API_KEY` into the agent container.

1. Install and sign in to the Astropods CLI using its official instructions.
2. From this directory, validate the blueprint:

   ```bash
   ast spec validate
   ```

3. Configure the PayPal Sandbox variables interactively. Include the Sandbox client ID, client secret, and the webhook ID registered for `https://<public-host>/paypal-api/webhooks`. Do not put values in commands or commit them:

   ```bash
   ast project configure
   ```

4. Run locally through Astropods:

   ```bash
   ast project start
   ```

5. Push a private blueprint and deploy it from the authenticated CLI or dashboard. Supply the PayPal values through the Astropods secret vault.

The agent uses `gpt-5-6-terra` through the Astropods AI Gateway because the production-focused tier is better suited to schema-constrained extraction and AG Studio tool calls. The UI visibly falls back to deterministic rules if the gateway is unavailable.

AG Studio works locally without a key. Before the public submission, provide the sponsor's 45-day trial as the runtime setting `AG_STUDIO_LICENSE_KEY`. The server gives it to the Studio browser component through `/impact-api/studio-config`; this browser licence is inspectable by design and is not an API credential. PayPal and AI credentials remain server-only and are never returned by that endpoint.

## Backup: Render

Steward Console is public in rehearsal mode. To enable approved review actions, set `STEWARD_ACCESS_TOKEN` in the server secret vault to a random value of at least 32 characters. Leave it empty to keep shared verification locked. Never add a `VITE_` prefix or commit the value. The console credential lasts only in page memory; ending the session or navigating away removes it. Queue and audit records are ephemeral for this single-process hackathon demo.

`render.yaml` defines a Node web service with the same production server. Render is useful as a backup deployment and provides hackathon credits. PayPal works there when its two Sandbox secrets are configured. The checked-in Render blueprint intentionally does not request Astropods gateway credentials: its AI features use the explicit deterministic fallback. Enable live inference there only if Astropods provides a separately issued, officially supported external credential; never copy injected credentials out of an Astropods deployment.

## Local production smoke test

```bash
npm ci
npm run build:render
PORT=4175 HOST=127.0.0.1 node --env-file=.env.local server/app-server.mjs
```

Then check `/health`, `/ai-api/health`, and `/paypal-api/health`.
