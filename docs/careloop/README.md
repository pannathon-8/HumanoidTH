# CareLoop AI

The fork includes Search, an adaptive interaction lab at `/robots/lab`, and an [actual sender/receiver request exchange](REAL_REQUESTS.md) at `/robots/requests`. The public browser-only demo exposes Search and Lab from the same shared components; real request exchange requires the main Next.js/PostgreSQL app. No robot hardware is connected.

CareLoop adds a Thai problem-first search form to the existing HumanoidTH `/robots` registry. A person can describe a supported need, inspect matching recorded fields, follow explicitly associated sources, and see what the loaded data does not establish. The form has no age field or age restriction.

The name is provisional. The current feature uses deterministic keyword and intent-group matching, without an external AI model or semantic suitability assessment.

## Try the feature

Public browser demo: [CareLoop AI Search](https://careloop-ai-hri-demo.neontulip1025.chatgpt.site/robots) and [Adaptive Lab](https://careloop-ai-hri-demo.neontulip1025.chatgpt.site/robots/lab). This profile has 16 seed models and no PostgreSQL request exchange. See [deployment scope](../../demo/README.md).

Follow the repository setup instructions, including PostgreSQL, Prisma generation, schema setup and seed import, then open `/robots`.

1. Choose `อยากเรียนเขียนโค้ดด้วยหุ่นยนต์` to explore education-related records.
2. Choose `ต้องการสื่อสารทางไกล` to explore communication-related records.
3. Read the specific matching fields and associated source excerpts, where available.
4. Follow the link to the original registry card or external source.
5. Search for an unsupported request, such as `ควอนตัมสวนมังกร`, to inspect the no-result state. Clear the search or submit an empty field to check validation.

The prepared local dataset returned three learning-related records and four communication-related records during browser QA. Results depend on the database contents; these counts are examples, not hardcoded output or a completeness claim.

## Behavior and limits

- Searches supported Thai intent groups and English whole words in the recorded name, description, type and primary use case. A result can match only part of a request.
- Uses exact normalized official URLs or explicit canonical-name metadata to associate sources. A linked excerpt is not a semantic verification of the requested capability, individual suitability, or a health outcome.
- Shows missing evidence and unknown price, procurement, accessibility, safety and wellness-outcome information rather than filling gaps with invented values.
- Processes up to 500 query characters in client state. Searching sends no query to the URL, database or external AI. Choosing the Lab link stores the goal once in sessionStorage for the same-tab handoff; the Lab consumes and removes it.
- Disables search when the database cannot be loaded or the registry is empty. A source-loading failure is shown separately.
- Preserves the existing registry below the form. The feature neither controls a physical robot nor provides clinical advice. No robot trial or user study has been completed.

The prepared registry includes existing seed/import records. Imported or accepted records are not automatically independently verified. The feature is open to people of all ages; the available dataset does not establish coverage of every age group or need.

## Main files

| File | Purpose |
| --- | --- |
| `app/robots/page.tsx` | Load registry and explicitly related source records |
| `app/robots/CareLoopSearch.tsx` | Search form, validation, results, evidence and missing-data states |
| `lib/problem-search.ts` | Deterministic matching and safe source association |
| `test/problem-search.test.ts` | Regression tests for matching and evidence boundaries |

Run `node --import tsx --test test/*.test.ts` for the existing classifier tests plus the added search/map regression cases. See [Baseline audit](BASELINE_AUDIT.md) for the upstream fixes and verification scope.

## Interaction scenarios on the web

Feature 2 is implemented at `/robots/lab`. Open it directly or from a search-result link. Search transfers the goal once through browser sessionStorage; the URL carries only the robot ID. Choose learning, communication, assistance or routines, or write a custom goal with two to five task steps. Plan validation runs automatically; there is no mandatory human approval checkbox. The plan remains visible for inspection.

- Select multiple constraints: unable to speak comfortably, unable to hear comfortably, shorter questions, larger controls and Other. Other requires a description and an explicit supported adaptation strategy; no AI understanding is claimed.
- Categories generate different task choices. Custom steps become actual walkthrough questions. The extra step-by-step strategy inserts review checkpoints; it is not just a label.
- Compare two initial routes for the same frozen plan: simulated voice and text buttons. Voice uses labeled buttons and captures no microphone or actual speech. A selected voice barrier prevents a simulated answer from advancing; switching to text allows recovery. Short text changes prompts and large controls change button sizing.
- Go back, ask for a short prompt, request help, explicitly confirm, cancel or stop. Incorrect learning-example answers and help requests do not silently advance.
- Results show actual browser events, duration, blocked attempts, repeats and channel changes. Comparison concerns the web model, not physical-robot performance or population-level accessibility evidence.
- Save one or two finished routes only by pressing **บันทึกผลในเครื่องนี้**. Up to 10 recent studies fit within a 1 MiB limit. History replays events against the frozen plan, rejects tampering, and strips unrecognized fields. Goals, constraints and optional feedback remain in this browser; they are not uploaded automatically. A person may explicitly download a JSON record to inspect and share themselves.
- Each route has at most 2,000 events, reserving the final event for stopping. Existing search and previous lab-history data are retained. Robot records appear separately as related research references; a model name no longer pretends to select device-specific behavior.

The third concept feature, editing complete interaction behavior and comparing versions, is not implemented. Custom task clarification here is part of feature 2, not a claim that feature 3 is finished. Speech capture/output, physical robots, owner-side data collection and a user study are outside this implementation.

Implementation: `lib/interaction-plan.ts`, `lib/trial-history.ts`, `lib/careloop-lab-handoff.ts` and `app/robots/lab/AdaptiveLab.tsx`. Legacy helpers remain for the previous format. The integrated suite currently has 77 passing cases, including a 90-combination goal/constraint/channel matrix inside the adaptive tests, admin-session tests and request-deletion/quota tests. This is finite modeled coverage, not proof of coverage for all real-world goals. See [developer notes](ADAPTIVE_LAB.md) and [public deployment profile](../../demo/README.md).

## Submission and personal information

This public folder documents the software. Applicant names, contact details, age evidence, Portfolio files and the filled private application document are handled separately. The organizer's project template still asks for team identity, members and roles; applicants complete those fields in their submission copy.
