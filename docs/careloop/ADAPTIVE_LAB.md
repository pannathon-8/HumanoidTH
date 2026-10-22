# Adaptive interaction experiments

The user approved extending feature 2 beyond a single generic dialogue. The experiment now separates a goal, its task steps, access constraints and a response channel. It is a web interaction model; no physical device, real communication channel or speech engine is connected.

## Coverage and user control

Four predefined categories offer different tasks. For unknown goals, the custom category requires two to five written steps. The page validates the input automatically and shows the plan for optional inspection, without a mandatory approval checkbox. It explicitly says that a category template does not semantically interpret arbitrary goals. If a template does not fit, the person defines their steps instead. A Search-result link carries only the robot ID; the goal is transferred once through sessionStorage and then removed.

Constraints combine independently. No-speech/no-hearing constraints create an explicit modeled barrier in the voice route; text permits recovery. Short questions change displayed wording, larger controls change the real buttons, and an Other constraint requires choosing text, short questions or extra review checkpoints. No unsupported free-text need is silently treated as understood. All ages may use the page; there is no age or diagnosis field.

For each validated plan, try simulated voice and text in either order, once per channel in a two-round comparison. Both rounds retain the same plan and constraints. Back removes later answers, incorrect example answers/help requests remain at the same step, final confirmation is explicit and stopping remains available. Results describe the model's actual click events. Timing is affected by order and familiarity and is not evidence that one method is generally better.

## Reuse in open source

- `buildPlan(input)` validates and compiles a `TrialPlan`; `PlanInput` holds category, goal, context, constraints, the Other strategy and custom steps.
- `createTrial(plan, mode)` starts with a ready state. `transitionTrial(state, action)` returns a new state and event record. It has no browser, network or device dependency.
- `getTrialPrompt(state)` selects full or short wording; `summarizeTrial(state)` derives timing and counters.
- An input adapter can map a supported physical button or recognized intent to the plan's choice IDs. An output adapter could present the question on a device. Those adapters, permissions, hardware constraints and actual speech accuracy must be developed and tested separately.
- Simulation completion never calls a physical actuator or sends a request. Real-device execution requires a separate explicit design and verification of the final confirmation and stop behavior.
- Add a task category with its choices and validation, or use user-defined steps. Add a constraint only when it has an observable behavior and regression cases; do not add decorative capability labels.

## Data and persistence

Save is opt-in in this browser. One or two terminal runs plus the exact plan and optional feedback are stored under `careloop.adaptive-trials.v1`, bounded to 10 studies and 1 MiB. Parsing rebuilds the plan and replays events; forged state summaries and altered plans are rejected. A person may explicitly download `careloop-experiment.json` containing `format: careloop-adaptive-study-v1` and a `study` record for developer inspection. No result or free-text feedback is automatically sent to the website owner or an AI service. Inspect exported text before sharing.

Previous `careloop.interaction-history.v1` data remains untouched and a summary is available in the new page. Future changes to task-template semantics must version or migrate the adaptive history format, because validation deliberately requires a matching rebuilt plan.

## Verification and limits

The adaptive engine includes 90 combinations: five goal categories, nine constraint profiles and two initial channels. The integrated suite has 77 passing tests, including classifier/map/search/history, admin sessions, handoff privacy and request limits/deletion. This modeled matrix does not establish real-world usability, universal accessibility, physical-robot capability or health outcomes. A microphone in the lab, actual lab speech recognition, owner-side feedback collection and a user study are not part of this revision.
