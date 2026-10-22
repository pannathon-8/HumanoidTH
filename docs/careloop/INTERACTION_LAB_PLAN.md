# CareLoop interaction lab

## Approved adaptive experiment revision

The user approved this revision after reviewing why the first lab's robot selector did not change behavior. Replace the primary experiment flow with goal/category input, multiple constraints including explicit Other, editable custom task steps, plan review, and two trial paths (simulated voice and text buttons). Separate goal, task steps and response channel so coverage can grow without pretending one generic dialogue solves every goal. Keep the existing search and the old history storage intact.

Four task families cover learning, communication, assistance and routines. Custom goals require user-written steps; unknown needs are not silently classified or claimed as understood. Other constraints require a written description and a supported adaptation strategy selected by the person. Constraints must alter actual behavior: simulated voice can encounter an input/output barrier, text switching permits progress, short prompts shorten the displayed question, and larger controls change button sizing.

The person reviews the exact steps before trying either path. Each path records actual button events, time, blocked attempts, repeats, channel changes, back and stop. Compare the two results for the same frozen plan; do not infer population-level or physical-robot performance. Save only by explicit local action, retain bounded validated history and allow user-initiated JSON export for developer reuse. No speech is captured/transmitted; voice is labeled as a simulated route. No external AI is added or claimed. Robot records become optional related research references, not an initial selector that falsely implies device-specific behavior. Feature 3 free interaction editing/version comparison remains separate; custom step entry here clarifies the task for feature 2.

Validation adds tests for materially different task plans, custom input, constraint effects, wrong answers and help requests, blocked simulated voice and text recovery, safe history replay, same-plan comparison, and browser QA at narrow/wide widths. Existing legacy tests and saved data remain supported.

The user authorized feature 2 from the retained CareLoop concept PDF on 21 October 2026 and wants a platform that can later include feature 3. This implementation follows the existing written scenario design: choose a context, try a branching interaction, repeat or stop, explicitly confirm a simulated outcome, and inspect actual browser interaction events.

## Scope

- Add `/robots/lab` inside the existing platform with learning, remote communication and everyday assistance scenarios for people of any age.
- Search result links may carry a registry robot ID. A selected model is a research reference, not a claim that it supports the proposed behavior.
- Text and large buttons support accept, decline, repeat, unclear input, back, confirmation and stop. No device control, real contact or emergency service is performed.
- A pure state machine enforces confirmation and terminal states; record real button actions and elapsed time in the web prototype.
- On completion or stopping, show the event timeline, outcome, repeat count and duration. Save only when the person presses a clearly labeled save button. History stays in this browser, with a bounded number of runs, and can be reopened.
- Handle unavailable database, absent/unknown model links, malformed browser history and unavailable storage. Existing search and registry stay available.
- Feature 3 editing/version comparison and search algorithm upgrades remain subsequent work. Repeat simplifying a question is a predefined scenario branch, not a user editor.

## Validation

Test state transitions, confirmation bypass, stop/decline/back, repeats and malformed history before implementation. Run the complete unit suite, TypeScript and production build. Browser-test full completion, cancellation, repeat/unclear branches, history after reload, navigation from a search result, and narrow/wide layouts. Do not claim physical or user-study validation.
