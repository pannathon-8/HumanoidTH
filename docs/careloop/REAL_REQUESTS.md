# CareLoop request exchange

The local `/robots/requests` feature sends actual text requests to a separate receiver page. It replaces the earlier lab as the main practical trial; `/robots/lab` remains available for studying interaction patterns.

## Try on this computer

1. Open `/robots/requests` and create a private channel.
2. Open the receiver link in another tab. Keep both pages open.
3. Choose a prepared message or type your own; add an optional meeting point.
4. Review the exact message and confirm sending.
5. On the receiver page, accept or decline. After accepting, report completion.
6. Check the sender page: actual server status and event history update automatically. The sender can cancel a pending or accepted request.

Requests, statuses and events are stored in PostgreSQL. They survive page reloads while the browser tab retains its session credentials. The server stores SHA-256 token hashes. Invite credentials appear in URL fragments, are removed from the receiver address bar after reading, and are never included in request query strings. Anyone possessing an invite can read and answer that channel. Invites expire after 24 hours. The sender can delete a channel; this removes the room, requests and events immediately through database cascades. Expired rooms and their contents are deleted when a later room is created or an expired room is accessed. There is no scheduled cleanup worker, so an expired room that is never accessed can remain stored until the next room creation. Closing the sender tab can lose its session credentials.

For this demo, PostgreSQL transactions serialize room and request creation against shared global quotas: at most 100 unexpired rooms, 20 requests per room and 1,000 requests total. Each request body is capped at 4 KiB; room creation and status-action bodies are capped at 64 bytes. Request text is limited to 500 characters and the optional place to 100. These limits bound growth when all writes use these API routes. They are availability controls for this demo, not identity verification or a general-purpose abuse prevention service. There is no IP logging or account-based rate limit.

Speech input is optional and uses the browser's speech recognition service after explicit consent and a user click. The browser provider may process audio remotely. Denied permissions, unsupported recognition and network failures leave text/preset input available. No microphone capture or recognition accuracy is claimed from automated tests.

## Boundaries

- This is an actual web request exchange between people. Receiver-reported completion does not establish physical task completion.
- No robot controller, hardware acknowledgement, robot-specific adaptation, SMS, email, background push or emergency dispatch is connected.
- A loopback URL works only on this computer. Public or multi-device use requires reachable hosting and a deployment privacy decision. The room/request quotas are shared through PostgreSQL advisory transaction locks among app instances that use the same database; external database writers bypass them. Expired-data cleanup is opportunistic rather than scheduled.
- The original robot registry and search are preserved. Robot-specific controls remain future work; this feature should not be described as robot execution.
- New Prisma models are additive. Setup: generate Prisma client and run the normal schema setup against the configured PostgreSQL database.

## Checks

The pure helper tests cover input validation, credentials, allowed actor/state transitions, idempotent content comparison, origin checks and an injectable speech-recognition lifecycle. Browser checks must separately verify sending, independent receiver acknowledgement, cancellation, reload persistence and layout. Passing helper tests alone does not prove server integration or microphone capture.
