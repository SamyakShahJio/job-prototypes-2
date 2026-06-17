# JCS Vertical Prototype Suite

5 HTML prototypes for the **Jobs, Careers & Skills** vertical of JBIQ — in-chat, multimodal (text-first with optional voice), JDS-compliant.

🌐 **Live demo:** https://samyakshahjio.github.io/job-prototypes-2/

Each use case ships in two states: the returning-user version at the repo root and a fresh/zero-state version under [`zero/`](zero/).

## Files

| File | Use Case | Flow |
|------|----------|------|
| [`index.html`](index.html) | Vertical landing — 4 use-case cards + "pick up where you left off" | Card-led + persistent chat dock |
| [`microlearning.html`](microlearning.html) | Bite-sized skill courses by category (content map) with a swipeable, full-height lesson carousel | In-chat, text-first |
| [`english.html`](english.html) | Tri-lingual situational English (en / hi / gu) — AI personas, Word of the Day, situation Learn + Simulate | In-chat + optional voice |
| [`interview-prep.html`](interview-prep.html) | Mock-interview prep — company/role drills, in-chat feedback (no numeric scores) | In-chat + voice |
| [`govt-exam.html`](govt-exam.html) | Exam discovery + prep — career-counsellor onboarding, eligibility, endless flashcards & quizzes | In-chat, text-first |

## Patterns across the suite

- **In-chat flows** — guided chat with chips/cards instead of multi-page navigation; a **persistent input dock** on every page.
- **Categorisation** — microlearning and govt-exam present horizontally-scrollable tiles grouped into category rows.
- **No gamification / no numeric scores** — practice is open-ended ("practise more"), not a graded journey with a finish line.
- **Two states** — root (returning user) and [`zero/`](zero/) (first-time user) for every use case.

## AI personas

English Learning offers four AI personas — **Riya** (Friend), **Rajesh** (Teacher), **Maya** (Colleague) and **Arjun** (Interviewer) — each with a distinct character avatar. Govt Exam uses a career-counsellor persona. Voice (ElevenLabs-cached audio with a browser-TTS fallback) is optional throughout.

## Architecture

- **JDS tokens** ([`shared/jds-tokens.css`](shared/jds-tokens.css)) — colour, type, radius, spacing
- **Icons** ([`shared/icons.js`](shared/icons.js)) — single-path JDS icon set rendered via `data-icon`
- **Guided chat** ([`shared/guided-chat.js`](shared/guided-chat.js)) — `GC.appendAi / appendUser / appendCard / appendChips` chat primitives
- **Multimodal helpers** ([`shared/multimodal.js`](shared/multimodal.js)) — latency markers + voice/text handoff
- **Voice** ([`shared/jbiq-voice.js`](shared/jbiq-voice.js)) + cached audio ([`shared/tts-cache.js`](shared/tts-cache.js))

## Built with

- Vanilla HTML/CSS/JS — no framework, deploys directly to GitHub Pages
- JDS (JioBharatIQ Design System) tokens
- ElevenLabs (cached TTS) with a browser speech-synthesis fallback

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
