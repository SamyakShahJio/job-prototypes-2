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

    // base64 → Blob URL
    const b64 = data.audios[0];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const audioBlob = new Blob([arr], { type: 'audio/wav' });
    return URL.createObjectURL(audioBlob);
  }

  /* ========== Ambient glow state controller ========== */
  function setGlowState(glowEl, state) {
    if (!glowEl) return;
    glowEl.setAttribute('data-state', state);
  }

  /* ========== Audio context unlock (iOS Safari) ========== */
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      const a = new Audio();
      a.muted = true;
      a.play().catch(() => {});
      audioUnlocked = true;
    } catch (e) {}
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
    let currentAudio = null;
    let lastTtsUrl = null;

    function notifyState(s) {
      setGlowState(glowEl, s);
      onState(s);
    }

    async function startRecording() {
      unlockAudio();
      if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
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
      try {
        notifyState('speaking');
        const url = await sarvamSynthesize(text, persona, langHint || 'en-IN');
        if (!url) { notifyState('idle'); return; }
        lastTtsUrl = url;

        if (currentAudio) { try { currentAudio.pause(); } catch (e) {} }
        currentAudio = new Audio(url);
        currentAudio.onended = () => notifyState('idle');
        currentAudio.onerror = () => notifyState('idle');
        await currentAudio.play();
      } catch (err) {
        onError(err);
        notifyState('idle');
      }
    }

    function replayLast() {
      if (!lastTtsUrl) return;
      try {
        if (currentAudio) currentAudio.pause();
        currentAudio = new Audio(lastTtsUrl);
        currentAudio.onended = () => notifyState('idle');
        notifyState('speaking');
        currentAudio.play();
      } catch (e) {}
    }

    function setGlow(el) { glowEl = el; }
    function setPersona(personaId) {
      const next = window.JBIQ_PERSONAS && window.JBIQ_PERSONAS[personaId];
      if (next) Object.assign(persona, next);
    }

    function stop() {
      stopRecording();
      if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
      notifyState('idle');
    }

    return {
      startRecording, stopRecording, speak, replayLast,
      setGlow, setPersona, stop,
      get isRecording() { return isRecording; },
    };
  }

  window.JBIQVoice = {
    create,
    sarvamTranscribe,
    sarvamSynthesize,
    convertToWav,
  };
})();
