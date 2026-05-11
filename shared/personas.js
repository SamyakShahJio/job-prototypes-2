/* Voice Cast Registry — ElevenLabs voices
 *
 * One source of truth for every voice in the JCS prototype suite.
 * Per MultimodalUX deck POV: "Two voices, you pick" for the JBIQ orchestrator.
 * Per JCS doc: distinct personas for English Avatar friend/teacher and Interview
 * personas (bored HR / formal Ops / friendly TL / hostile customer).
 *
 * ARCHITECTURE: Audio for every line is pre-generated at build time
 * (tools/tts-build.js) and shipped as static MP3 files in assets/audio/.
 * Runtime makes ZERO API calls. window.TTS_CACHE (tts-cache.js) maps
 * `personaId:sha1(text)` → audio filename. Perceived latency: instant.
 *
 * Voice IDs are ElevenLabs canonical default voice IDs (eleven_multilingual_v2
 * model). For a brand-aligned Indian-accent pass, replace with custom cloned
 * voices from the user's ElevenLabs voice library.
 */

window.JBIQ_PERSONAS = {
  // ============= JBIQ ORCHESTRATOR (faceless ambient glow) =============
  jbiq_warm: {
    id: 'jbiq_warm',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',   // Sarah — soft warm female
    model: 'eleven_multilingual_v2',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.2,
    name: 'JBIQ',
    description: 'Warm female — the default JBIQ voice across all use cases',
    visual: 'ambient-glow',
    fillerPhrase: 'Ek second…',
  },
  jbiq_calm: {
    id: 'jbiq_calm',
    voiceId: 'XrExE9yKIg1WjnnlVkGX',   // Matilda — warm, slightly slower
    model: 'eleven_multilingual_v2',
    stability: 0.65,
    similarityBoost: 0.75,
    style: 0.1,
    name: 'JBIQ',
    description: 'Calm female — alternate JBIQ voice (slow & steady)',
    visual: 'ambient-glow',
    fillerPhrase: 'Hmm, ek minute…',
  },

  // ============= ENGLISH LEARNING — AI AVATAR (lipsync) =============
  sarah_avatar: {
    id: 'sarah_avatar',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',   // Sarah — soft female, clean English
    model: 'eleven_multilingual_v2',
    stability: 0.55,
    similarityBoost: 0.8,
    style: 0.3,
    name: 'Sarah',
    title: 'Your English coach',
    description: 'Modern female English — friendly tutor for free-form practice',
    visual: 'avatar-lipsync',
    avatarColor: '#3535f3',
    fillerPhrase: 'Mmm, let me think…',
  },

  // ============= INTERVIEW PREP — ROLE-PLAY PERSONAS =============
  interviewer_bored_hr: {
    id: 'interviewer_bored_hr',
    voiceId: 'Xb7hH8MSUJpSbSDYk0k2',   // Alice — British female, slightly cool
    model: 'eleven_multilingual_v2',
    stability: 0.75,                    // higher stability = flatter, less expressive
    similarityBoost: 0.6,
    style: 0.0,                          // zero style = monotone-leaning
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
    voiceId: 'nPczCjzI2devNBz1zQrb',   // Brian — deep, authoritative male
    model: 'eleven_multilingual_v2',
    stability: 0.6,
    similarityBoost: 0.75,
    style: 0.15,
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
    voiceId: 'TX3LPaxmHKxFdv7VOQHJ',   // Liam — warm young adult male
    model: 'eleven_multilingual_v2',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.35,                         // warm expressive
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
    voiceId: 'cjVigY5qzO86Huf0OWal',   // Eric — assertive business-y male
    model: 'eleven_multilingual_v2',
    stability: 0.4,                      // lower stability = more variation = more emotion
    similarityBoost: 0.75,
    style: 0.55,                         // high style = expressive (angry)
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
    voiceId: 'cgSgspJ2msm6clMCkdW9',   // Jessica — expressive young female
    model: 'eleven_multilingual_v2',
    stability: 0.45,
    similarityBoost: 0.75,
    style: 0.4,
    name: 'JBIQ',
    title: 'Your skill coach',
    description: 'Energetic female — peer-like, hype-without-hype',
    visual: 'ambient-glow',
    accentColor: '#25ab21',
    fillerPhrase: 'Chalo dekhte hain…',
  },

  // ============= GOVT EXAM PREP — COUNSELOR (faceless) =============
  govt_exam_counselor: {
    id: 'govt_exam_counselor',
    voiceId: 'FGY2WhTYpPnrIDTdsKH5',   // Laura — calm professional female
    model: 'eleven_multilingual_v2',
    stability: 0.6,
    similarityBoost: 0.75,
    style: 0.2,
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
