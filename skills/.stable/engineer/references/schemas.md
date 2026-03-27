# Schemas Reference

Structured output formats used throughout the engineering process loop.

---

## Delivery Note Schema

Produce this at the end of every task. Mark fields `N/A` only when genuinely not applicable. Do
not omit fields because they're inconvenient to fill in. The prose rule applies here without
exception: no em dashes, no semicolons, no colons used as dramatic pauses, no compound sentences
in any field. Semicolons are not allowed even when they feel natural. Split the sentence.

```
### Delivery Note

**Summary**
One paragraph: what was done and why.

**Files Changed**
- path/to/file: one-line description of the change (do not paste the code here, the reviewer reads the diff)

**Design**
Key design decisions, rationale, and alternatives considered.
Note any use of domain knowledge beyond project docs and the trade-offs involved.

**Assumptions**
(See Assumption Schema below)

**Test Invariants**
| Invariant | Test(s) | Command | Result |
|-----------|---------|---------|--------|
| ...       | ...     | ...     | ...    |

**Tests Added**
List of new test files/cases added with a one-line description of what each covers.

**Commands**
Exact commands run and their outputs:
```
$ npm run test -- --coverage
... (output) ...
```

**Checklist**
- [ ] Unit tests pass locally (command + result)
- [ ] Linters/formatters pass (or deviations documented)
- [ ] Type checks pass (where applicable)
- [ ] Integration tests added and run for any new or changed user behavior (command + result)
- [ ] Side effects and state changes documented
- [ ] Assumptions listed and classified
- [ ] Rollback/mitigation plan present for risky changes

**Risks**
Known risks introduced or unmitigated.

**Workarounds**
Any deviations from standards: what, why, risks, mitigation, revisit timeframe.

If there are genuine improvements worth flagging after the Workarounds field, write them as natural prose: "We could make this better by..." Do not add a NextSteps heading or any other heading. Do not add a labeled field. Write it as a colleague's observation. If nothing genuine exists, stop after Workarounds.
```

---

## Assumption Classification (Internal)

Use this to reason about your own uncertainty, not to produce a table in your response.

For each assumption you're making, classify it:
- **Must-confirm**: you need human input before you can proceed. Surface this as a natural question.
- **Safe-to-assume**: you're confident enough to proceed. Note it in the Delivery Note if it's non-obvious.

Fields to track internally: id, statement, type, confidence (high/med/low), how to verify.

When surfacing must-confirm assumptions in conversation: ask about them one at a time, naturally.
Don't dump the full table. Pick the most blocking one and ask about it. Come back for others
only when needed.

The structured table format belongs in the Delivery Note only, not in conversational responses.

**Example of a must-confirm surfaced naturally:**
> "I'm assuming `MAGIC_LINK_SECRET` is always injected as an env var in the Lambda — I want to
> confirm that before I wire up the token service. Is that set up in SST config?"

**Example of a safe-to-assume noted silently** (mentioned only in Delivery Note):
> A2: Existing token format is HMAC-SHA256 base64url — confirmed by reading `app/server/auth/token.ts`

---

## Pause — What to Communicate

When you pause for human input, your message needs to convey these things naturally, not as a formatted template with headers:

- **What you were about to do** (so the person has context)
- **What you found that stops you** (the specific issue, with evidence if relevant)
- **Your instinct on the answer** (what you'd do if you had to choose)
- **The one thing you need** to continue (a single clear question or decision)
- **What you'll do if you don't hear back** (only if relevant)

Write it as a colleague would. Conversational prose, no bold headers, no "Option A / Option B"
menus unless there's a genuinely context-dependent decision where the team's answer would change
the direction. If you have a recommendation, lead with it.

**Good example:**
> "I was about to start the token generation service, but I'm not sure how secrets are injected
> in this Lambda. My assumption is `MAGIC_LINK_SECRET` comes from SST config — is that right,
> or should I be reading it from somewhere else?"

**Not this:**
> **Problem statement:** Secret injection strategy is unclear.
> **Recommended option:** Use SST config. Pro: consistent with other secrets. Con: requires SST.
> **Alternatives:** Option B: SSM Parameter Store...
> **Requested action:** Approve or choose.

---

## Verification Mapping

Record for each key design invariant:

| Invariant | Test(s) | Command | Result |
|-----------|---------|---------|--------|
| Token is invalid after run is CLOSED | `token.spec.ts: "rejects token for closed run"` | `npm test -- token.spec.ts` | PASS |
| RESPONSE record never contains email | `anonymity.contract.test.ts` | `npm run test:integration` | PASS |

---

## Pre-Handoff Checklist

Answer each item in the Delivery Note's ValidationChecklist before handing off:

1. **Unit tests pass locally.** Include command and result.
2. **Linters/formatters pass.** Document deviations with justification if any.
3. **Type checks pass** where the project uses TypeScript/Flow/etc.
4. **Integration tests added and run** for any new or changed user behavior. Include command and result.
5. **Side effects and state changes** documented
6. **Assumptions listed and classified** per Assumption Schema
7. **Rollback/mitigation plan present** for any risky changes
