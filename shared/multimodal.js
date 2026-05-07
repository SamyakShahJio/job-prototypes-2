/* Multimodal Helpers — latency markers + voice/text handoff
 *
 * Implements patterns from MultimodalUX_consolidated.pptx:
 *   - Latency markers (slide 18): spoken filler, contextual micro-copy,
 *     ambient color, sound cue, contextual streaming, skeleton cards
 *   - Mid-flow handoff (slide 16): tap keyboard while speaking → transcript stays;
 *     tap mic while typing → voice picks up where text left off
 *
 * No framework dependencies. Plain JS attached to window.MM.
 */

(function () {
  'use strict';

  /* ============================================================
   * Latency markers
   * ============================================================ */

  // Contextual micro-copy bank — shown while system is "thinking"
  // The deck (slide 18) recommends task-tailored text over generic "Thinking…"
  const MICROCOPY = {
    routing:        ['Looking up the right place for you…', 'Routing your ask…'],
    interview_prep: ['Pulling Tech Mahindra interview patterns…', 'Setting up your mock…'],
    english_pack:   ['Loading your scenario…', 'Setting up the practice…'],
    govt_exam:      ['Looking up exam dates…', 'Pulling syllabus mapping…'],
    microlearning:  ['Looking for the best path…', 'Pulling courses…'],
    avatar_chat:    ['Sarah is thinking…', 'Mmm, one second…'],
    fallback:       ['Thinking…', 'One second…'],
  };

  function getMicrocopy(category) {
    const bank = MICROCOPY[category] || MICROCOPY.fallback;
    return bank[Math.floor(Math.random() * bank.length)];
  }

  // Type a string into a target element character by character (progressive streaming)
  function streamText(targetEl, text, opts) {
    opts = opts || {};
    const speed = opts.speed || 14; // ms per char
    const onDone = opts.onDone || function () {};
    let i = 0;
    targetEl.textContent = '';
    targetEl.classList.add('mm-streaming');
    const interval = setInterval(() => {
      if (i >= text.length) {
        clearInterval(interval);
        targetEl.classList.remove('mm-streaming');
        onDone();
        return;
      }
      targetEl.textContent += text.charAt(i);
      i++;
    }, speed);
    return () => { clearInterval(interval); targetEl.classList.remove('mm-streaming'); };
  }

  // Append HTML message to a chat container, optionally streamed
  function appendMessage(containerEl, html, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (opts.role === 'user' ? 'msg-user' : 'msg-ai') + ' fade-in-up';
    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + (opts.role === 'user' ? 'bubble-user' : 'bubble-ai');
    if (opts.stream && opts.role !== 'user') {
      bubble.textContent = '';
      wrap.appendChild(bubble);
      containerEl.appendChild(wrap);
      containerEl.scrollTop = containerEl.scrollHeight;
      streamText(bubble, html.replace(/<[^>]+>/g, ''), { speed: opts.speed || 12, onDone: opts.onDone });
    } else {
      bubble.innerHTML = html;
      wrap.appendChild(bubble);
      containerEl.appendChild(wrap);
      containerEl.scrollTop = containerEl.scrollHeight;
      if (opts.onDone) setTimeout(opts.onDone, 100);
    }
    return wrap;
  }

  // Skeleton card placeholder — for rich UI cards while loading
  function skeletonCard(containerEl, height) {
    const sk = document.createElement('div');
    sk.className = 'mm-skeleton-card fade-in';
    sk.style.cssText = `
      height: ${height || 80}px;
      border-radius: 16px;
      background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: skeletonShimmer 1.4s infinite;
      margin: 8px 0;
    `;
    containerEl.appendChild(sk);
    return sk;
  }

  // Inject skeleton shimmer keyframes once
  if (!document.getElementById('mm-skeleton-style')) {
    const s = document.createElement('style');
    s.id = 'mm-skeleton-style';
    s.textContent = `
      @keyframes skeletonShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      .mm-streaming::after { content: '▌'; opacity: 0.6; animation: mmCaret 0.8s steps(2) infinite; margin-left: 2px; color: var(--primary); }
      @keyframes mmCaret { 0%, 50% { opacity: 0.6; } 50.01%, 100% { opacity: 0; } }
      .mm-status-pill {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 6px 14px; border-radius: 999px;
        background: var(--primary-light); color: var(--primary);
        font-size: 12px; font-weight: 600;
        animation: fadeIn 0.3s ease-out;
      }
      .mm-status-pill .dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--primary);
        animation: mmPulse 1s ease-in-out infinite;
      }
      @keyframes mmPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    `;
    document.head.appendChild(s);
  }

  // Status pill for "thinking" state — shows contextual micro-copy
  function showStatusPill(parentEl, category) {
    let pill = parentEl.querySelector('.mm-status-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'mm-status-pill';
      pill.innerHTML = '<span class="dot"></span><span class="text"></span>';
      parentEl.appendChild(pill);
    }
    pill.querySelector('.text').textContent = getMicrocopy(category);
    pill.style.display = 'inline-flex';
    return {
      hide: () => { pill.style.display = 'none'; },
      remove: () => { pill.remove(); },
    };
  }

  /* ============================================================
   * Sound cues
   * ============================================================ */

  let soundCtx = null;
  function ensureSoundCtx() {
    if (!soundCtx) {
      soundCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (soundCtx.state === 'suspended') soundCtx.resume();
    return soundCtx;
  }
  // Soft ding when response is ready
  function chime() {
    try {
      const ctx = ensureSoundCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  }

  /* ============================================================
   * Mid-flow voice ↔ text handoff
   * Pattern: input bar with both mic + keyboard; tapping the other
   * mode pauses the current one but preserves transcript.
   * ============================================================ */

  function bindHandoff(opts) {
    const inputEl = opts.inputEl;       // text <input>
    const micBtn = opts.micBtn;
    const keyboardBtn = opts.keyboardBtn;
    const voice = opts.voice;            // JBIQVoice instance
    let lastTranscript = '';

    if (micBtn) {
      micBtn.addEventListener('click', () => {
        // If user was typing → preserve text, switch to voice
        if (inputEl && inputEl.value) {
          lastTranscript = inputEl.value;
        }
        if (voice.isRecording) {
          voice.stopRecording();
        } else {
          voice.startRecording();
        }
      });
    }

    if (keyboardBtn && inputEl) {
      keyboardBtn.addEventListener('click', () => {
        // If user was speaking → stop, focus input (any partial transcript already in inputEl)
        if (voice.isRecording) voice.stopRecording();
        inputEl.focus();
      });
    }

    return {
      receiveTranscript(text) {
        if (inputEl) {
          // Append rather than replace — handoff preserves prior typing
          if (lastTranscript && !inputEl.value) inputEl.value = lastTranscript;
          inputEl.value = (inputEl.value ? inputEl.value + ' ' : '') + text;
          lastTranscript = inputEl.value;
        }
      },
    };
  }

  /* ============================================================
   * Spoken filler — used selectively (interview, avatar) per Section B.
   * Plays a tiny "ek second…" via TTS while real response is generating.
   * ============================================================ */

  async function spokenFiller(voice, persona) {
    if (!voice || !persona) return;
    const phrase = persona.fillerPhrase || 'Ek second…';
    try { await voice.speak(phrase); } catch (e) {}
  }

  /* ============================================================
   * Public API
   * ============================================================ */

  window.MM = {
    getMicrocopy,
    streamText,
    appendMessage,
    skeletonCard,
    showStatusPill,
    chime,
    bindHandoff,
    spokenFiller,
  };
})();
