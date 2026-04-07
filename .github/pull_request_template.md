## Context

<!-- Brief description of WHAT you’re doing and WHY. -->

## Implementation

<!--

Some description of HOW you achieved it. Perhaps give a high level description of the program flow. Did you need to refactor something? What tradeoffs did you take? Are there things in here which you’d particularly like people to pay close attention to?

-->

## Screenshots

| before | after |
| ------ | ----- |
|        |       |

## How to Test

<!--

A straightforward scenario of how to test your changes will help reviewers that are not familiar with the part of the code that you are changing but want to see it in action. This section can include a description or step-by-step instructions of how to get to the state of v2 that your change affects.

A "How To Test" section can look something like this:

- Sign in with a user with tracks
- Activate `show_awesome_cat_gifs` feature (add `?feature.show_awesome_cat_gifs=1` to your URL)
- You should see a GIF with cats dancing

-->

## Agency/Agent/Skill/Tool Checklist (required)

Reference: `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md`

- [ ] Runtime hard-gate is enforced for agency/agent/skill/tool boundaries
- [ ] Capability allowlist is deny-by-default
- [ ] Audit coverage is defined and validated across L0-L3
- [ ] Regression tests are added/updated for agency/agent/skill/tool flows
- [ ] Core remains agnostic (no domain coupling introduced)

## Get in Touch

<!-- We'd love to have a way to chat with you about your changes if necessary. If you're in the [Kilo Code Discord](https://kilo.ai/discord), please share your handle here. -->
