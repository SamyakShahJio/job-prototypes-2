# JCS Vertical Multimodal Prototype Suite

5 HTML prototypes for the **Jobs, Careers & Skills** vertical of JBIQ — voice-first, multimodal, JDS-compliant.

🌐 **Live demo:** https://samyakshahjio.github.io/job-prototypes-2/

## Files

| File | Use Case | Persona | Lead Mode |
|------|----------|---------|-----------|
| [`index.html`](index.html) | JCS vertical landing | All | Card-led with voice mic |
| [`microlearning.html`](microlearning.html) | Just-in-time hard-skill coaching | Rahul, 24, Indore food delivery + creator | Text-first chat + voice |
| [`english.html`](english.html) | Situational English + AI Avatar (lipsync) | Pooja, 22, Pune BPO agent | Voice-first avatar |
| [`interview-prep.html`](interview-prep.html) | Company-specific mock studio + persona drills | Rohit, 23, Lucknow, aspiring BPO | Voice-first call UI |
| [`govt-exam.html`](govt-exam.html) | Life-first discovery + commute prep | Sneha, 23, Patna BCom grad | Text-first + voice doubts |

## Architecture

- **JDS tokens** ([`shared/jds-tokens.css`](shared/jds-tokens.css)) — color, type, radius, spacing
- **Sarvam voice module** ([`shared/jbiq-voice.js`](shared/jbiq-voice.js)) — STT (saarika:v2.5) + TTS (bulbul:v2) wrapped with state callbacks
- **Voice cast** ([`shared/personas.js`](shared/personas.js)) — 8 personas with Sarvam voice mapping
- **Ambient glow** ([`shared/ambient-glow.css`](shared/ambient-glow.css)) — the "no face, just light" component, 4 states
- **Multimodal helpers** ([`shared/multimodal.js`](shared/multimodal.js)) — latency markers + voice/text handoff per the MultimodalUX deck

## Design references

- [JCS Vertical Pack v9](docs/plans/2026-05-07-jcs-multimodal-design.md#summary) — personas + signature bets
- [MultimodalUX consolidated POV](docs/plans/2026-05-07-jcs-multimodal-design.md#multimodal-patterns) — voice/text handoff, latency markers, "no mascot, two voices, no face"
- [Design doc](docs/plans/2026-05-07-jcs-multimodal-design.md) — full architecture and decisions log

## Voice cast

JBIQ orchestrator across all use cases is **faceless ambient glow** (per MultimodalUX deck "No mascot, no name, no face — just light"). Role-play personas have voice + identity card. English Learning's AI Avatar ("Sarah") is the one exception with a real lipsync animation.

## Built with

- Sarvam AI (STT + TTS)
- JDS (JioBharatIQ Design System) tokens
- Vanilla HTML/CSS/JS — no framework, deploys directly to GitHub Pages

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
