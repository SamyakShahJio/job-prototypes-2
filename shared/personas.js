/* Voice Cast Registry — Sarvam Bulbul-v2 voices
 *
 * One source of truth for every voice in the JCS prototype suite.
 * Per MultimodalUX deck POV: "Two voices, you pick" for the JBIQ orchestrator.
 * Per JCS doc: distinct personas for English Avatar friend/teacher and Interview
 * personas (bored HR / formal Ops / friendly TL / hostile customer).
 */

window.JBIQ_PERSONAS = {
  // ============= JBIQ ORCHESTRATOR (faceless ambient glow) =============
  jbiq_warm: {
    id: 'jbiq_warm',
    speaker: 'anushka',
    model: 'bulbul:v2',
    pitch: 0,
    pace: 1.0,
    name: 'JBIQ',
    description: 'Warm Indian female — the default JBIQ voice across all use cases',
    visual: 'ambient-glow',
    fillerPhrase: 'Ek second…',
  },
  jbiq_calm: {
    id: 'jbiq_calm',
    speaker: 'manisha',
    model: 'bulbul:v2',
    pitch: 0,
    pace: 0.95,
    name: 'JBIQ',
    description: 'Calm Indian female — alternate JBIQ voice (slow & steady)',
    visual: 'ambient-glow',
    fillerPhrase: 'Hmm, ek minute…',
  },

  // ============= ENGLISH LEARNING — AI AVATAR (lipsync) =============
  sarah_avatar: {
    id: 'sarah_avatar',
    speaker: 'arya',             // Bulbul-v2 most natural / modern English female cadence
    model: 'bulbul:v2',
    pitch: -1,                    // Slightly lower pitch — warmer, less peppy
    pace: 1.0,
    name: 'Sarah',
    title: 'Your English coach',
    description: 'Modern Indian female English — friendly tutor for free-form practice',
    visual: 'avatar-lipsync',
    avatarColor: '#3535f3',
    fillerPhrase: 'Mmm, let me think…',
  },

  // ============= INTERVIEW PREP — ROLE-PLAY PERSONAS (faceless + identity card) =============
  interviewer_bored_hr: {
    id: 'interviewer_bored_hr',
    speaker: 'manisha',
    model: 'bulbul:v2',
    pitch: 0,
    pace: 0.95,
    name: 'Priya Mehra',
    title: 'HR · Concentrix',
    archetype: 'Bored HR',
    description: 'Flat, neutral, going-through-the-motions female interviewer',
    visual: 'identity-card',
    accentColor: '#6d17ce',
    energy: 'low',
  },
  interviewer_formal_ops: {
    id: 'interviewer_formal_ops',
    speaker: 'abhilash',
    model: 'bulbul:v2',
    pitch: 0,
    pace: 0.95,
    name: 'Rajesh Kumar',
    title: 'Ops Manager · Tech Mahindra BPS',
    archetype: 'Formal Ops Manager',
    description: 'Calm, authoritative male — serious, evaluative tone',
    visual: 'identity-card',
    accentColor: '#3900ad',
    energy: 'high-formal',
  },
  interviewer_friendly_tl: {
    id: 'interviewer_friendly_tl',
    speaker: 'karun',
    model: 'bulbul:v2',
    pitch: 0,
    pace: 1.0,
    name: 'Arjun Singh',
    title: 'Team Lead · HDFC Sales',
    archetype: 'Friendly TL',
    description: 'Warm, encouraging male — wants you to do well',
    visual: 'identity-card',
    accentColor: '#1eccb0',
    energy: 'warm',
  },
  interviewer_hostile_customer: {
    id: 'interviewer_hostile_customer',
    speaker: 'hitesh',
    model: 'bulbul:v2',
    pitch: 0,
    pace: 1.05,
    name: 'Mr. Sharma',
    title: 'Angry customer · Bajaj Finance',
    archetype: 'Hostile Customer (V&A pressure drill)',
    description: 'Assertive, sharp male — pressure-drill role-play',
    visual: 'identity-card',
    accentColor: '#fa2f40',
    energy: 'hostile',
  },

  // ============= MICRO-LEARNING — COACH (faceless) =============
  microlearning_coach: {
    id: 'microlearning_coach',
    speaker: 'diya',
    model: 'bulbul:v2',
    pitch: 0,
    pace: 1.05,
    name: 'JBIQ',
    title: 'Your skill coach',
    description: 'Energetic Indian female — peer-like, hype-without-hype',
    visual: 'ambient-glow',
    accentColor: '#25ab21',
    fillerPhrase: 'Chalo dekhte hain…',
  },

  // ============= GOVT EXAM PREP — COUNSELOR (faceless) =============
  govt_exam_counselor: {
    id: 'govt_exam_counselor',
    speaker: 'manisha',
    model: 'bulbul:v2',
    pitch: 0,
    pace: 0.95,
    name: 'JBIQ',
    title: 'Your exam mentor',
    description: 'Calm professional female — reassuring mentor tone for exam stress',
    visual: 'ambient-glow',
    accentColor: '#f7ab20',
    fillerPhrase: 'Theek hai, ek second…',
  },
};

// User's currently selected JBIQ orchestrator voice (warm vs calm)
window.JBIQ_VOICE_PREF = 'jbiq_warm';

window.getPersona = function(id) {
  return window.JBIQ_PERSONAS[id] || window.JBIQ_PERSONAS.jbiq_warm;
};
