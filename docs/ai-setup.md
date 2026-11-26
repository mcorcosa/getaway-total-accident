# AI project setup guide

Use this guide to start a project with separate chats for ownership, management, implementation, and documentation. Give each chat a role, the project context it needs, and a clear reporting destination.

## Moving or restoring the project

On a new machine or checkout, read the [migration handoff](MIGRATION-HANDOFF.md) and verify the current workspace and exact sidebar project binding for **Getaway Total Accident**. Use the [PM startup prompt](PROJECT-MANAGER-START-PROMPT.md) to restore a missing PM chat. The [team roster](team-roster.md) describes role startup and the registry for verified active routes. Its original-host IDs are provenance until the current checkout, project binding, and direct messaging are verified.

## Getaway Total Accident shared knowledge

Before planning, dispatching, implementing, or reviewing project work, read the Pages MCP [start page](https://chatgpt.com/space/page_6b07df28ba988191b1bc6bf6d032120e), [Confirmed Decisions and Open Questions](https://chatgpt.com/space/page_d992c8842f1881918a640576e66e8c4b), and the relevant parts of [Game Design](https://chatgpt.com/space/page_0f74c2901b5081919928bcfcadc04eb2).

- Space ID `page_space_d0625ed24de48191aae222a38f11211f`
- Start page ID `page_6b07df28ba988191b1bc6bf6d032120e`
- Confirmed Decisions and Open Questions page ID `page_d992c8842f1881918a640576e66e8c4b`
- Game Design page ID `page_0f74c2901b5081919928bcfcadc04eb2`

Use the Pages connector's `read_page` with the exact `page_id`. To discover Pages by title or topic, use `find_pages` with the Space ID as `space_id` and the topic as `query`, then read the matched Page. If Pages is unavailable, use the local [working design](../HEATWAVE-GETAWAY-DESIGN.md) and report the missing access and any decision you could not verify to the PM.

Route durable knowledge updates through [the shared Project Librarian](#shared-project-librarian). Use the active Librarian route verified through the [team roster](team-roster.md). Managers send the owner decision and its evidence, affected scope, and open questions. The Librarian handles one update at a time, validates changes, reconciles the working design and affected Pages for confirmed design decisions, checks both saved records, and dates the reconciliation. The latest verified owner decision takes precedence. Flag stale or inaccessible sources and record what was last verified. Reconciliation is manual.

### Project role routing

- **Grand Theft Casual — Progression Manager**. Owns mission sequencing, the introduction of new objectives and mechanics, same-rule practice stretches, difficulty and complexity pacing, chapter count and order proposals, mastery and bonus pacing, and dependencies such as unlocks, vehicle eligibility, and economy.
- **Grand Theft Casual — Story Manager**. Owns narrative, characters, dialogue, and flavour after gameplay rules and sequencing are settled. Route former Story progression assignments to the Progression Manager.

- **Grand Theft Casual — Map Manager**. Owns spatial layout, reusable mission areas, connectivity, mission boundaries, incremental extensions, and independent acceptance of map work.

- **Game Engineering Manager**. Owns runtime, architecture, integration, and technical acceptance.
- **Grand Theft Casual — Level Design Manager**. Owns concrete encounters, spawn, target and pickup placements, mission tuning, and independent acceptance of mission content.

Story coordinates narrative constraints with Progression, which owns sequence planning. Map coordinates mission needs with Progression and visual direction with Art. The owner approves product decisions, and the PM coordinates and accepts cross-area work.

Game Engineering routes runtime and browser QA work, Map routes shared world data, and Level Design routes mission data. Each manager assigns work through the named Sol implementer required by the steps below. Progression owns the sequence, Map owns geography, and Story writes narrative after gameplay rules are settled.

## Roles and decision authority

- **Owner** directs the project, sets priorities and constraints, and resolves decisions the project manager escalates.
- **Project manager (PM)** plans the work, makes decisions within the owner's direction, tracks progress and dependencies, and reports to the owner. The PM opens area manager chats as needed and routes implementation through an area manager.
- **Area managers** plan and assign work in their areas, independently verify it for acceptance, and report to both the PM and the owner. Escalate cross-area dependencies and decisions that exceed the assignment to the PM.
- **Implementers** in separate Sol chats own changes to implementation code, tests (including new QA code), assets, configuration, and fixes. They verify the result and report back to the assigning manager with evidence and any remaining issues.
- **Librarian** verifies and maintains human-readable project documentation for agents and people.

The PM and area managers own coordination and independent acceptance. They may inspect project files read-only, run existing checks, and playtest. Only the assigned Sol implementer makes implementation changes. The same routing applies when the owner sends an implementation request directly to a manager. The team enforces this division through its handoff and acceptance procedure. Workspace permissions are a separate control.

## Model selection

Use **Sol High** for all manager chats, including the PM, directors, and area managers, regardless of assignment complexity. For other roles, use **Sol High** for difficult tasks, **Sol Medium** for straightforward tasks, and **Sol Low** for light tasks.

## Delegation and reporting

Every spawned project chat at every level, including managers, implementers, and specialists, must be named, visible to the owner, and directly openable and messageable in the owner's designated project folder in the left sidebar.

The chat creator and every manager delegating to the chat must explicitly select the same sidebar project as the owner's project chat. Before relying on the handoff, they must verify that the chat appears in that project and can be opened and messaged directly. If a check fails, correct the mismatch and verify again, or pause the handoff and escalate to the PM. The PM escalates unresolved blockers to the owner. A parent workspace, sibling source checkout, hidden subagent, or link alone does not satisfy the rule.

For this project, verify the exact sidebar project ID and checkout for all manager, implementer, specialist, and Librarian chats. The current local sidebar label is **Getaway Total Accident**. The original project and several existing chat titles use **Grand Theft Casual**. See the [team roster](team-roster.md) for the verified binding and routing approvals.

1. For each distinct implementation assignment, the area manager creates a fresh, named, user-visible project chat. Choose the chat's reasoning effort using [Model selection](#model-selection). Revisions to the same assignment may stay with its named Sol owner.
2. Before any implementation changes, give the implementer a written handoff in the named chat. Record the actual implementer chat ID or link, exact model and reasoning effort, expected outcome, scope, owned paths, constraints, acceptance criteria and checks, and reporting destination. Identify the workspace or branch when it matters. Assign clear ownership before starting parallel work that could touch the same files. If the required Sol chat is missing or delegation is unavailable, hold implementation and escalate the blocker to the PM. The PM escalates unresolved blockers to the owner.
3. The implementer reports changed files, what they verified, the evidence, and any blocker or decision needed. The assigning manager independently verifies the result against the acceptance criteria, names the Sol chat that did the work, and reports the acceptance outcome and evidence to the PM and owner. Managers relay decisions, dependencies, and issues that need action. Send review findings that require implementation and fixes of any size back to Sol.
4. Route documentation assignments through the [shared Project Librarian](#shared-project-librarian).

## Shared Project Librarian

The PM designates one project chat as the shared **Project Librarian** and sets its reasoning effort for the documentation work it handles using [Model selection](#model-selection). The PM records the chat ID or link in the project handoff and shares it with all area managers. The PM and all area managers route every human-readable project documentation update to that chat. This includes onboarding, setup, decisions, and verification evidence.

The shared Librarian is the exception to the fresh-chat rule. Reuse this chat for every documentation assignment. If the chat cannot be reached, hold documentation edits and escalate to the PM.

Include the source, scope, and owned paths in the handoff. The Librarian handles one assignment at a time and coordinates path ownership before editing. The Librarian checks findings against the relevant evidence, confirms decisions with the decision owner or their recorded approval, updates the relevant documents, labels unverified claims or open questions, and reports the updated paths and verification to the sender.

## Reuse and improve this guide

Copy the guide into the next project's documentation and give new chats its path. Confirm role assignments and model choices for that project, and follow the [shared Project Librarian](#shared-project-librarian) procedure to designate the project's chat. Record local decisions such as tooling, build commands, and release procedures in project-specific documentation.

When a real handoff or documentation update exposes a gap, send the Librarian the example and what would have helped. Revise the reusable guide when the lesson applies across projects. Keep local decisions in their project and remove guidance that adds work without improving handoffs or verification.
