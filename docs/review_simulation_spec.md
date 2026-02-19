# Review Simulation UI Contract

## 1. UI Events
| Event | Trigger | Payload | Notes |
| --- | --- | --- | --- |
| `onClick StartSimulation` | User taps "Start Simulation" button in Discussion header | `{ reviewItemId }` | Opens modal with role/round config |
| `onSelectRoles` | User toggles role checkboxes | `{ reviewItemId, roles: ["biz","tech",...] }` | Persist selection per review item |
| `onCustomAgent` | User defines new agent via natural language | `{ roleName, description, scope }` | Calls `POST /api/simulation/generate-agent` to create MD file |
| `onRunSimulation` | User confirms role + round settings | `{ reviewItemId, roles, roundsConfig, docContext }` | Triggers backend orchestrator, returns stream token |
| `onStreamMessage` | Backend pushes incremental agent output | `{ reviewItemId, message: Message }` | Append to discussion list; support retries |
| `onSimulationComplete` | Orchestrator finishes Phase 5 | `{ reviewItemId, artifacts: OutputArtifacts, summary }` | Enables download buttons + summary panel |

## 2. Data Structures

### ReviewItem Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ReviewItem",
  "type": "object",
  "required": ["id", "title", "docLink", "priority", "status"],
  "properties": {
    "id": { "type": "string" },
    "title": { "type": "string" },
    "docLink": { "type": "string", "format": "uri" },
    "priority": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
    "status": { "type": "string", "enum": ["pending", "in_review", "changes_requested", "approved"] },
    "metadata": { "type": "object", "additionalProperties": true }
  }
}
```

### Message Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Message",
  "type": "object",
  "required": ["id", "timestamp", "agent", "role", "content", "round"],
  "properties": {
    "id": { "type": "string" },
    "timestamp": { "type": "string", "format": "date-time" },
    "agent": { "type": "string" },
    "role": { "type": "string" },
    "content": { "type": "string" },
    "round": { "type": "string", "enum": ["Intake", "Round1", "Owner", "Round2", "Synthesis"] },
    "questionId": { "type": ["string", "null"] },
    "statusTag": { "type": ["string", "null"], "enum": ["Pending", "Resolved", "Partially Resolved", "Blocked", null] }
  }
}
```

### OutputArtifacts Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OutputArtifacts",
  "type": "object",
  "required": ["reportPath", "updatePackPath", "meetingQAPath", "summary"],
  "properties": {
    "reportPath": { "type": "string" },
    "updatePackPath": { "type": "string" },
    "meetingQAPath": { "type": "string" },
    "summary": {
      "type": "object",
      "required": ["topRisks", "mustFixes", "openQuestions", "nextActions"],
      "properties": {
        "topRisks": { "type": "array", "items": { "type": "string" } },
        "mustFixes": { "type": "array", "items": { "type": "string" } },
        "openQuestions": { "type": "array", "items": { "type": "string" } },
        "nextActions": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

## 3. UI Display Guidance
- **Discussion Thread**: render `Message` objects chronologically with badges showing agent name, role, round, and status tag. Support streaming updates (typing indicator while Phase in progress).
- **Final Summary Card**: show four columns (Top Risks, Must Fixes, Open Questions, Next Actions) fed by `OutputArtifacts.summary`.
- Provide buttons/links for downloading or opening Markdown/JSON outputs in a new tab.
- Collapsible sections per round; default collapse after N=25 messages with "Show more".

## 4. Safety & Experience Constraints
- Never auto-trigger Approve/Reject; only humans should click those buttons.
- All generated artifacts must be copyable and downloadable; include file-size hints.
- Provide deep links to `out/*.md` and `out/*.json` plus a toast when ready.
- Detect runaway simulations: if >100 messages, auto-prompt user to continue or stop.
- Respect reviewer privacy—mask internal-only data if flagged.
