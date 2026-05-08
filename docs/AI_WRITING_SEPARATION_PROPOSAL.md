# HourGlass AI Writing Separation Proposal

Last updated: 5 May 2026

## Why This Proposal Exists

The current HourGlass editor stack already has a useful boundary:

- `Editor.tsx` is the writing surface. It owns TipTap, HTML sync, preview, media tools, and source mode.
- `PostEditor.tsx` owns document state, save flow, publishing controls, and the AI actions.

That split is visible in code today:

- `Editor.tsx` only accepts `initialContent`, `onChange`, and `onImageClick`.
- `PostEditor.tsx` owns `generateAiContent()` and `handleAiCheck()`.
- The AI buttons currently live in the top action bar beside save/publish controls.

So the problem is not that AI is technically embedded inside TipTap. The problem is that the authoring experience still feels visually and structurally mixed:

- AI actions read like editor chrome even though they are document-level assistants.
- `generateAiContent()` appends directly into `item.content`.
- `handleAiCheck()` replaces `item.content` directly after a successful response.
- `PostEditor.tsx` and `Editor.tsx` are both now large enough that future editor work will get harder if responsibilities keep accumulating.

## Goals

- Keep `Editor.tsx` focused on writing, formatting, media, preview, and source/visual switching.
- Move AI writing/checking into a clearly separate authoring assistant surface.
- Reduce accidental full-content overwrite behavior.
- Create a path to slim `PostEditor.tsx` and keep `Editor.tsx` from growing back into a mixed control surface.
- Preserve the current Gemini-backed APIs and saved-key behavior.

## Non-Goals

- No AI provider expansion in this phase.
- No slash-command or full Notion-style block assistant in this phase.
- No backend API redesign in this phase unless a later implementation exposes a clear contract gap.

## Approaches

### Option A: Right-Side AI Assistant Panel

Put AI into its own card or collapsible panel in the right column of `PostEditor`, near publishing/SEO/settings.

What it does:

- `AI Write` becomes a guided assistant panel instead of a top-bar button.
- `AI Check` lives in the same panel as a second action.
- Generated output is shown in a preview/result area before it touches the live article.
- User chooses `Append`, `Replace selection`, `Replace article`, or `Discard`.

Pros:

- Cleanest separation between writing surface and assistant tooling.
- Strong fit with current architecture because `PostEditor` already owns document state.
- Easier to keep `Editor.tsx` stable.
- Easier to later extract into `AiWritingPanel.tsx` plus a shared AI hook/service.

Cons:

- Slightly more clicks than a top-row shortcut.
- On smaller screens the right column must collapse cleanly.

### Option B: Slide-Over AI Drawer

Keep AI at the document level, but open it in a drawer from the right or bottom.

What it does:

- Top action bar keeps a single `AI Assistant` trigger.
- All prompting, generation, checking, and result preview happen in a drawer.

Pros:

- Keeps the main layout visually clean.
- Good when the AI flow needs more space for prompt presets and result comparison.

Cons:

- More state management than a simple panel.
- Harder to keep visible context with publishing/sidebar settings at the same time.

### Option C: Separate AI Draft Workbench

Create a separate compose sandbox before content enters the article.

What it does:

- AI writes into a temporary draft area.
- User manually inserts accepted output into the main content.

Pros:

- Strongest separation and safest overwrite behavior.
- Best long-term base for prompt libraries, rewrite modes, and structured AI operations.

Cons:

- Heaviest UX shift.
- Too large for the immediate HourGlass cleanup phase unless AI becomes a first-class module.

## Recommendation

Recommend **Option A: Right-Side AI Assistant Panel**.

Reason:

- It respects the existing code boundary instead of fighting it.
- It removes AI from the editor chrome without pretending AI is a pure formatting tool.
- It gives a clean path to split code into smaller units without forcing a big workflow change on authors.

## Proposed Baseline Design

### UX

- Remove `AI Write` and `AI Check` from the top action bar.
- Add an `AI Assistant` card in the right column.
- Inside the card:
  - prompt/topic area
  - action tabs or segmented buttons: `Write` and `Check`
  - result preview area
  - explicit apply actions: `Append`, `Replace`, `Insert at caret` if a safe cursor contract is added later
  - `Discard` action

### Responsibility Split

- `Editor.tsx`
  - stays responsible for editor UI, formatting tools, preview, code view, media interactions
  - should not own Gemini calls
- `PostEditor.tsx`
  - remains the orchestrator for document state
  - should delegate AI UI and request flow out to a child component
- New extraction targets
  - `src/components/editor/AiWritingPanel.tsx`
  - `src/hooks/useAiWriting.ts` or `src/components/editor/useAiWriting.ts`

### Safer Content Application

Current behavior is too blunt:

- generate -> direct append
- check -> direct replace

Proposed behavior:

- AI output lands in panel-local result state first.
- User explicitly chooses how to apply it.
- Grammar/style check should default to `Review changes` rather than silent overwrite.

## File-Slimming Direction

If this proposal is approved, the first cleanup goal should not just be moving buttons. It should also reduce file weight.

Suggested separation path:

1. Extract AI request and apply logic from `PostEditor.tsx`.
2. Extract top document action bar into its own component.
3. Keep `Editor.tsx` focused on editing surface concerns only.
4. Reassess whether media modals inside `Editor.tsx` should become a later follow-up extraction.

## Suggested Delivery Order

### Phase 1

- Add `AI Assistant` panel.
- Remove top-bar AI buttons.
- Keep current Gemini endpoints and key resolution rules.
- Change AI result flow to explicit apply/discard.

### Phase 2

- Extract AI panel and AI hook/service into separate files.
- Extract document action bar from `PostEditor.tsx`.

### Phase 3

- Optional future work:
  - prompt presets
  - rewrite modes
  - compare-before-apply diff view
  - insertion at current caret/selection

## Decision To Make

The main choice is not whether AI should stay in `Editor.tsx`. It already mostly does not.

The real choice is which document-level surface should own the experience:

- right-side panel
- slide-over drawer
- separate workbench

Current recommendation: **right-side panel first**.
