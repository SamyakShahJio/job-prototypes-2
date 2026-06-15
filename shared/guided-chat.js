/* Guided Chat Runner — finite-state-machine style scripted chat
 *
 * Usage:
 *   const runner = GC.create({
 *     script: SARAH_SCRIPT,
 *     chatEl: document.getElementById('myChat'),
 *     chipsEl: document.getElementById('myChips'),
 *     voice: avatarVoice,           // JBIQVoice instance for TTS (or null)
 *     speakerLabel: 'Sarah',         // shown on AI bubbles
 *     onAction: (action) => { … }   // optional, for special actions like 'goto_packs'
 *   });
 *   runner.start();    // plays from script.start
 *   runner.play(id);   // jump to a specific node
 *
 * Script shape:
 *   {
 *     start: 'greet',
 *     nodes: {
 *       greet: {
 *         ai: "Hi! How are you?",       // text spoken via TTS + appended as bubble
 *         card: { ... },                  // optional Rich UI card (see below)
 *         chips: [
 *           { text: "Good", to: 'good' },
 *           { text: "Bad", to: 'bad' },
 *         ],
 *       },
 *       good: { ai: "...", chips: [...] },
 *       end: { ai: "Bye!", end: true },           // terminal node
 *       jump: { action: 'goto_packs' },           // calls onAction('goto_packs')
 *     }
 *   }
 *
 * Card shape (any subset):
 *   {
 *     kind: 'tip' | 'correction' | 'phrase' | 'feedback' | 'practice' | 'score',
 *     icon: '<svg>...</svg>' | 'data-icon name',
 *     label: 'PHRASE TIP',
 *     content: 'Some text…',
 *     before: '...',  after: '...',  better: '...',  why: '...',
 *     metrics: [{ v: 72, l: 'Score' }, ...],     // for feedback
 *     scoreNum: 72, scoreLabel: '…',              // for score
 *     keyPhrase: 'I completely understand.', playId: 'p1',  // for practice
 *     actions: [{ label: 'Save', action: 'save' }],
 *   }
 */

(function () {
  'use strict';

  const ICONS = {
    tip:        '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M9.5 8a2.5 2.5 0 115 0c0 1-.5 1.5-1.5 2.5S12 12 12 13M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    correction: '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M5 5l14 14M5 19L19 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    phrase:     '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm5.21 7.71l-6 6a1.002 1.002 0 01-1.42 0l-3-3a1.003 1.003 0 111.42-1.42l2.29 2.3 5.29-5.3a1.004 1.004 0 011.42 1.42z"/></svg>',
    feedback:   '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M3 12l4-4 4 4 4-8 6 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    practice:   '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7L8 5z"/></svg>',
    score:      '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M21.37 9.61a1.964 1.964 0 00-1.52-1.284l-4.235-.646-1.899-4.087a1.917 1.917 0 00-3.434 0L8.38 7.68l-4.273.646a1.964 1.964 0 00-1.52 1.283 1.91 1.91 0 00.447 1.901l3.124 3.213-.74 4.553a1.91 1.91 0 002.88 2.07l3.788-2.091 3.788 2.09a1.9 1.9 0 002.88-2.033l-.74-4.552 3.123-3.213a1.91 1.91 0 00.333-1.93z"/></svg>',
  };

  // Tiny play-icon SVG, reused on every Listen button inside a card.
  const PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M8 5v14l11-7z"/></svg>';
  function esc(s) { return (s == null ? '' : String(s)).replace(/"/g, '&quot;'); }

  function buildCardHtml(card) {
    const kind = card.kind || 'tip';
    const icon = card.icon || ICONS[kind] || ICONS.tip;
    let html = `<div class="rich-card rich-card--${kind}">`;
    html += `<div class="rc-h"><div class="rc-icon">${icon}</div><div class="rc-label">${card.label || kind}</div></div>`;
    if (card.content) html += `<div class="rc-content">${card.content}</div>`;

    // Voice-coaching notes (compact list, one per critique aspect). Each note
    // can carry { tone: 'good'|'bad'|'warn', text: 'Pace was good — 138 wpm' }
    // or just be a plain string. Rendered above the better-answer block.
    if (card.notes && card.notes.length) {
      html += '<ul class="rc-notes">';
      card.notes.forEach(n => {
        const tone = typeof n === 'object' ? (n.tone || '') : '';
        const text = typeof n === 'object' ? (n.text || '') : n;
        html += `<li class="rc-note ${tone}"><span class="rc-note-dot"></span>${text}</li>`;
      });
      html += '</ul>';
    }

    if (card.before) html += `<div class="rc-before"><span class="rc-row-label">You said</span><span class="rc-row-text">${card.before}</span></div>`;
    if (card.after)  html += `<div class="rc-after"><span class="rc-row-label">Better</span><span class="rc-row-text">${card.after}</span></div>`;

    // "Better answer" block — now with an inline Listen button so the coach
    // can speak the model line. The button uses data-rc-play same as keyPhrase.
    if (card.better) {
      html += `
        <div class="rc-better-block">
          <div class="rc-better-h"><span>Hear how this could be better</span></div>
          <div class="rc-better-row">
            <span class="rc-better-text">"${card.better}"</span>
            <button class="rc-better-play" data-rc-play="${esc(card.better)}" title="Listen">
              ${PLAY_SVG}<span>Listen</span>
            </button>
          </div>
        </div>`;
    }

    // Pronunciation feedback — { you: 'wrong-attempt', suggested: 'correct-version' }
    // Modelled on the old english.ts pronunciation card pattern.
    if (card.pronunciation) {
      const p = card.pronunciation;
      html += `
        <div class="rc-pron">
          <div class="rc-pron-h">Pronunciation check</div>
          <div class="rc-pron-wrong">You said: <em>"${p.you || ''}"</em></div>
          <div class="rc-pron-right">
            <span>Try: <strong>"${p.suggested || ''}"</strong></span>
            <button class="rc-pron-play" data-rc-play="${esc(p.suggested || '')}">
              ${PLAY_SVG}<span>Listen</span>
            </button>
          </div>
        </div>`;
    }

    if (card.why)    html += `<div class="rc-meta">${card.why}</div>`;
    if (card.scoreNum != null) {
      html += `<div class="rc-score-num">${card.scoreNum}</div>`;
      html += `<div class="rc-score-l">${card.scoreLabel || 'Score'}</div>`;
    }
    if (card.metrics) {
      html += `<div class="rc-metrics">`;
      card.metrics.forEach(m => {
        const cls = m.tone ? ' ' + m.tone : '';
        html += `<div class="rc-metric${cls}"><div class="rc-metric-v">${m.v}</div><div class="rc-metric-l">${m.l}</div></div>`;
      });
      html += `</div>`;
    }
    if (card.keyPhrase) {
      html += `<div class="rc-key-phrase"><span>"${card.keyPhrase}"</span><button class="rc-key-play" data-rc-play="${esc(card.keyPhrase)}">${PLAY_SVG}</button></div>`;
    }
    if (card.actions && card.actions.length) {
      html += `<div class="rc-actions">`;
      card.actions.forEach(a => {
        const cls = a.kind === 'secondary' ? ' rc-btn-secondary' : '';
        html += `<button class="rc-btn${cls}" data-rc-action="${a.action || ''}">${a.label}</button>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  function create(opts) {
    const {
      script,
      chatEl,
      chipsEl,
      voice = null,
      speakerLabel = 'AI',
      streamSpeed = 14,
      onAction = null,
      onCardAction = null,
      onCardPlay = null,        // (text) => void; defaults to voice.speak(text)
    } = opts;

    function appendAi(text) {
      const wrap = document.createElement('div');
      wrap.className = 'gc-msg gc-msg-ai';
      // Speaker label removed — AI bubbles are anonymous now (no "JBIQ" /
      // "Sarah" / "Priya" pill above each bubble). The bubble shape itself
      // identifies who's speaking.
      wrap.innerHTML = `<div class="gc-bubble gc-bubble-ai"><span class="gc-bubble-text"></span></div>`;
      chatEl.appendChild(wrap);
      const target = wrap.querySelector('.gc-bubble-text');
      if (window.MM && window.MM.streamText) {
        window.MM.streamText(target, text, { speed: streamSpeed, onDone: scrollChat });
      } else {
        target.textContent = text;
      }
      scrollChat();
    }

    function appendUser(text) {
      const wrap = document.createElement('div');
      wrap.className = 'gc-msg gc-msg-user';
      wrap.innerHTML = `<div class="gc-bubble gc-bubble-user">${text}</div>`;
      chatEl.appendChild(wrap);
      scrollChat();
    }

    function appendCard(card) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildCardHtml(card);
      const cardEl = wrap.firstElementChild;
      chatEl.appendChild(cardEl);
      // Wire card buttons
      cardEl.querySelectorAll('[data-rc-play]').forEach(btn => {
        btn.addEventListener('click', () => {
          const txt = btn.getAttribute('data-rc-play');
          if (onCardPlay) onCardPlay(txt);
          else if (voice && txt) voice.speak(txt, 'en-IN');
        });
      });
      cardEl.querySelectorAll('[data-rc-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = btn.getAttribute('data-rc-action');
          if (onCardAction) onCardAction(a, card);
        });
      });
      scrollChat();
    }

    function showChips(chips, onPick, prompt) {
      const promptText = prompt || 'Pick a reply';
      let html = `<div class="gc-chip-prompt">${promptText}</div><div class="gc-chip-row"></div>`;
      chipsEl.innerHTML = html;
      const row = chipsEl.querySelector('.gc-chip-row');
      chips.forEach(c => {
        const b = document.createElement('button');
        b.className = 'gc-chip';
        let inner = '';
        if (c.tag) {
          const tagCls = c.tagKind ? ' tag-' + c.tagKind : '';
          inner += `<span class="gc-chip-tag${tagCls}">${c.tag}</span>`;
        }
        inner += c.text;
        b.innerHTML = inner;
        b.onclick = () => onPick(c);
        row.appendChild(b);
      });
    }

    function clearChips() {
      chipsEl.innerHTML = '';
    }

    function scrollChat() {
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    function play(nodeId) {
      const node = script.nodes[nodeId];
      if (!node) {
        console.warn('[GC] missing node:', nodeId);
        return;
      }

      if (node.action) {
        if (onAction) onAction(node.action, node);
        return;
      }

      let delay = 0;
      if (node.ai) {
        appendAi(node.ai);
        // Speak via TTS shortly after appending — give the streaming a head start
        if (voice) {
          setTimeout(() => { try { voice.speak(node.ai, 'en-IN'); } catch (e) {} }, 80);
        }
        delay = Math.max(node.ai.length * streamSpeed, 800);
      }

      if (node.card) {
        setTimeout(() => appendCard(node.card), Math.max(delay - 100, 400));
        delay += 200;
      }

      if (node.end) {
        setTimeout(() => {
          chipsEl.innerHTML = `
            <div class="gc-chip-row">
              <button class="gc-chip" id="gc-restart-${Date.now()}">Start over</button>
            </div>`;
          chipsEl.querySelector('button').addEventListener('click', () => {
            chatEl.innerHTML = '';
            clearChips();
            play(script.start);
          });
        }, delay + 200);
      } else if (node.chips) {
        setTimeout(() => {
          showChips(node.chips, (chip) => {
            appendUser(chip.text);
            clearChips();
            setTimeout(() => play(chip.to), 500);
          }, node.chipPrompt);
        }, Math.max(delay, 600));
      }
    }

    function start() {
      chatEl.innerHTML = '';
      clearChips();
      play(script.start);
    }

    return {
      start, play, appendAi, appendUser, appendCard, clearChips, showChips,
    };
  }

  /* =========================================================================
   * Linear transcript runner — demo auto-plays, no user input.
   *
   * Usage:
   *   const t = GC.createTranscript({
   *     transcript: [
   *       { speaker: 'ai',   text: "Hi Pooja! How's your day?" },
   *       { speaker: 'user', text: "Tough day at the BPO." },
   *       { speaker: 'ai',   text: "Sorry to hear that. What happened?" },
   *       { speaker: 'card', card: { kind: 'tip', label: 'Phrase tip', content: '...' } },
   *       ...
   *     ],
   *     chatEl, voice, speakerLabel: 'Sarah',
   *     onComplete: () => {},   // optional, called when transcript ends
   *   });
   *   t.start();
   *   t.stop();   // stop early
   *
   * For 'user' turns, the bubble first shows a transcribing-pulse (3 dots),
   * then text fades in to simulate live STT being shown to the user.
   */
  function createTranscript(opts) {
    const {
      transcript,
      chatEl,
      voice = null,
      speakerLabel = 'AI',
      streamSpeed = 14,
      onComplete = null,
      autoScroll = true,
      skipFirstSpeak = false,    // when true, the first 'ai' item only renders bubble
                                  // (caller already triggered TTS within gesture context)
      clearOnStart = true,        // when false, append to the existing thread instead
                                  // of wiping it (keeps prior content visible)
    } = opts;

    let i = 0;
    let stopped = false;
    let timers = [];
    let firstAiSpoken = !skipFirstSpeak;  // if skipFirstSpeak, treat it as already done

    function scrollChat() {
      if (autoScroll) chatEl.scrollTop = chatEl.scrollHeight;
    }

    function appendAi(text) {
      const wrap = document.createElement('div');
      wrap.className = 'gc-msg gc-msg-ai';
      // Anonymous AI bubble (speaker pill removed app-wide).
      wrap.innerHTML = `<div class="gc-bubble gc-bubble-ai"><span class="gc-bubble-text"></span></div>`;
      chatEl.appendChild(wrap);
      const target = wrap.querySelector('.gc-bubble-text');
      if (window.MM && window.MM.streamText) {
        window.MM.streamText(target, text, { speed: streamSpeed, onDone: scrollChat });
      } else {
        target.textContent = text;
      }
      scrollChat();
      // Estimated duration to finish streaming
      return text.length * streamSpeed;
    }

    function appendUserTranscribing(text, transcribeMs) {
      const wrap = document.createElement('div');
      wrap.className = 'gc-msg gc-msg-user gc-msg-transcribing';
      wrap.innerHTML = `<div class="gc-bubble gc-bubble-user gc-stt-pill"><span class="gc-stt-dots"><span></span><span></span><span></span></span><span class="gc-stt-label">listening</span></div>`;
      chatEl.appendChild(wrap);
      scrollChat();
      // After transcribe delay, swap dots for text
      const t = setTimeout(() => {
        if (stopped) return;
        const bubble = wrap.querySelector('.gc-bubble');
        bubble.classList.remove('gc-stt-pill');
        bubble.innerHTML = '';
        wrap.classList.remove('gc-msg-transcribing');
        // Stream in the transcribed text
        if (window.MM && window.MM.streamText) {
          window.MM.streamText(bubble, text, { speed: streamSpeed, onDone: scrollChat });
        } else {
          bubble.textContent = text;
        }
        scrollChat();
      }, transcribeMs);
      timers.push(t);
    }

    function appendCard(card) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildCardHtml(card);
      const cardEl = wrap.firstElementChild;
      chatEl.appendChild(cardEl);
      // Wire card buttons (play / action)
      cardEl.querySelectorAll('[data-rc-play]').forEach(btn => {
        btn.addEventListener('click', () => {
          const txt = btn.getAttribute('data-rc-play');
          if (voice && txt) voice.speak(txt, 'en-IN');
        });
      });
      scrollChat();
    }

    function playNext() {
      if (stopped) return;
      if (i >= transcript.length) {
        if (onComplete) onComplete();
        return;
      }
      const item = transcript[i++];
      const gap = item.delayBefore || 600;

      const t = setTimeout(() => {
        if (stopped) return;
        if (item.speaker === 'ai') {
          const streamMs = appendAi(item.text);
          // Fire-and-forget the TTS — don't block on speak's promise.
          // If skipFirstSpeak was set and this is the first AI item, the
          // caller already triggered playback synchronously inside the
          // click handler — don't double-speak.
          if (voice && firstAiSpoken) {
            try { voice.speak(item.text, 'en-IN'); } catch (e) {}
          }
          firstAiSpoken = true;
          // Estimated speaking duration: ~70ms per word (≈ 130 wpm) + buffer
          const words = item.text.split(/\s+/).length;
          const speakMs = Math.max(words * 70, 1500);
          const advance = Math.max(streamMs + 400, speakMs);
          const t2 = setTimeout(() => !stopped && playNext(), advance);
          timers.push(t2);
        } else if (item.speaker === 'user') {
          // Shorter for short text, longer for long text
          const transcribeMs = item.transcribeMs || Math.min(2000, Math.max(900, item.text.length * 25));
          appendUserTranscribing(item.text, transcribeMs);
          const totalMs = transcribeMs + Math.max(item.text.length * streamSpeed, 600) + 400;
          const t2 = setTimeout(() => !stopped && playNext(), totalMs);
          timers.push(t2);
        } else if (item.speaker === 'card') {
          appendCard(item.card);
          const t3 = setTimeout(() => !stopped && playNext(), 1200);
          timers.push(t3);
        } else {
          playNext();
        }
      }, gap);
      timers.push(t);
    }

    function start() {
      if (clearOnStart) chatEl.innerHTML = '';
      i = 0;
      stopped = false;
      playNext();
    }
    function stop() {
      stopped = true;
      timers.forEach(t => clearTimeout(t));
      timers = [];
    }
    function restart() {
      stop();
      setTimeout(start, 100);
    }

    return { start, stop, restart };
  }

  /* ========== Helpers for chip-based chats (govt-exam, microlearning) ========== */

  // Append an AI message bubble (with streaming text) to a chat container.
  // speakerLabel arg is kept for backwards compatibility but ignored — AI
  // bubbles render anonymously across the entire app.
  function chatAppendAi(chatEl, text, _speakerLabel) {
    const wrap = document.createElement('div');
    wrap.className = 'gc-msg gc-msg-ai';
    wrap.innerHTML = `<div class="gc-bubble gc-bubble-ai"><span class="gc-bubble-text"></span></div>`;
    chatEl.appendChild(wrap);
    const target = wrap.querySelector('.gc-bubble-text');
    if (window.MM && window.MM.streamText) {
      window.MM.streamText(target, text, { speed: 14, onDone: () => chatEl.scrollTop = chatEl.scrollHeight });
    } else {
      target.textContent = text;
    }
    chatEl.scrollTop = chatEl.scrollHeight;
    return wrap;
  }

  // Append a user message bubble.
  function chatAppendUser(chatEl, text) {
    const wrap = document.createElement('div');
    wrap.className = 'gc-msg gc-msg-user';
    wrap.innerHTML = `<div class="gc-bubble gc-bubble-user">${text}</div>`;
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
    return wrap;
  }

  // Append a Rich UI card (uses buildCardHtml).
  function chatAppendCard(chatEl, card, voice) {
    const wrap = document.createElement('div');
    wrap.innerHTML = buildCardHtml(card);
    const cardEl = wrap.firstElementChild;
    chatEl.appendChild(cardEl);
    cardEl.querySelectorAll('[data-rc-play]').forEach(btn => {
      btn.addEventListener('click', () => {
        const txt = btn.getAttribute('data-rc-play');
        if (voice && txt) try { voice.speak(txt, 'en-IN'); } catch (e) {}
      });
    });
    chatEl.scrollTop = chatEl.scrollHeight;
    return cardEl;
  }

  // Append an inline chip row (chips appear in-chat, not in a fixed dock).
  function chatAppendChips(chatEl, chips, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'gc-chips-inline';
    chips.forEach(c => {
      const b = document.createElement('button');
      b.className = 'gc-chip';
      let inner = '';
      if (c.tag) {
        const tagCls = c.tagKind ? ' tag-' + c.tagKind : '';
        inner += `<span class="gc-chip-tag${tagCls}">${c.tag}</span>`;
      }
      inner += c.text;
      b.innerHTML = inner;
      b.onclick = () => {
        wrap.remove();
        onPick(c);
      };
      wrap.appendChild(b);
    });
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
    return wrap;
  }

  // Latency marker — show a contextual status pill, auto-removes after `ms`.
  // Returns a promise that resolves when the pill is removed.
  function chatStatus(chatEl, label, ms = 700) {
    const wrap = document.createElement('div');
    wrap.className = 'gc-status-pill';
    wrap.innerHTML = `<span class="gc-status-dots"><span></span><span></span><span></span></span><span>${label}</span>`;
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
    return new Promise((resolve) => {
      setTimeout(() => {
        wrap.classList.add('fade-out');
        setTimeout(() => {
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
          resolve();
        }, 250);
      }, ms);
    });
  }

  window.GC = {
    create, createTranscript, ICONS,
    appendAi:    chatAppendAi,
    appendUser:  chatAppendUser,
    appendCard:  chatAppendCard,
    appendChips: chatAppendChips,
    status:      chatStatus,
  };
})();
