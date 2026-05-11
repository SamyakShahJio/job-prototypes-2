#!/usr/bin/env node
/*
 * tts-build.js — Pre-generate every TTS line as a static MP3 file.
 *
 * Why: This is a canned prototype. Calling ElevenLabs at runtime introduces
 * 400-800ms latency per line, plus the API key would be exposed in the
 * browser. Pre-generating audio at build time gives us:
 *   - Zero perceived latency (audio is local, plays instantly)
 *   - No API key in client code
 *   - Works offline once loaded
 *   - Deterministic playback for demos
 *
 * Flow:
 *   1. Extract all (personaId, text) tuples from each HTML file's
 *      transcript data structures using regex.
 *   2. For each unique tuple, compute sha1(personaId + ':' + normalized text).
 *      That's the cache key + the MP3 filename.
 *   3. If the MP3 already exists, skip (incremental).
 *   4. Otherwise, POST to ElevenLabs TTS, save the response bytes to
 *      assets/audio/{hash}.mp3.
 *   5. Write shared/tts-cache.js with window.TTS_CACHE mapping every key
 *      to its filename. The runtime player reads this map.
 *
 * Run: node tools/tts-build.js
 *      ELEVENLABS_API_KEY=sk_... node tools/tts-build.js  (recommended)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'assets', 'audio');
const CACHE_FILE = path.join(ROOT, 'shared', 'tts-cache.js');

const API_KEY = process.env.ELEVENLABS_API_KEY || 'sk_a54501208ac5c0e413adce462cbabee4ba44f85d66934998';

// ============================================================================
// Persona voice IDs (must stay in sync with shared/personas.js)
// ============================================================================
const PERSONAS = {
  jbiq_warm:                    { voiceId: 'EXAVITQu4vr4xnSDxMaL', stability: 0.5,  similarityBoost: 0.75, style: 0.2 },
  jbiq_calm:                    { voiceId: 'XrExE9yKIg1WjnnlVkGX', stability: 0.65, similarityBoost: 0.75, style: 0.1 },
  sarah_avatar:                 { voiceId: 'EXAVITQu4vr4xnSDxMaL', stability: 0.55, similarityBoost: 0.8,  style: 0.3 },
  interviewer_bored_hr:         { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', stability: 0.75, similarityBoost: 0.6,  style: 0.0 },
  interviewer_formal_ops:       { voiceId: 'nPczCjzI2devNBz1zQrb', stability: 0.6,  similarityBoost: 0.75, style: 0.15 },
  interviewer_friendly_tl:      { voiceId: 'TX3LPaxmHKxFdv7VOQHJ', stability: 0.5,  similarityBoost: 0.75, style: 0.35 },
  interviewer_hostile_customer: { voiceId: 'cjVigY5qzO86Huf0OWal', stability: 0.4,  similarityBoost: 0.75, style: 0.55 },
  microlearning_coach:          { voiceId: 'cgSgspJ2msm6clMCkdW9', stability: 0.45, similarityBoost: 0.75, style: 0.4 },
  govt_exam_counselor:          { voiceId: 'FGY2WhTYpPnrIDTdsKH5', stability: 0.6,  similarityBoost: 0.75, style: 0.2 },
};

// ============================================================================
// Helpers
// ============================================================================

// Strip HTML tags (and unescape entities) so the line is spoken cleanly.
function stripHtml(s) {
  return s
    .replace(/<br\s*\/?>(\s*)/gi, '. ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Decode JS string-literal escapes that come out of regex matches.
// e.g. \" → ",  \\n → newline,  \\t → tab
function decodeJsString(s) {
  return s
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

// Stable cache key for (persona, text). Matches the runtime hash.
function cacheKey(personaId, text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const hash = crypto.createHash('sha1').update(personaId + ':' + normalized).digest('hex').slice(0, 16);
  return { hash, normalized };
}

// Read and return a file's contents.
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ============================================================================
// Extractors — one per HTML file. Each returns [{ personaId, text }, ...].
// ============================================================================

// Generic "find all `text: "..."` inside a JS array literal that's tagged with
// an explicit speaker." Matches both `speaker: 'ai', text: "..."` patterns.
function extractAiText(src, defaultPersonaId) {
  const out = [];
  // { speaker: 'ai', text: "..." }  OR  { speaker: 'ai', text: '...' }
  const re = /\{\s*speaker:\s*['"](ai|agent|coach|interviewer)['"][^}]*?text:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const raw = m[2] !== undefined ? m[2] : m[3];
    out.push({ personaId: defaultPersonaId, text: decodeJsString(raw) });
  }
  return out;
}

// Pull strings tagged with `personaId:` (used in prefetch arrays).
function extractPersonaTaggedText(src) {
  const out = [];
  const re = /personaId:\s*['"]([a-z_]+)['"][^}]*?text:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const raw = m[2] !== undefined ? m[2] : m[3];
    out.push({ personaId: m[1], text: decodeJsString(raw) });
  }
  return out;
}

// Pull strings from objects with a `text:` field that don't have a speaker
// tag (used for `PROBLEM_FLOWS` steps in microlearning). The persona is
// inferred from the file.
function extractTextOnlyFields(src, personaId) {
  const out = [];
  // text: "..." or text: '...'  — paired with the immediately preceding context
  // We grab them all; the caller filters/dedupes.
  const re = /\btext:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    out.push({ personaId, text: decodeJsString(raw) });
  }
  return out;
}

// Pull `say:` or `ai:` fields (used in landing's ROUTING and govt-exam's
// DISCOVERY_FLOW structures).
function extractSayFields(src, personaId) {
  const out = [];
  const re = /\b(say|ai):\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const raw = m[2] !== undefined ? m[2] : m[3];
    out.push({ personaId, text: decodeJsString(raw) });
  }
  return out;
}

// Pull inline `<thing>.speak("…")` or `<thing>.speak('…')` calls. The match
// pattern is the prefix regex (e.g. /ensureMLVoice\(\)\.speak/g), and the
// extractor captures the immediately-following quoted string argument.
function extractInlineSpeakCalls(src, prefixRe, personaId) {
  const out = [];
  // Combined regex: prefix + ( + optional whitespace + "..." or '...'
  const source = prefixRe.source + '\\(\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|\'((?:[^\'\\\\]|\\\\.)*)\')';
  const combined = new RegExp(source, 'g');
  let m;
  while ((m = combined.exec(src)) !== null) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    if (raw) out.push({ personaId, text: decodeJsString(raw) });
  }
  return out;
}

// ============================================================================
// Per-file extractors
// ============================================================================

function extractFromIndex() {
  const src = read('index.html');
  const lines = [];
  // ROUTING.say → jbiq_warm
  lines.push(...extractSayFields(src, 'jbiq_warm'));
  // Inline `voice.speak("…")` (fallback line)
  lines.push(...extractInlineSpeakCalls(src, /voice\.speak/g, 'jbiq_warm'));
  return lines;
}

function extractFromEnglish() {
  const src = read('english.html');
  const lines = [];

  // Inline ai-tagged lines in SARAH_TRANSCRIPT and the situation transcripts
  // are tagged with speaker: 'ai' or speaker: 'agent'. Sarah's persona is
  // sarah_avatar.
  lines.push(...extractAiText(src, 'sarah_avatar'));

  // The agent lines in situational call-center role-plays are also Sarah
  // (she's role-playing the agent). Already covered by the regex above.

  // Inline filler / non-ai speakers (customer / manager / colleague) — these
  // are voiced by the "other side" of the role-play, which is JBIQ's faceless
  // demo voice. Use jbiq_warm.
  const otherRe = /\{\s*speaker:\s*['"](customer|manager|colleague)['"][^}]*?text:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let m;
  while ((m = otherRe.exec(src)) !== null) {
    const raw = m[2] !== undefined ? m[2] : m[3];
    lines.push({ personaId: 'jbiq_warm', text: decodeJsString(raw) });
  }

  return lines;
}

function extractFromInterview() {
  const src = read('interview-prep.html');
  const lines = [];

  // Block-extract each MOCK_TRANSCRIPTS company key, since each block uses
  // a different persona. Keys are quoted with single quotes in the source.
  const companies = [
    { key: 'tech-mahindra', personaId: 'interviewer_formal_ops' },
    { key: 'concentrix',    personaId: 'interviewer_bored_hr' },
    { key: 'hdfc',          personaId: 'interviewer_friendly_tl' },
    { key: 'bajaj',         personaId: 'interviewer_hostile_customer' },
  ];

  for (const c of companies) {
    // Find the start of the array literal: 'tech-mahindra': [
    const startRe = new RegExp("'" + c.key + "':\\s*\\[");
    const startMatch = src.match(startRe);
    if (!startMatch) {
      console.warn('[manifest] could not find MOCK_TRANSCRIPTS block for:', c.key);
      continue;
    }
    const startIdx = startMatch.index + startMatch[0].length;
    // Walk forward, counting brackets, ignoring brackets inside strings.
    let depth = 1, i = startIdx, inStr = null;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (inStr) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === inStr) inStr = null;
      } else {
        if (ch === '"' || ch === "'") inStr = ch;
        else if (ch === '[') depth++;
        else if (ch === ']') depth--;
      }
      i++;
    }
    const block = src.substring(startIdx, i - 1);
    lines.push(...extractAiText(block, c.personaId));
  }

  // Also grab `personaId:` tagged prefetch lists.
  lines.push(...extractPersonaTaggedText(src));

  // Inline `pepVoice.speak("…")` — pep talk summary (Hey Rohit…).
  lines.push(...extractInlineSpeakCalls(src, /pepVoice\.speak/g, 'jbiq_warm'));

  // The PRACTICE_BANK transcripts (Q&A roleplays) — these are AI questions for
  // the user to answer. Use interviewer_formal_ops as the default voice.
  // Already covered by the speaker:'ai' regex.

  return lines;
}

function extractFromMicrolearning() {
  const src = read('microlearning.html');
  const lines = [];

  // PROBLEM_FLOWS has many `text:` fields — these are the coach's lines.
  // Heuristic: extract every `text:` then filter the manifest to dedupe.
  lines.push(...extractTextOnlyFields(src, 'microlearning_coach'));
  // PROBLEM_FLOWS also has `rootCause:` fields that get spoken on chip pick.
  const rcRe = /\brootCause:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let m;
  while ((m = rcRe.exec(src)) !== null) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    lines.push({ personaId: 'microlearning_coach', text: decodeJsString(raw) });
  }
  // Explicit personaId-tagged lines (Bata — kya stuck hai etc.)
  lines.push(...extractPersonaTaggedText(src));
  // Inline ai-tagged lines
  lines.push(...extractAiText(src, 'microlearning_coach'));
  // Inline ensureMLVoice().speak("…") — opener spoken directly.
  lines.push(...extractInlineSpeakCalls(src, /ensureMLVoice\(\)\.speak/g, 'microlearning_coach'));

  return lines;
}

function extractFromGovtExam() {
  const src = read('govt-exam.html');
  const lines = [];
  // DISCOVERY_FLOW + DISCOVERY_BRANCHES have `ai: "..."` fields.
  lines.push(...extractSayFields(src, 'govt_exam_counselor'));
  // Reality-check objects also have an `end:` field that's spoken on closing.
  const endRe = /\bend:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let m;
  while ((m = endRe.exec(src)) !== null) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    // Filter out the literal "end" inside JS keywords / unrelated contexts:
    // we only want longer strings (real spoken lines, > 10 chars).
    if (raw && raw.length > 10) {
      lines.push({ personaId: 'govt_exam_counselor', text: decodeJsString(raw) });
    }
  }
  // personaId-tagged prefetch lists.
  lines.push(...extractPersonaTaggedText(src));
  // ai-tagged inline transcripts.
  lines.push(...extractAiText(src, 'govt_exam_counselor'));
  // Inline `ensureDiscVoice().speak("…")`.
  lines.push(...extractInlineSpeakCalls(src, /ensureDiscVoice\(\)\.speak/g, 'govt_exam_counselor'));
  return lines;
}

// ============================================================================
// Main: collect, dedupe, generate.
// ============================================================================

function collectManifest() {
  const all = [
    ...extractFromIndex(),
    ...extractFromEnglish(),
    ...extractFromInterview(),
    ...extractFromMicrolearning(),
    ...extractFromGovtExam(),
  ];

  // Filter out lines that look like user chips, exam options, or button labels:
  //   - Single-letter "A", "B" options
  //   - Pure key labels like "thumbnail" or "title"
  //   - Anything containing HTML form-field markup
  // Heuristic: keep lines that have at least 3 words OR a sentence-ending mark.
  const cleaned = [];
  const seen = new Set();

  for (const item of all) {
    const text = stripHtml(item.text);
    if (!text || text.length < 4) continue;
    // Likely a button/chip label if it's short and has no spaces/punctuation
    if (text.length < 12 && !/[.?!,;:]/.test(text) && text.split(/\s+/).length < 3) continue;
    // Likely a chip key — single word lowercase
    if (/^[a-z_]+$/.test(text)) continue;
    // Skip multiple-choice answer options ("8%", "5.50%", "Some flowers are roots") — these are short and don't end in punctuation
    // They'd be filtered by the sentence-ending check above already in most cases.

    const dedupKey = item.personaId + '::' + text;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    cleaned.push({ personaId: item.personaId, text });
  }

  return cleaned;
}

// ElevenLabs TTS POST → Buffer
function synthesize(personaId, text) {
  const persona = PERSONAS[personaId];
  if (!persona) throw new Error('Unknown persona: ' + personaId);

  const body = JSON.stringify({
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: persona.stability,
      similarity_boost: persona.similarityBoost,
      style: persona.style,
      use_speaker_boost: true,
    },
  });

  const opts = {
    method: 'POST',
    hostname: 'api.elevenlabs.io',
    path: '/v1/text-to-speech/' + persona.voiceId,
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode === 200 && buf.length > 100) {
          resolve(buf);
        } else {
          reject(new Error(`TTS ${res.statusCode} — ` + buf.toString('utf8').slice(0, 240)));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const manifest = collectManifest();
  console.log(`Manifest: ${manifest.length} unique lines\n`);

  const cache = {};            // { "personaId:hash": filename }
  let generated = 0, skipped = 0, failed = 0;

  for (let i = 0; i < manifest.length; i++) {
    const { personaId, text } = manifest[i];
    const { hash } = cacheKey(personaId, text);
    const filename = hash + '.mp3';
    const filePath = path.join(AUDIO_DIR, filename);
    const cacheKeyStr = personaId + ':' + hash;

    if (fs.existsSync(filePath)) {
      cache[cacheKeyStr] = filename;
      skipped++;
      if ((i + 1) % 20 === 0 || i === manifest.length - 1) {
        process.stdout.write(`  [${i + 1}/${manifest.length}] cached  `);
      }
      continue;
    }

    try {
      const buf = await synthesize(personaId, text);
      fs.writeFileSync(filePath, buf);
      cache[cacheKeyStr] = filename;
      generated++;
      process.stdout.write(`  [${i + 1}/${manifest.length}] ${personaId.padEnd(30)} ${(buf.length / 1024).toFixed(1)}KB  "${text.slice(0, 56)}${text.length > 56 ? '…' : ''}"\n`);
    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${manifest.length}] FAILED ${personaId} — ${err.message}`);
    }
  }

  // Write the runtime cache lookup
  const header = `/* tts-cache.js — generated by tools/tts-build.js. DO NOT EDIT.
 * Maps "personaId:sha1(text)" → mp3 filename in assets/audio/.
 * Runtime: shared/jbiq-voice.js does the lookup. */\n\n`;
  fs.writeFileSync(CACHE_FILE, header + 'window.TTS_CACHE = ' + JSON.stringify(cache, null, 2) + ';\n');

  console.log(`\nDone — generated: ${generated}, cached: ${skipped}, failed: ${failed}`);
  console.log(`Audio: ${AUDIO_DIR}`);
  console.log(`Cache: ${CACHE_FILE}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
