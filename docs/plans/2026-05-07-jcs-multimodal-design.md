# JCS Vertical Multimodal Prototype Suite — Design

**Date:** 2026-05-07
**Owner:** Samyak Shah
**Reference docs:** [JCS_Vertical_Pack_v9.docx](../../../Library/CloudStorage/...), [MultimodalUX_consolidated.pptx](../../../Library/CloudStorage/...)

## Summary

Build 5 HTML prototypes in `job-prototypes-2/` covering the JCS vertical:
- A **landing page** (vertical slice discovery hub)
- **4 use case pages** — Micro-Learning (Rahul), English Learning (Pooja), Interview Prep (Rohit), Govt Exam Prep (Sneha)

Voice-first multimodal experience using **Sarvam STT (saarika:v2.5) + Sarvam TTS (bulbul:v2)**. Scripted conversation rails (no LLM) so the demo is bulletproof. Deployed to GitHub Pages from a new repo `SamyakShahJio/job-prototypes-2`.

## Decisions log

| # | Question | Decision |
|---|----------|----------|
| 1 | Landing page concept | **B** — card-led discovery (4 large cards) + persistent voice mic at bottom. Voice routes via keyword router. |
| 2 | Multimodal depth per use case | **B** — mode-appropriate. Interview voice-first (call UI), English Avatar voice-first, Micro-Learning text-first chat, Govt Exam text-first chat. Latency markers + mid-flow handoff in voice-first flows. |
| 3 | Avatars vs faceless | **C** — JBIQ orchestrator faceless ambient-glow everywhere. English Learning AI Avatar gets a real lipsync avatar (the one bet in JCS doc that explicitly calls for an avatar). All other role-play personas (interview personas) are voice-only with identity cards. |
| 4a | LLM strategy | **B** — scripted rails everywhere with real Sarvam STT + TTS. No LLM dependency. |
| 4b | Build sequence | **B** — depth-first with shared starter kit. Foundation → Landing → English → Interview → Govt → Micro. |
| 5 | English Avatar free-form | **B** — guided free-form pattern. Sarvam STT transcribes user's actual speech, keyword-routed scripted response bank (~25-30 variants). Conversation has scripted milestones (intro → job → customer call practice → goodbye) with off-topic deflection. |
| 6a | Voice mapping | Approved (see Voice Cast below) |
| 6b | Repo creation | **A** — via `gh` CLI (authenticated as `SamyakShahJio`) |

## File structure

```
job-prototypes-2/
├── index.html                 # JCS vertical landing
├── english.html               # Pooja (3 bets)
├── interview-prep.html        # Rohit (2 bets)
├── govt-exam.html             # Sneha (2 bets)
├── microlearning.html         # Rahul (2 bets)
├── shared/
│   ├── jds-tokens.css         # JDS color/type/radius tokens
│   ├── jbiq-voice.js          # Sarvam STT/TTS module
│   ├── personas.js            # Voice cast registry
│   ├── multimodal.js          # Latency markers + mid-flow handoff
│   └── ambient-glow.css       # 4-state ambient glow component
├── assets/
│   ├── avatars/               # Sarah lipsync (English Avatar bet)
│   └── illustrations/         # Use case card heros
├── docs/plans/
│   └── 2026-05-07-jcs-multimodal-design.md  (this file)
└── README.md
```

## Voice cast (Sarvam Bulbul-v2)

| Role | Voice | Where used |
|------|-------|------------|
| **JBIQ orchestrator** | Anushka (warm female) | Landing page mic, vertical home greetings |
| **Sarah, English Avatar** | Vidya (clear neutral female) | english.html — AI Avatar bet |
| **Mock Interviewer A — "Bored HR"** | Manisha | interview-prep.html persona |
| **Mock Interviewer B — "Formal Ops Manager"** | Abhilash | interview-prep.html persona |
| **Mock Interviewer C — "Friendly TL"** | Karun | interview-prep.html persona |
| **Mock Interviewer D — "Hostile customer"** | Hitesh | interview-prep.html persona (V&A pressure drill) |
| **Micro-Learning coach** | Diya (energetic female) | microlearning.html |
| **Govt Exam counselor** | Manisha (calm professional female) | govt-exam.html |

STT model: `saarika:v2.5` (multilingual, Hinglish). TTS model: `bulbul:v2`.

## Scope per use case

### english.html — Pooja, 22, Pune BPO agent
**Bets:** (1) Situational Packs · (2) AI Avatar guided free-form · (3) Pathways/Daily Habit
**Screens:** Vertical home → Pack picker (5 packs × 5 scenarios) → Scenario practice (3 modes) → AI Avatar fullscreen (Sarah lipsync) → Pathway map → Phrasebook

### interview-prep.html — Rohit, 23, Lucknow retail aspiring BPO
**Bets:** (1) Company-Specific Mock Studio + Pressure Drills · (2) Morning-Of Kit + Reflection
**Screens:** Vertical home → Mock setup (company/role/round/persona picker) → Pre-mock cheat sheet → Live mock call (fullscreen, ambient glow per persona) → Post-mock report card → Morning-of dashboard

### govt-exam.html — Sneha, 23, Patna BCom grad
**Bets:** (1) Life-First Discovery & Counselling · (2) Commute-Orchestrated Daily Prep (folds in Diagnostic + PYQ in-flow)
**Screens:** Vertical home → Discovery chat (life-first → exam mapping) → Daily prep deck (quiz carousel + flashcards + concept cards) → Mini diagnostic surfaced inline → Exam dashboard with countdowns

### microlearning.html — Rahul, 24, Indore food delivery + YouTube creator
**Bets:** (1) Microlearning Session (problem-led) · (2) AI-Tool Fluency Track
**Screens:** Vertical home → Just-in-time chat (problem capture → root cause → N-step plan) → Course player (swipeable carousel, do-along checkpoints) → AI Fluency sub-track (ChatGPT for YouTube titles) → Skill portfolio with monetisation tracker

## Multimodal patterns (from MultimodalUX deck)

**Implemented across all 5 files:**
- Ambient glow (no face, just light) — 4 states: idle, listening, thinking, speaking
- Voice + text coexist — keyboard tap stops voice, mic tap stops typing, transcript persists
- Latency markers: spoken filler ("ek second…"), contextual micro-copy ("Looking up exam dates…"), ambient color shift, progressive text streaming, skeleton cards
- Per-message replay button (in role-play scenes)

**Selectively used:**
- Inline correction chips (English Learning only — don't break flow)
- Real-time delivery feedback chip — filler count, pace (Interview Prep mock only)

## Build sequence (timed)

| Phase | What | Time |
|-------|------|------|
| 0 | Foundation: folder, git, gh repo, shared kit, design doc, GitHub Pages | 30 min |
| 1 | index.html — landing | 25 min |
| 2 | english.html — 3 bets | 40 min |
| 3 | interview-prep.html — 2 bets | 35 min |
| 4 | govt-exam.html — 2 bets | 25 min |
| 5 | microlearning.html — 2 bets | 25 min |
| 6 | Polish + JDS design review | 15 min |

## Open questions / risks

1. **Lipsync avatar art for Sarah** — using a stylized SVG/CSS avatar with mouth-shape-keyed-to-audio (no real lipsync ML). Acceptable for prototype.
2. **Sarvam rate limits** — testing with provided key; assume reasonable rate limits for demo use.
3. **Mobile viewport** — designed at 390px width (iPhone-like phone-frame). Desktop view shows phone frame centered.

## Status

Phase 0 in progress. This doc lives in the repo and is committed.
