# Design Review Meeting Transcript

**Meeting:** UX Design Review — Customer Portal Redesign  
**Date:** 3 March 2025  
**Time:** 2:00 – 2:50 PM AEDT  
**Location:** Virtual (Microsoft Teams)

## Participants

- Olivia Hart (Design Lead)
- Daniel Nguyen (Senior UX Designer)
- Karen Brooks (Product Owner)
- Raj Mehta (Frontend Developer)
- Fiona Clark (Accessibility Specialist)

---

**Olivia Hart:** Alright everyone, thanks for joining. The goal today is to review the three design options Daniel has put together for the new customer portal dashboard. Daniel, take it away.

**Daniel Nguyen:** Thanks Olivia. So I've prepared three concepts — Option A is a card-based layout with a left navigation rail, Option B uses a full-width table view with collapsible sections, and Option C is a hybrid that starts with summary cards at the top and a detailed table below. I've shared the Figma links in the chat.

**Karen Brooks:** I like Option C the best from a product perspective. Our user research showed that customers want both a quick snapshot and the ability to drill into detail. The hybrid approach gives them both without extra navigation.

**Raj Mehta:** From a build perspective, Option C is also the most feasible within our timeline. The card components already exist in our design system. The table component is new, but it's just an extension of what we have. I'd estimate three sprints for Option C versus four for Option B because of the collapsible section animations.

**Fiona Clark:** I have accessibility concerns with Option B — collapsible sections can be tricky for screen readers if not implemented with proper ARIA attributes. Option C is cleaner. However, I want to flag that the colour contrast on the status badges in all three options doesn't meet WCAG AA. Daniel, can you bump the contrast ratio on those?

**Daniel Nguyen:** Absolutely, I'll fix the contrast on the status badges across all options by end of day tomorrow.

**Olivia Hart:** Sounds like we have consensus on Option C. Karen, does that align with the stakeholder expectations you've been managing?

**Karen Brooks:** Yes, I presented a rough wireframe of the hybrid approach to the exec sponsor last week and she was positive. I'll confirm formally with her by Thursday and update the team on Slack.

**Olivia Hart:** Perfect. Raj, can you start a technical spike on the table component this sprint?

**Raj Mehta:** Already planned. I'll have a proof-of-concept ready by next Monday.

**Fiona Clark:** One more thing — we need to schedule a dedicated accessibility audit before the end of the design phase. I'd like to block out two hours in the first week of April.

**Olivia Hart:** Agreed. I'll send a calendar invite for that. Let's wrap up. Actions: Daniel to fix colour contrast by tomorrow. Karen to confirm with exec sponsor by Thursday. Raj to deliver table component POC by Monday. I'll schedule the accessibility audit for early April. Any questions? No? Great, thanks all.
