/* JBIQ Voice Module — local-cache TTS player (ElevenLabs pre-generated)
 *
 * Architecture (post-migration from Sarvam):
 *   - ALL TTS audio is pre-generated at build time by tools/tts-build.js using
 *     the ElevenLabs API. The script writes MP3 files into assets/audio/
 *     and emits shared/tts-cache.js with a map: { "personaId:sha1(text)" → mp3 }.
 *   - At runtime we make ZERO external API calls. speak(text) hashes
 *     personaId+normalized text, looks up the MP3 file in window.TTS_CACHE,
 *     decodes it once via Web Audio API, and plays via BufferSourceNode.
 *   - On page load we prefetch every cached MP3 as ArrayBuffer in parallel so
 *     that the first speak() has its bytes already in memory.
 *   - STT uses the browser-native Web Speech API (on-device on Chrome / Edge).
 *     No external STT call is made. On unsupported browsers (Firefox/Safari
 *     desktop) the mic gracefully no-ops with an error callback.
 *
 * Public API (unchanged from prior Sarvam version — drop-in compatible):
 *   const voice = JBIQVoice.create({
 *     persona: 'jbiq_warm',
 *     glowEl: document.getElementById('myGlow'),
 *     onTranscript: (text, lang) => {},
 *     onState: (state) => {},     // 'idle' | 'listening' | 'thinking' | 'speaking'
 *     onError: (err) => {},
 *   });
 *   voice.startRecording(); voice.stopRecording(); voice.speak("…");
 *   voice.replayLast(); voice.setPersona(id); voice.stop();
 *
 *   JBIQVoice.prefetch(items)  // no-op; everything already pre-loaded.
 *
 * Load order in HTML: <script src="shared/personas.js">,
 *                      <script src="shared/tts-cache.js">,
 *                      <script src="shared/jbiq-voice.js">,
 *                      <script src="shared/multimodal.js">.
 */

(function () {
  'use strict';

  /* ============ Persona resolution ============ */
  function getPersona(personaId) {
    return (window.JBIQ_PERSONAS && (window.JBIQ_PERSONAS[personaId] || window.JBIQ_PERSONAS.jbiq_warm))
      || { id: 'jbiq_warm', voiceId: 'EXAVITQu4vr4xnSDxMaL' };
  }

  /* ============ Stable hash matching tools/tts-build.js ============
   * Build script:   sha1(personaId + ':' + normalized).hex.slice(0,16)
   * Runtime: same.  Uses SubtleCrypto.
   */
  const hashCache = new Map();
  async function sha1_16(s) {
    if (hashCache.has(s)) return hashCache.get(s);
    const enc = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest('SHA-1', enc);
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    hashCache.set(s, hex);
    return hex;
  }
  function normalizeText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }
  async function cacheKey(personaId, text) {
    const hash = await sha1_16(personaId + ':' + normalizeText(text));
    return personaId + ':' + hash;
  }

  /* ============ Audio context (single shared instance) ============ */
  let sharedCtx = null;
  let unlocked = false;
  let pendingPlays = [];
  let currentSource = null;

  function getCtx() {
    if (!sharedCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      sharedCtx = new Ctx();
    }
    return sharedCtx;
  }

  function unlock() {
    const ctx = getCtx();
    if (!ctx) return Promise.resolve();
    unlocked = true;
    if (ctx.state === 'running') {
      flushPending();
      return Promise.resolve();
    }
    return ctx.resume()
      .then(flushPending)
      .catch((e) => { console.warn('[JBIQVoice] resume failed:', e); flushPending(); });
  }

  function flushPending() {
    const q = pendingPlays.slice();
    pendingPlays = [];
    q.forEach(fn => { try { fn(); } catch (e) {} });
  }

  function attachUnlockListeners() {
    const onG = () => { unlock(); };
    ['click', 'touchstart', 'keydown', 'pointerdown', 'mousedown'].forEach(evt => {
      document.addEventListener(evt, onG, { capture: true, passive: true });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachUnlockListeners);
  } else {
    attachUnlockListeners();
  }

  function stopCurrent() {
    if (currentSource) {
      try { currentSource.stop(); } catch (e) {}
      try { currentSource.disconnect(); } catch (e) {}
      currentSource = null;
    }
  }

  /* ============ MP3 cache ============
   * arrayBufferCache: raw bytes (fetched once per file, no audio context needed)
   * audioBufferCache: decoded PCM (decoded once per file, replays are instant)
   */
  const arrayBufferCache = new Map();   // filename → Promise<ArrayBuffer>
  const audioBufferCache = new Map();   // filename → Promise<AudioBuffer>

  function fetchMp3(filename) {
    if (arrayBufferCache.has(filename)) return arrayBufferCache.get(filename);
    const p = fetch('assets/audio/' + filename).then(r => {
      if (!r.ok) throw new Error('Audio fetch failed: ' + filename + ' (' + r.status + ')');
      return r.arrayBuffer();
    });
    arrayBufferCache.set(filename, p);
    // If fetch fails, drop it from cache so next call retries.
    p.catch(() => { arrayBufferCache.delete(filename); });
    return p;
  }

  async function decodeMp3(filename) {
    if (audioBufferCache.has(filename)) return audioBufferCache.get(filename);
    const ctx = getCtx();
    if (!ctx) throw new Error('Web Audio API unavailable');
    const p = fetchMp3(filename).then(buf => ctx.decodeAudioData(buf.slice(0)));
    audioBufferCache.set(filename, p);
    p.catch(() => { audioBufferCache.delete(filename); });
    return p;
  }

  /* ============ Background prefetch ============
   * Once tts-cache.js is loaded, kick off fetches for every audio file so
   * they're warm by the time the user clicks anything. Decoding waits for
   * the AudioContext (which needs a user gesture), but the raw bytes are
   * cached in memory immediately.
   */
  let prefetchStarted = false;
  function prefetchAll() {
    if (prefetchStarted) return;
    prefetchStarted = true;
    const cache = window.TTS_CACHE || {};
    const files = new Set(Object.values(cache));
    files.forEach(filename => { fetchMp3(filename).catch(() => {}); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prefetchAll);
  } else {
    prefetchAll();
  }

  /* ============ Glow state controller ============ */
  function setGlowState(glowEl, state) {
    if (glowEl) glowEl.setAttribute('data-state', state);
  }

  /* ============ Play a decoded AudioBuffer ============ */
  async function playBuffer(audioBuffer, onEnded) {
    const ctx = getCtx();
    if (!ctx) throw new Error('Web Audio API unavailable');
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch (e) {}
    }
    stopCurrent();
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (currentSource === src) currentSource = null;
      if (onEnded) try { onEnded(); } catch (e) {}
    };
    currentSource = src;
    src.start(0);
    return new Promise((resolve) => {
      src.addEventListener('ended', resolve, { once: true });
    });
  }

  /* ============ Browser-native STT (Web Speech API, on-device) ============
   * No external API. Chrome/Edge support it; Firefox/Safari desktop don't.
   * For unsupported browsers, fall back to the text input dock.
   */
  function startBrowserSTT(opts) {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) return null;
    const rec = new R();
    rec.lang = 'en-IN';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const t = e.results[0] && e.results[0][0] && e.results[0][0].transcript;
      if (opts.onResult) opts.onResult(t || '', 'en-IN');
    };
    rec.onerror = (e) => {
      if (opts.onError) opts.onError(new Error('Speech recognition: ' + (e.error || 'unknown')));
    };
    rec.onend = () => { if (opts.onEnd) opts.onEnd(); };
    try { rec.start(); } catch (e) { if (opts.onError) opts.onError(e); return null; }
    return rec;
  }

  /* ============ Public API ============ */
  function create(opts) {
    opts = opts || {};
    let persona = getPersona(opts.persona);
    const onTranscript = opts.onTranscript || function () {};
    const onState = opts.onState || function () {};
    const onError = opts.onError || function (err) { console.error('[JBIQVoice]', err); };
    let glowEl = opts.glowEl || null;

    let stt = null;
    let isRecording = false;
    let lastFile = null;

    function notifyState(s) {
      setGlowState(glowEl, s);
      onState(s);
    }

    async function startRecording() {
      unlock();
      stopCurrent();
      isRecording = true;
      notifyState('listening');
      stt = startBrowserSTT({
        onResult: (text, lang) => {
          isRecording = false;
          notifyState('thinking');
          onTranscript(text, lang);
        },
        onEnd: () => {
          if (isRecording) { isRecording = false; notifyState('idle'); }
        },
        onError: (err) => {
          isRecording = false;
          notifyState('idle');
          onError(err);
        },
      });
      if (!stt) {
        isRecording = false;
        notifyState('idle');
        onError(new Error('Voice input not supported on this browser. Try the text box.'));
      }
    }

    function stopRecording() {
      if (stt) { try { stt.stop(); } catch (e) {} }
      isRecording = false;
    }

    async function speak(text, langHint) {
      try { unlock(); } catch (e) {}
      if (!unlocked) {
        // Queue for next gesture so playback is gesture-bound.
        return new Promise((resolve) => {
          pendingPlays.push(() => speak(text, langHint).then(resolve));
        });
      }
      try {
        const key = await cacheKey(persona.id || 'jbiq_warm', text);
        const filename = (window.TTS_CACHE || {})[key];
        if (!filename) {
          console.warn('[JBIQVoice] no cached audio for', persona.id, '·', (text || '').slice(0, 70));
          notifyState('idle');
          return;
        }
        notifyState('speaking');
        const ab = await decodeMp3(filename);
        lastFile = filename;
        await playBuffer(ab, () => notifyState('idle'));
      } catch (err) {
        onError(err);
        notifyState('idle');
      }
    }

    async function replayLast() {
      if (!lastFile) return;
      try { unlock(); } catch (e) {}
      try {
        const ab = await decodeMp3(lastFile);
        notifyState('speaking');
        await playBuffer(ab, () => notifyState('idle'));
      } catch (e) {
        notifyState('idle');
      }
    }

    function setGlow(el) { glowEl = el; }
    function setPersona(personaId) {
      persona = getPersona(personaId);
    }

    function stop() {
      stopRecording();
      stopCurrent();
      notifyState('idle');
    }

    return {
      startRecording, stopRecording, speak, replayLast,
      setGlow, setPersona, stop,
      get isRecording() { return isRecording; },
      get persona() { return persona; },
    };
  }

  // Back-compat shims. The old API exposed prefetch / prefetchOne for
  // Sarvam warm-up; with pre-generated audio these are no-ops, but pages
  // still call them.
  function noopPrefetch() { /* everything is already pre-loaded */ }

  window.JBIQVoice = {
    create,
    prefetch: noopPrefetch,
    prefetchOne: noopPrefetch,
    // Debug
    _cache: { array: arrayBufferCache, audio: audioBufferCache },
    _hash: sha1_16,
    _cacheKey: cacheKey,
  };
})();
