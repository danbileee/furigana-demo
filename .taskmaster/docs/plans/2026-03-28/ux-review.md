# UX Review: Furigana MVP — AI Japanese Reading Assistant

Date: 2026-03-28
Reviewed by: CPO, CTO, Lead Designer (via orchestrated UX review)

---

## 1. UX Concept Overview

**Core Idea**: Reading native Japanese text should feel effortless — not like a study session. Furigana removes the last remaining friction between an intermediate learner and the content they actually want to read.

**Target User**: Intermediate Japanese learners who have passed "survival Japanese." They know grammar. They read hiragana and katakana fluently. They have genuine curiosity about Japanese culture — they want to read a ramen blog, a game review, a celebrity tweet. But kanji walls stop them cold. Critically: they do not think of themselves as "studying." They think of themselves as "trying to read something." The moment the app frames itself as an educational tool, it feels like homework. The moment it feels like a reading tool, they lean in.

**Problem Being Solved**: The kanji lookup interrupt. Users are mid-sentence, mid-thought, mid-flow — they hit an unknown compound, open Jisho, copy-paste, lose their place, forget the thread. Three interrupts later, they have quit. This is not a vocabulary problem. It is a concentration problem. There is no fast, clean tool that takes arbitrary Japanese text and instantly produces a furigana-annotated version suitable for comfortable reading.

**Key User Flows**:

1. **Paste to Read (primary flow)**: User finds a native Japanese article they want to read but cannot. They paste it into the app, press Cmd+Enter, and the screen transforms — the same text, but every kanji now has a small hiragana reading floating above it. They read the article. They finish it. That feeling is the product.

2. **Return Visit (history as reading library)**: User opens the app days later. The sidebar shows titled entries — "Anime Season Preview," "Interview with Haruki Murakami." They click one to re-read a passage. The annotated text is there, exactly as generated, without re-submission. Over time the sidebar becomes a personal reading history — a trophy shelf of native content they have consumed.

3. **Self-Test (readings on demand)**: User switches the toggle to "When I need them." They move over a word and try to read it themselves first, then hover to confirm. The app quietly steps back, serving as a safety net rather than a crutch.

---

## 2. Aha & Wow Moment Design

**Aha Moment**: The exact second the reading view first renders.

The user submitted a block of raw Japanese text — opaque, intimidating, kanji-dense. Then the screen updates. The same text. But now every compound word they did not know has a tiny, clean hiragana reading above it. The text flows naturally — not broken into ugly spans, not wrapped in popups. It is readable.

The user thinks: _"Oh. I can read this. Right now. This is what it would look like if I just... knew all the kanji."_

**Why the Aha moment is fragile and how to protect it**:

- The transition from input to reading view must use a staggered token render (~400ms, left to right). Tokens appearing progressively after the API response transforms a page-state-change into a discovery. Without this, the moment is "it loaded." With it, the moment is "it's reading." This is the single highest-leverage implementation detail in the product.
- No layout shift during transition. Ruby annotations must appear above the correct characters from the first frame.
- No "success" toast, no confirmation banner. The text speaking for itself is the confirmation.
- For waits over 3 seconds (long texts near the 10K limit), show progress copy framed as anticipation: _"Processing your text — longer passages take a moment."_ Not a spinner alone. Not an apology. A signal that something meaningful is happening.

**Wow Moment**: Around the 3rd or 4th visit.

The user opens the app and sees three or four entries in the sidebar, each with a real title — not a timestamp, not a truncated URL. "Cherry Blossom Festival Guide." "Anime Season Preview." "Interview with Haruki Murakami." They look at the list and think: _"I read all of these. In Japanese."_

That realization is the wow. It is not gamified. It is not confetti. It is identity shift — the moment a learner starts to see themselves as someone who reads Japanese content, not someone who is trying to. The sidebar design must support this moment: titles must feel earned, timestamps are secondary metadata, and the count ("12 texts read") is the trophy.

**Why These Moments Work**: The Aha moment removes friction instantly — you do not need to know every kanji to read right now. The Wow moment creates identity — you are a reader who occasionally needs a pronunciation assist. Together they move users from "this is a useful tool" to "this is how I read Japanese."

---

## 3. Reference Alignment

No external reference document was provided. Alignment is derived from the PRD's stated goals and user journey.

**Core PRD philosophy: Assist, do not replace.**
The product is philosophically opposed to translation tools (DeepL, Google Translate), which remove Japanese from the reading experience. Furigana annotation preserves the reading experience while removing only the specific blocker — kanji pronunciation. Every UX decision should reinforce this: the app is a reading surface, not a study environment.

**How the UX concept reinforces it**:

- No vocabulary quizzes, no spaced repetition, no progress bars. The only "progress" is the personal reading library.
- The toggle is labeled "When I need them" — not "Advanced mode" or "Self-test." The user is always in control; the app never implies they should need the readings less.
- On Hover mode is surfaced _after_ the user has seen their first annotated result, not before — the app lets the experience speak first, then offers adjustment.

---

## 4. UX Evaluation Scorecard

### Aha Metrics (Understanding)

| Metric                             | Score | Current State                                                                                                                                                                                | Improvements                                                                                                                                                                                                                                           |
| ---------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Time to First Understanding (TTFU) | 4/5   | Core metaphor is immediately graspable — paste text, get furigana. Single-action entry point is low-friction.                                                                                | First-time users may not know what "furigana" means. Add a 2-line ambient hint in the empty textarea: _"Paste any Japanese text. We'll add readings above every kanji — so you can read it."_ No tutorial, just context.                               |
| Cognitive Load                     | 3/5   | Two modes (Always vs. When I need them) add a decision point that currently appears to all users on first render. Sidebar, paste area, and mode toggle compete for attention simultaneously. | Surface the toggle only after the user has seen their first result. Frame it as: _"Want to adjust how readings appear?"_ — not a mode selector upfront. Reduces first-session cognitive overhead significantly.                                        |
| Navigation Predictability          | 4/5   | Two-panel layout (sidebar + reading area) is a well-understood pattern. History is where users expect it. AI titles make entries scannable and memorable.                                    | On mobile, the full sidebar hide behind a hamburger creates a history discoverability gap. Ensure the drawer is re-openable at any point without disrupting the reading view.                                                                          |
| Error Recovery Ease                | 2/5   | No described recovery path for generation failure after a 5+ second wait. No undo for history deletion (only soft-delete with Trash menu). No cancel option during in-progress generation.   | Add a cancel option during generation. Design the error state as carefully as the success state: preserve the pasted text, show what went wrong specifically (_"The text was too long — try the first two paragraphs"_), and offer a clear retry path. |

### Wow Metrics (Delight)

| Metric                    | Score | Current State                                                                                                                                                                                       | Improvements                                                                                                                                                                                                                                        |
| ------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First Impression Impact   | 3/5   | The concept is strong but no typographic decisions are specified. The reading experience lives or dies on ruby typography — font family, font-size ratio between kanji and annotation, line height. | Define a deliberate typographic identity. A Japanese-capable serif (e.g., Noto Serif JP) with generous line height signals "this is for readers." One signature visual detail (annotation color, subtle reading-area texture) creates brand memory. |
| Emotional Engagement      | 4/5   | The Aha moment is genuinely strong — CPO correctly identified the exact transformation second as the emotional peak. The identity-shift Wow moment (trophy shelf) is well-framed.                   | Protect the Aha moment with staggered token reveal (see Section 2). Do not interrupt the private satisfaction of On Hover mode with praise or animations — the internal reward of confirming a correct reading is intrinsically valuable.           |
| Perceived Speed           | 3/5   | 1-2s for short texts is excellent. 4-8s for texts near 10K limit with no progress signal breaks trust before the Aha moment can land. Streaming is deferred to v1.5.                                | MVP minimum: progress copy for waits >3s. This is non-negotiable. After streaming ships in v1.5, this score reaches 5/5.                                                                                                                            |
| Micro-interaction Quality | 2/5   | No micro-interactions specified. On Hover CSS toggle is instant, which reads as broken without a transition. Sidebar title transition from placeholder to AI title has no described animation.      | Add a 150ms opacity fade on `ruby rt` visibility for On Hover mode. Crossfade sidebar placeholder text to AI title when it resolves. These are CSS transitions — zero JS overhead, high perceived quality improvement.                              |

### Lovability Metrics (Retention)

| Metric               | Score | Current State                                                                                                                                                                                                             | Improvements                                                                                                                                                                                                                          |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retention Likelihood | 3/5   | Habit loop is structurally sound (encounter native content → paste → read → history grows). Trophy shelf creates investment. But there is no trigger mechanism — the app is purely reactive.                              | Consider an optional browser notification or weekly digest: _"You have 4 texts in your library. Here is one from last week."_ Low complexity, non-spammy, aligned with the reading library identity.                                  |
| Shareability         | 2/5   | No sharing mechanism. The identity-shift Wow moment ("I read all of these in Japanese") is powerful internally but stays private. Target users are active on language-learning communities (r/LearnJapanese, HelloTalk).  | Share card feature: a styled excerpt from the annotated text with the app name, exportable as an image. The annotated text itself is the best advertisement — showing it to cold audiences is the primary acquisition channel.        |
| Memorability         | 4/5   | The text-transformation interaction is genuinely distinctive. Users who experience the first render moment will remember it. The trophy shelf grows as a personal artifact.                                               | Memorability depends on visual distinctiveness. One signature detail done with intention creates brand memory — a specific ruby annotation color, a custom Japanese-style horizontal separator, or a unique empty-state illustration. |
| Differentiation      | 4/5   | No competitor combines frictionless in-context furigana with a personal reading library and identity-level positioning ("you are a reader, not a student"). The Yomichan comparison reveals a genuine gap this app fills. | The differentiation is real but not communicated. Empty-state copy and first-session experience must actively communicate the positioning. _"Read Japanese. Today. With what you already know."_ is the positioning statement.        |

---

## 5. Competitive Analysis

### Yomichan / Yomitan (Browser Extension)

**Strengths**: Deeply integrated into browser, works on any webpage, dictionary definitions and pitch accent on hover, beloved by serious learners, free and open-source, massive feature set.

**Weaknesses**: Requires manual installation and configuration — most casual intermediate learners never install it. Interrupts reading flow with dictionary panels rather than flowing annotations. No history or library concept. Zero emotional design. No mobile support. Original project abandoned, creating ongoing trust fragility.

**Our Differentiation**: Yomitan requires users to go to the content and configure tooling. This app brings the content in. The emotional framing is opposite: Yomitan is a lookup tool for studious people who configure their environment; this app is a reading surface for people who want to read right now. The entire unaddressed segment of users who read on mobile or who resist browser extension installation is ours.

---

### Duolingo (Language Learning Platform)

**Strengths**: Extreme habit engineering (streaks, push notifications, leagues), massive brand recognition, gamified progression, social features, mobile-first, hundreds of millions of users.

**Weaknesses**: Decontextualized learning — exercises are sentence fragments, not real native content. No furigana or reading flow. Treats users as students permanently. Gamification can feel infantilizing to intermediate learners who want real content. No mechanism for "I found this article and want to read it."

**Our Differentiation**: Duolingo is optimized for beginners building vocabulary through repetition. This app is optimized for intermediates who are past structured lessons and want to read real content. These users often feel abandoned by Duolingo and are actively looking for the next tool. Positioning: not "study Japanese" — _"read Japanese, today, with what you already know."_

---

### DeepL / Google Translate (Machine Translation)

**Strengths**: Instant, handles any text, free, no setup, well-known, mobile apps, highly accurate.

**Weaknesses**: Translation destroys the reading experience. The user reads English, not Japanese. No phonetic annotation. No learning dimension. Treats Japanese as an obstacle to route around, not a language to engage with.

**Our Differentiation**: Translation is the wrong solution for intermediate learners. They do not want meaning handed to them in English — they want to access meaning through Japanese. Furigana annotation preserves the reading experience while removing only the specific blocker (kanji pronunciation). Users who translate are surrendering; users who use furigana are succeeding. This is a philosophical distinction that maps directly to a product positioning statement.

---

## 6. Critical UX Issues

### Issue 1: The Long-Wait Trust Cliff [Critical]

For texts near the 10K character limit, users wait 4-8 seconds after submitting. Currently there is no described progress signal. During this time the user has already mentally shifted into "reading mode" — and the interface has not responded. Every second of blank wait increases abandonment probability and weakens the first impression before the Aha moment can land.

**Mitigation (MVP, non-negotiable)**:

- After 3 seconds of `isSubmitting`, show contextual copy: _"Processing your text — longer passages take a moment."_
- Optional enhancement: compute an approximate wait estimate from char count client-side and show it inline. Zero backend changes required.
- Add a cancel button so users are not trapped.
- Staggered token render after response (see Issue 2) further mitigates the blank-wait perception.

---

### Issue 2: First Render Is a Page State Change, Not an Experience [High]

Without animation, the transition from input to annotated reading view is a hard swap — the user stares at loading copy, then the annotated text appears all at once. This undercuts the "text came alive" Aha moment the entire product depends on.

**Mitigation (MVP)**:

- Add a staggered left-to-right reveal of ruby tokens over ~400ms after the API response arrives. CSS animation on `ruby` elements, JavaScript orchestrates the reveal order. Estimated cost: ~1 day. This is the single highest-leverage implementation detail in the product.
- Soft fade-in of the reading container (150ms opacity) is a minimal fallback if staggered reveal is descoped.

---

### Issue 3: No Error State Design for Generation Failure [High]

The OpenAI call can fail. Rate limiting, timeouts, and quota exhaustion are real risks identified by CTO. There is no described recovery path. A user who pastes 500 characters of a ramen blog, waits 4 seconds, and receives a generic error message has had a worse experience than if they had never opened the app.

**Mitigation**:

- Design the error state as carefully as the success state. Show what went wrong specifically. Preserve the user's pasted text. Offer a clear retry path.
- Suggested copy variants: _"Generation timed out — try a shorter passage, or retry."_ / _"Something went wrong. Your text is preserved — try again."_
- Do NOT show a generic "Something went wrong" message with no context.

---

### Issue 4: Device-Local History Requires Honest Expectation-Setting [High]

History stored in IndexedDB is architecturally correct for MVP, but users who clear browser data or switch devices will silently lose their entire reading history with no warning. This is predictable behavior for privacy-conscious users — precisely the self-directed intermediate learner persona. The product will feel broken, not the browser.

**Mitigation**:

- On first history view, surface a single non-intrusive note: _"Your history is saved to this device. Create an account to sync across devices."_
- No modal, no onboarding flow. One line of copy placed where it matters.
- Show entry count prominently ("12 texts read") — the number is the trophy, and it reinforces why persistence matters.

---

## 7. Improvement Opportunities

### Priority 1: Staggered Token Render [Small effort — highest impact]

See Critical Issue 2. Left-to-right ruby token reveal after API response transforms the Aha moment from a state change to a discovery. This is not an enhancement — it is the difference between a functional product and a memorable one. Estimated: ~1 day.

### Priority 2: Share Card [Medium effort — acquisition channel]

A styled image export of the annotated text (first paragraph + app name) creates a shareable artifact. Target users are active on language-learning communities. The annotated text itself is the best possible advertisement — every share is a product demo. Requires html-to-image or canvas approach. Estimated: 2-3 days.

### Priority 3: Toggle Sequencing [Small effort — removes first-session friction]

Show the annotated result first. Surface the view mode toggle as a natural follow-on: _"Want to adjust how readings appear?"_ Removes the cognitive burden of configuring a setting before the user has context for what it controls. Estimated: <1 day (interaction flow change, no new components).

### Priority 4: Typographic Identity [Small effort — memorability]

Define one deliberate typographic and visual signature: ruby annotation color, font choice for the reading panel, or a single decorative detail. Generic Tailwind styling makes the product forgettable. One intentional detail creates brand recall. Estimated: <1 day (design decision + CSS).

### Priority 5: Progressive Furigana Density [Large effort — extends user lifetime]

A toggle or slider for annotation scope: "All kanji / Uncommon kanji only / N3 and above." Serves the full intermediate spectrum and prevents users from feeling they have outgrown the tool. Estimated: 3-5 days (requires AI prompt engineering + UI). Defer to v1.5.

---

## 8. Breakthrough Ideas

### Idea 1: "Kana Reveal" — Progressive Self-Test Without a Toggle [Bold & High Impact]

**The Idea**: Remove the binary Always/On Hover toggle entirely in v1.5. Each ruby annotation starts visible. After the user's cursor dwells on a line for 3+ seconds (indicating they have read it), the annotations on that line softly fade to 30% opacity. Hovering any specific word snaps it back to full visibility. The reading experience is: annotations are your safety net; they fade into the background as you demonstrate confidence.

This makes the self-test experience emergent rather than declared. The user never has to say "I'm ready to test myself" — the interface adapts to reading behavior. There is no graduation moment to commit to.

**Feasibility**: Medium. Requires Intersection Observer on line-level sentinel elements + per-element dwell timers (~2-3 days frontend). Opacity fade must be subtle (full to 30%, not full to invisible). The CTO's CSS-only On Hover approach is retained as a fallback preference; Kana Reveal is the default for returning users.

**Impact**: High. This is a genuinely novel interaction pattern that no competitor has implemented. It is the most differentiating interaction in the product and directly supports the "reader, not student" identity positioning. If tuned correctly, it is the interaction users will describe when recommending the app to friends.

**Risk**: Dwell detection can feel uncanny if not tuned carefully. Opacity fade must never obstruct reading. A user preference to revert to Always mode must remain available.

---

### Idea 2: Copy as Ruby HTML [Medium Risk, Medium Impact]

**The Idea**: A one-click "Copy as HTML" button in the reading view that exports the full `<ruby>` markup of the annotated text. Teachers, bloggers, and language tutors who produce Japanese learning content (YouTube descriptions, lesson materials, Discord posts) can instantly use the annotated output in their own work.

**Why it matters**: This expands the user base beyond learners to content creators — a segment with higher word-of-mouth reach and stronger motivation to share the tool. A Japanese language blogger who uses this app to annotate a blog post will link to it in their bio.

**Feasibility**: Low. The `<ruby>` markup is already generated in the reading view. A copy-to-clipboard button on the annotated text container is a one-day implementation. Estimated: 1 day.

**Impact**: Medium. Does not change the core learner experience but creates a distinct power-user segment and a passive acquisition channel.

---

## 9. Technical Enablers

### 1. IndexedDB Client-Local Storage (Replace In-Memory Token Store)

The current in-memory `tokenStore` (`token-storage.service.ts`) is consumed on first read and does not survive server restarts or multi-process deployments. The reading view URL (`/furigana/:id`) breaks on refresh because tokens are gone after first consumption.

Replace with IndexedDB on the client: store `{ id, rawText, annotationString, title, createdAt }` per entry. The reading view loader returns a shell on server; the client hydrates from IndexedDB by `id`. History sidebar reads from IndexedDB. This eliminates the server-side race condition, removes the Turso dependency from the hot path, and makes the reading URL refresh-safe.

**UX enabled**: Session persistence, history sidebar, trophy shelf identity moment — all depend on this.

### 2. `defer()` + `<Suspense>` for AI Title

After furigana is saved, fire the AI title generation call asynchronously using React Router v7's `defer()` pattern. The reading view renders immediately with annotation tokens; the sidebar title streams in when the secondary call resolves. No polling required. The crossfade transition from placeholder text to AI title uses a CSS opacity animation triggered by Suspense resolution.

**UX enabled**: Sidebar placeholder → title transition with no layout shift.

### 3. CSS Transition on Ruby Visibility

For On Hover mode (`[data-view-mode="hover"] ruby rt { visibility: hidden }`), add a 150ms opacity transition instead of an instant visibility toggle. This makes the hide/reveal feel intentional rather than broken.

**UX enabled**: Micro-interaction quality on the reading view toggle.

### 4. IP-Based Rate Limiting (Pre-Launch Requirement)

No rate limiting exists. A single automated client can exhaust the OpenAI API quota or generate unbounded IndexedDB entries. Add IP-based rate limiting via React Router v7 middleware before any public launch.

**UX enabled**: Protects API cost and availability — which directly protects the generation reliability the entire Aha moment depends on.

### 5. Streaming Generation (v1.5)

Switch OpenAI call to streaming mode. Progressively reveal ruby tokens as the annotation string streams in. This replaces the staggered render animation (Section 7, Priority 1) with a more organic progressive reveal — text tokens appear as the model generates them, simulating reading in real time.

**UX enabled**: Transforms the 4-8s wait for long texts into an engaging "the text is waking up" experience. Eliminates the long-wait trust cliff entirely. This is the v1.5 Aha moment upgrade.

---

## 10. Final Verdict

### Is This Lovable?

**Not yet — but it is close. Three conditions stand between "viable" and "lovable."**

The core UX concept is genuinely strong. The CPO correctly identified the two emotional peaks (first render transformation + identity-shift trophy shelf). The CTO has confirmed the architecture is sound and the implementation path is clear. The competitive positioning ("reading tool, not study tool") is defensible and real.

**But lovability lives in micro-moments that are not yet resolved:**

**Condition 1 (Non-negotiable)**: The first render must feel alive.
The staggered token reveal animation must ship in MVP. Without it, the Aha moment is a page state change. With it, it is the experience the product is built around. This is ~1 day of frontend work with outsized impact.

**Condition 2 (Non-negotiable)**: The toggle must follow the experience.
Do not ask users to configure On Hover mode before they have seen their first annotated result. Show the result, let them experience it, then surface the toggle. Reordering this sequencing requires no new components — it is a UX flow decision costing less than a day.

**Condition 3 (Non-negotiable)**: History must set honest expectations.
One line of copy on first history view: _"Your history is saved to this device."_ Without it, the first browser data clear is a trust-destroying surprise. With it, users understand the model and trust the shelf they are building.

### What's Missing for v1.5

- **Streaming generation**: Eliminates the long-wait trust cliff and upgrades the Aha moment from good to exceptional
- **Kana Reveal**: The most differentiating interaction in the product — makes self-testing emergent, not declared
- **Share card**: Turns the identity-shift Wow moment into an acquisition channel
- **Progressive furigana density**: Extends user lifetime by serving the full intermediate learner spectrum

### Confidence & Next Steps

**Confidence**: 7.5/10. The concept is sound, the architecture is clear, and the differentiators are real. Execution risk is low for the core flow. The gap is in the micro-moments that make the difference between a good tool and a memorable product.

**Top 3 Next Steps**:

1. Implement staggered token render animation on the reading view (1 day — highest leverage unresolved item)
2. Replace in-memory token store with IndexedDB client storage + add history expectation-setting copy (1-2 days — fixes architecture and trust gap simultaneously)
3. Rename and resequence the view mode toggle (< 1 day — removes first-session cognitive friction)
