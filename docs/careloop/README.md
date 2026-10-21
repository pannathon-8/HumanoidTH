# CareLoop AI

CareLoop adds a Thai problem-first search form to the existing HumanoidTH `/robots` registry. A person can describe a supported need, inspect matching recorded fields, follow explicitly associated sources, and see what the loaded data does not establish. The form has no age field or age restriction.

The name is provisional. The current feature uses deterministic keyword and intent-group matching, without an external AI model or semantic suitability assessment.

## Try the feature

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
- Processes up to 500 query characters in client state. The search adds no query to the URL, database or browser storage, and sends no query to an external AI service.
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

## Submission and personal information

This public folder documents the software. Applicant names, contact details, age evidence, Portfolio files and the filled private application document are handled separately. The organizer's project template still asks for team identity, members and roles; applicants complete those fields in their submission copy.
