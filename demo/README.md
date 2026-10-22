# Public CareLoop demo

Live: [Search](https://careloop-ai-hri-demo.neontulip1025.chatgpt.site/robots) · [Lab](https://careloop-ai-hri-demo.neontulip1025.chatgpt.site/robots/lab).

This build reuses the exact Search and AdaptiveLab components and domain helpers from this HumanoidTH fork. It is a browser-only deployment profile, not a second implementation of matching or trial logic. The main Next.js/PostgreSQL application remains unchanged by the demo wrapper.

The public demo exposes `/robots` and `/robots/lab`. It uses a reviewed field-only snapshot of the repository seed (16 models; the prepared local PostgreSQL database has 17). Sources remain unverified unless explicitly supported. It has no API secrets, visitor accounts, server writes, physical robot control, clinical claims, or external AI generation. Queries and optional trial records remain browser-local. Real request exchange requires running the main application with PostgreSQL and is not enabled in this public deployment profile.

After the repository dependencies are installed, run `node demo/build.mjs`. This produces a self-contained Worker ESM in `dist/server/index.js`. `--dependencies <checkout>` can reuse already-installed dependencies in a local build environment. A Sites project manifest is used only in the hosted source checkout, never with credentials in the source.

`seed-snapshot.json` contains only robot fields and a small subset of public source excerpts from `thailand_humanoid_atlas_seed_records.json`; it excludes people, account/contact records, room messages, and the full raw source corpus. Review the original source links before relying on any capability. No placeholders or invented robot records are added.
