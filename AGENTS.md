# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Global Impact Map design

The public Live Impact page uses an interactive Global Impact Map in place of the public AG Studio workspace. Keep the existing KPIs and AG Grid tables. Group by existing cause country, never donor location or guessed project coordinates. Distinguish campaign coverage from share of selected contribution receipts, and seeded campaign balances from demo feed entries and live Sandbox captures. Keep volunteer needs separate from money. Use the locally bundled public-domain Natural Earth basemap with restrained TrustPal blue, coral gaps, teal support, keyboard access, and reduced-motion support; no paid map service or API key.

## PayPal integration sources

Use PayPal's official AI Toolkit plugin as the primary source for API selection and best practices. Consult its `paypal-best-practices` skill and the relevant reference before payment integration changes. Prefer its connected Sandbox MCP tools for supported live operations. Avoid repeated broad web research; use targeted official PayPal documentation only for details missing from the toolkit, including multiparty marketplace integration, which the toolkit explicitly excludes. Verify actual installation, activation, and authentication separately before claiming the plugin is connected.

Official source: https://github.com/paypal/AI-Toolkit. Installed for this local environment as `paypal@paypal-ai-toolkit` version 1.2.0. Restart Codex after installation to load its skills and MCP server. Sandbox operations require the plugin's Sandbox access-token configuration; application credentials and AI-provider access remain separate.
