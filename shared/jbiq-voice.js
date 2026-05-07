/* JBIQ Voice Module — Sarvam STT/TTS integration
 *
 * Single entry point for all voice IO across the JCS prototype suite:
 *   - getUserMedia → MediaRecorder → WAV → Sarvam saarika:v2.5 (STT)
 *   - Sarvam bulbul:v2 (TTS) → audio playback with state callbacks
 *   - Ambient glow state controller (idle/listening/thinking/speaking)
 *   - Latency markers per MultimodalUX deck
 *
 * Usage:
 *   const voice = JBIQVoice.create({
 *     persona: 'jbiq_warm',          // see personas.js
 *     glowEl: document.getElementById('myGlow'),
 *     onTranscript: (text, lang) => { ... },
 *     onState: (state) => { ... },   // 'idle' | 'listening' | 'thinking' | 'speaking'
 *   });
 *   voice.startRecording();
 *   voice.stopRecording();
 *   voice.speak("Hello there.");
 */

(function () {
  'use strict';

  const SARVAM_API_KEY = 'sk_bjco0jfw_u9VUpaliZT6cAoT7EgaRxAks';
  const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
  const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';

  // Language autodetect mapping for TTS — Sarvam needs target_language_code
  const LANG_MAP = {
    'en': 'en-IN', 'en-IN': 'en-IN',
    'hi': 'hi-IN', 'hi-IN': 'hi-IN',
    'bn': 'bn-IN', 'gu': 'gu-IN', 'kn': 'kn-IN', 'ml': 'ml-IN',
    'mr': 'mr-IN', 'od': 'od-IN', 'pa': 'pa-IN', 'ta': 'ta-IN', 'te': 'te-IN',
  };

  function detectLangCode(input) {
    if (!input) return 'en-IN';
    const lower = input.toLowerCase();
    if (LANG_MAP[lower]) return LANG_MAP[lower];
    // Sometimes Sarvam returns "en-IN" already
    if (input.includes('-IN')) return input;
    return 'en-IN';
  }

  /* ========== WAV conversion (browser MediaRecorder gives webm/opus) ========== */
  async function convertToWav(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return audioBufferToWav(audioBuffer);
  }
  function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const length = buffer.length * blockAlign + 44;
    const ab = new ArrayBuffer(length);
    const view = new DataView(ab);
    let off = 0;
    function ws(s) { for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i)); }
    function w16(v) { view.setUint16(off, v, true); off += 2; }
    function w32(v) { view.setUint32(off, v, true); off += 4; }
    ws('RIFF'); w32(length - 8); ws('WAVE');
    ws('fmt '); w32(16); w16(format); w16(numChannels); w32(sampleRate);
    w32(sampleRate * blockAlign); w16(blockAlign); w16(bitDepth);
    ws('data'); w32(length - 44);
    const channels = [];
    for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
    let i = 0;
    while (i < buffer.length) {
      for (let c = 0; c < numChannels; c++) {
        const s = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
      i++;
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  /* ========== Sarvam STT call ========== */
  async function sarvamTranscribe(wavBlob) {
    const fd = new FormData();
    fd.append('file', wavBlob, 'audio.wav');
    fd.append('model', 'saarika:v2.5');
    fd.append('language_code', 'unknown'); // auto-detect

    const resp = await fetch(SARVAM_STT_URL, {
      method: 'POST',
      headers: { 'api-subscription-key': SARVAM_API_KEY },
      body: fd,
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error('STT failed: ' + resp.status + ' — ' + err);
    }
    const data = await resp.json();
    return {
      transcript: (data.transcript || '').trim(),
      language: data.language_code || 'en-IN',
    };
  }

  /* ========== Sarvam TTS call ========== */
  async function sarvamSynthesize(text, persona, langCode) {
    const target_language_code = detectLangCode(langCode);
    const cleaned = (text || '')
      .replace(/[#*_`>\[\](){}|~]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\n{2,}/g, '. ').replace(/\n/g, ' ')
      .replace(/\s{2,}/g, ' ').trim()
      .substring(0, 500);
    if (!cleaned) return null;

    const body = {
      text: cleaned,
      target_language_code,
      speaker: persona.speaker,
      model: persona.model || 'bulbul:v2',
      pitch: persona.pitch || 0,
      pace: persona.pace || 1.0,
      loudness: 1.0,
      speech_sample_rate: 22050,
      enable_preprocessing: true,
    };

    const resp = await fetch(SARVAM_TTS_URL, {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error('TTS failed: ' + resp.status + ' — ' + err);
    }
    const data = await resp.json();
    if (!data.audios || !data.audios[0]) throw new Error('TTS returned no audio');

    // base64 → ArrayBuffer (raw WAV bytes for Web Audio decoding)
    const b64 = data.audios[0];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  /* ========== TTS prefetch cache ==========
   * Pre-fetches expected greetings so they play INSTANTLY when triggered,
   * eliminating the 1-3s silent gap while Sarvam fetches.
   * Cache key: persona.speaker + '|' + text + '|' + lang
   */
  const ttsCache = new Map();
  function ttsKey(personaId, text, lang) {
    return personaId + '|' + (lang || 'en-IN') + '|' + (text || '').substring(0, 200);
  }
  async function prefetchTts(personaId, text, lang) {
    const persona = window.JBIQ_PERSONAS && window.JBIQ_PERSONAS[personaId];
    if (!persona) return null;
    const key = ttsKey(personaId, text, lang);
    if (ttsCache.has(key)) return ttsCache.get(key);
    try {
      const buf = await sarvamSynthesize(text, persona, lang || 'en-IN');
      if (buf) ttsCache.set(key, buf);
      return buf;
    } catch (e) {
      console.warn('[JBIQ] prefetch failed for', personaId, e);
      return null;
    }
  }
  function getCachedTts(personaId, text, lang) {
    return ttsCache.get(ttsKey(personaId, text, lang)) || null;
  }

  /* ========== Ambient glow state controller ========== */
  function setGlowState(glowEl, state) {
    if (!glowEl) return;
    glowEl.setAttribute('data-state', state);
  }

  /* ========== Audio playback — Web Audio API approach ==========
   * Why: HTMLAudioElement.play() loses gesture context across async/await
   * boundaries, which causes NotAllowedError when speak() runs after a setTimeout
   * or fetch chain. Web Audio API's AudioContext only needs to be resumed ONCE
   * from a user gesture; after that, all BufferSourceNode plays work freely.
   */
  let sharedAudioCtx = null;
  let audioUnlocked = false;
  let pendingGreets = [];        // queued speak calls if user hasn't gestured yet
  let currentBufferSource = null; // active playback so we can stop it

  function getAudioCtx() {
    if (!sharedAudioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioCtx = new Ctx();
    }
    return sharedAudioCtx;
  }

  function unlockAudio() {
    const ctx = getAudioCtx();
    if (!ctx) return Promise.resolve();
    if (ctx.state === 'running' && audioUnlocked) return Promise.resolve();
    return ctx.resume().then(() => {
      if (ctx.state === 'running') {
        audioUnlocked = true;
        flushPendingGreets();
      }
    }).catch(() => {});
  }

  function flushPendingGreets() {
    const queue = pendingGreets.slice();
    pendingGreets = [];
    queue.forEach(fn => { try { fn(); } catch (e) {} });
  }

  // Stop any active playback
  function stopActiveAudio() {
    if (currentBufferSource) {
      try { currentBufferSource.stop(); } catch (e) {}
      try { currentBufferSource.disconnect(); } catch (e) {}
      currentBufferSource = null;
    }
  }

  // Auto-unlock on first user gesture anywhere in the doc
  function attachUnlockListeners() {
    const onGesture = () => { unlockAudio(); };
    ['click', 'touchstart', 'keydown', 'pointerdown', 'mousedown'].forEach(evt => {
      document.addEventListener(evt, onGesture, { capture: true, passive: true });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachUnlockListeners);
  } else {
    attachUnlockListeners();
  }

  // Decode raw WAV bytes (from Sarvam base64) and play via Web Audio API.
  // Returns a promise that resolves when playback ends.
  async function playPcmBytes(arrayBuffer, onEnded) {
    const ctx = getAudioCtx();
    if (!ctx) throw new Error('Web Audio API unavailable');
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch (e) {}
    }
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    stopActiveAudio();
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    src.onended = () => {
      currentBufferSource = null;
      if (onEnded) try { onEnded(); } catch (e) {}
    };
    currentBufferSource = src;
    src.start(0);
    return new Promise((resolve) => {
      src.addEventListener('ended', resolve, { once: true });
    });
  }

  /* ========== Public API ========== */
  function create(opts) {
    opts = opts || {};
    const persona = (window.JBIQ_PERSONAS && window.JBIQ_PERSONAS[opts.persona])
      || (window.JBIQ_PERSONAS && window.JBIQ_PERSONAS.jbiq_warm)
      || { speaker: 'anushka', model: 'bulbul:v2', pitch: 0, pace: 1.0 };

    const onTranscript = opts.onTranscript || function () {};
    const onState = opts.onState || function () {};
    const onError = opts.onError || function (err) { console.error('[JBIQVoice]', err); };
    let glowEl = opts.glowEl || null;

    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let mediaStream = null;
    let lastTtsBuffer = null;

    function notifyState(s) {
      setGlowState(glowEl, s);
      onState(s);
    }

    async function startRecording() {
      unlockAudio();
      stopActiveAudio();
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm;codecs=opus' });
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = handleStop;
        mediaRecorder.start();
        isRecording = true;
        notifyState('listening');
      } catch (err) {
        onError(err);
        notifyState('idle');
      }
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
      isRecording = false;
    }

    async function handleStop() {
      if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
      if (audioChunks.length === 0) { notifyState('idle'); return; }

      notifyState('thinking');
      try {
        const webmBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const wavBlob = await convertToWav(webmBlob);
        const { transcript, language } = await sarvamTranscribe(wavBlob);

        if (!transcript) {
          notifyState('idle');
          onTranscript('', language);
          return;
        }
        onTranscript(transcript, language);
      } catch (err) {
        onError(err);
        notifyState('idle');
      }
    }

    async function speak(text, langHint) {
      // If audio isn't unlocked yet (no user gesture has happened), queue.
      if (!audioUnlocked) {
        return new Promise((resolve) => {
          pendingGreets.push(() => speak(text, langHint).then(resolve));
        });
      }
      try {
        // Try cache first — instant playback for prefetched greetings
        const cached = getCachedTts(persona.id, text, langHint || 'en-IN');
        if (cached) {
          notifyState('speaking');
          lastTtsBuffer = cached;
          await playPcmBytes(cached, () => notifyState('idle'));
          return;
        }

        notifyState('thinking'); // visible "Sarah is thinking…" state during fetch
        const arrayBuf = await sarvamSynthesize(text, persona, langHint || 'en-IN');
        if (!arrayBuf) { notifyState('idle'); return; }
        lastTtsBuffer = arrayBuf;
        // Save to cache so subsequent identical lines (replay) are instant
        ttsCache.set(ttsKey(persona.id, text, langHint || 'en-IN'), arrayBuf);

        notifyState('speaking');
        await playPcmBytes(arrayBuf, () => notifyState('idle'));
      } catch (err) {
        onError(err);
        notifyState('idle');
      }
    }

    function replayLast() {
      if (!lastTtsBuffer) return;
      notifyState('speaking');
      playPcmBytes(lastTtsBuffer, () => notifyState('idle')).catch(() => notifyState('idle'));
    }

    function setGlow(el) { glowEl = el; }
    function setPersona(personaId) {
      const next = window.JBIQ_PERSONAS && window.JBIQ_PERSONAS[personaId];
      if (next) Object.assign(persona, next);
    }

    function stop() {
      stopRecording();
      stopActiveAudio();
      notifyState('idle');
    }

    return {
      startRecording, stopRecording, speak, replayLast,
      setGlow, setPersona, stop,
      get isRecording() { return isRecording; },
    };
  }

  /* ========== Prefetch helper for pages =========================
   * Pages call JBIQVoice.prefetch([{ personaId, text, lang }, …]) on load.
   * Pre-fetches happen in background, gated by first user gesture (so we
   * don't waste bandwidth on bounced visitors).
   */
  function prefetchAll(items) {
    const doFetch = () => {
      items.forEach(it => {
        prefetchTts(it.personaId, it.text, it.lang || 'en-IN');
      });
    };
    if (audioUnlocked) {
      doFetch();
    } else {
      // Fire on first gesture
      const onGesture = () => {
        doFetch();
        ['click', 'touchstart', 'keydown'].forEach(e => document.removeEventListener(e, onGesture, { capture: true }));
      };
      ['click', 'touchstart', 'keydown'].forEach(e => document.addEventListener(e, onGesture, { capture: true, once: false, passive: true }));
    }
  }

  window.JBIQVoice = {
    create,
    sarvamTranscribe,
    sarvamSynthesize,
    convertToWav,
    prefetch: prefetchAll,
    prefetchOne: prefetchTts,
  };
})();
