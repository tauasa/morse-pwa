/**
 * Morse Code Converter Progressive Web App
 * Main application module.
 *
 * Modules:
 *   MorseCodec   — encode / decode (no dependencies)
 *   AudioEngine  — Web Audio API: sine-wave tone generation + scheduling
 *   AudioSettings — configurable parameters with validation
 *   App          — UI wiring, dialogs, status bar, highlighting
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
//  MORSE CODEC
// ═══════════════════════════════════════════════════════════════════

const TABLE = [
  // Letters
  ['A','.-'],   ['B','-...'], ['C','-.-.'], ['D','-..'],
  ['E','.'],    ['F','..-.'], ['G','--.'],  ['H','....'],
  ['I','..'],   ['J','.---'], ['K','-.-'],  ['L','.-..'],
  ['M','--'],   ['N','-.'],   ['O','---'],  ['P','.--.'],
  ['Q','--.-'], ['R','.-.'],  ['S','...'],  ['T','-'],
  ['U','..-'],  ['V','...-'], ['W','.--'],  ['X','-..-'],
  ['Y','-.--'], ['Z','--..'],
  // Digits
  ['0','-----'], ['1','.----'], ['2','..---'], ['3','...--'],
  ['4','....-'], ['5','.....'], ['6','-....'], ['7','--...'],
  ['8','---..'  ], ['9','----.'],
  // Punctuation
  ['.','.-.-.-'], [',','--..--'], ['?','..--..'],
  ['!','-.-.--'], ['-','-....-'], ['/','-..-.' ],
  ['@','.--.-.'], ['(','-.--.' ], [')','-.--.-'],
];

const ENCODE_MAP = new Map(TABLE.map(([ch, code]) => [ch, code]));
const DECODE_MAP = new Map(TABLE.map(([ch, code]) => [code, ch]));

const MorseCodec = {
  /**
   * Encode plain text → Morse code.
   * @returns {string} Morse string
   * @throws {Error} on blank input or unsupported character
   */
  encode(text) {
    if (!text || !text.trim()) throw new Error('Input text is empty.');
    const wordsOut = [];
    for (const word of text.trim().toUpperCase().split(/\s+/)) {
      const codes = [];
      for (const ch of word) {
        const code = ENCODE_MAP.get(ch);
        if (!code) throw new Error(`Unsupported character: '${ch}'`);
        codes.push(code);
      }
      wordsOut.push(codes.join(' '));
    }
    return wordsOut.join(' / ');
  },

  /**
   * Decode Morse code → plain text.
   * @returns {string} Decoded text
   * @throws {Error} on blank input or unknown sequence
   */
  decode(morse) {
    if (!morse || !morse.trim()) throw new Error('Morse input is empty.');
    const normalised = morse.trim().replace(/\s+/g, ' ');
    const wordsOut = [];
    for (const word of normalised.split(' / ')) {
      let chars = '';
      for (const code of word.trim().split(' ').filter(Boolean)) {
        const ch = DECODE_MAP.get(code);
        if (!ch) throw new Error(`Unknown Morse sequence: '${code}'`);
        chars += ch;
      }
      wordsOut.push(chars);
    }
    return wordsOut.join(' ');
  },
};

// ═══════════════════════════════════════════════════════════════════
//  AUDIO SETTINGS
// ═══════════════════════════════════════════════════════════════════

const AudioSettings = {
  // Defaults
  sampleRate: 44100,
  frequency:  700,
  amplitude:  0.5,
  dotMs:      60,

  // Derived (standard Morse ratios)
  get dashMs()      { return this.dotMs * 3; },
  get symbolGapMs() { return this.dotMs;     },
  get letterGapMs() { return this.dotMs * 3; },
  get wordGapMs()   { return this.dotMs * 7; },

  // Bounds
  BOUNDS: {
    sampleRate: [8000,  48000],
    frequency:  [200,   2000],
    amplitude:  [0.05,  1.0],
    dotMs:      [20,    300],
  },

  clamp(key, value) {
    const [lo, hi] = this.BOUNDS[key];
    return Math.min(hi, Math.max(lo, Number(value)));
  },

  reset() {
    this.sampleRate = 44100;
    this.frequency  = 700;
    this.amplitude  = 0.5;
    this.dotMs      = 60;
  },
};

// ═══════════════════════════════════════════════════════════════════
//  AUDIO ENGINE  (Web Audio API)
// ═══════════════════════════════════════════════════════════════════

const AudioEngine = {
  _ctx: null,
  _stopFlag: false,

  /** Get or lazily create the AudioContext (requires user gesture first). */
  _getCtx() {
    if (!this._ctx || this._ctx.state === 'closed') {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: AudioSettings.sampleRate,
      });
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  },

  /** Stop any currently playing audio. */
  stop() {
    this._stopFlag = true;
  },

  /**
   * Play a Morse string asynchronously via the Web Audio API.
   *
   * @param {string}   morse         — the Morse string to play
   * @param {Function} onCharIndex   — called with char index just before each tone; -1 when done
   * @param {Function} onDone        — called when playback finishes or is stopped
   */
  async play(morse, onCharIndex, onDone) {
    this._stopFlag = false;
    const ctx = this._getCtx();

    const settings = {
      frequency:    AudioSettings.frequency,
      amplitude:    AudioSettings.amplitude,
      dotMs:        AudioSettings.dotMs,
      dashMs:       AudioSettings.dashMs,
      symbolGapMs:  AudioSettings.symbolGapMs,
      letterGapMs:  AudioSettings.letterGapMs,
      wordGapMs:    AudioSettings.wordGapMs,
      rampMs:       10,
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const playTone = async (durationMs) => {
      const duration = durationMs / 1000;
      const ramp = settings.rampMs / 1000;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.value = settings.frequency;

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(settings.amplitude, now + ramp);
      gain.gain.setValueAtTime(settings.amplitude, now + duration - ramp);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.start(now);
      osc.stop(now + duration);

      await sleep(durationMs);
    };

    let i = 0;
    while (i < morse.length) {
      if (this._stopFlag) break;

      const ch = morse[i];
      if (ch === '.') {
        onCharIndex?.(i);
        await playTone(settings.dotMs);
      } else if (ch === '-') {
        onCharIndex?.(i);
        await playTone(settings.dashMs);
      } else if (ch === '/') {
        // word gap = wordGapMs - letterGapMs (spaces around '/' add letter gaps)
        await sleep(settings.wordGapMs - settings.letterGapMs);
      } else {
        // space = letter gap
        await sleep(settings.letterGapMs);
      }
      i++;
    }

    onCharIndex?.(-1);
    onDone?.();
  },
};

// ═══════════════════════════════════════════════════════════════════
//  NOISE CANVAS  (atmospheric film grain)
// ═══════════════════════════════════════════════════════════════════

function initNoise() {
  const canvas = document.getElementById('noise-canvas');
  const ctx = canvas.getContext('2d');
  let frame = 0;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    const w = canvas.width, h = canvas.height;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255 | 0;
      data[i] = data[i+1] = data[i+2] = v;
      data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    frame++;
    // Redraw every ~4 frames (≈15fps grain) to save CPU
    setTimeout(() => requestAnimationFrame(draw), 66);
  }
  requestAnimationFrame(draw);
}

// ═══════════════════════════════════════════════════════════════════
//  APP — UI WIRING
// ═══════════════════════════════════════════════════════════════════

const App = {
  // DOM refs
  textArea:     null,
  morseArea:    null,
  overlay:      null,
  statusBar:    null,
  encodeBtn:    null,
  decodeBtn:    null,
  isPlaying:    false,

  init() {
    this.textArea  = document.getElementById('text-area');
    this.morseArea = document.getElementById('morse-area');
    this.overlay   = document.getElementById('morse-highlight-overlay');
    this.statusBar = document.getElementById('status-bar');
    this.encodeBtn = document.getElementById('encode-btn');
    this.decodeBtn = document.getElementById('decode-btn');

    this._bindConverter();
    this._bindDialogs();
    this._bindSettings();
    this._bindInstall();
    initNoise();
    this._registerSW();
  },

  // ── Converter ──────────────────────────────────────────────────

  _bindConverter() {
    this.encodeBtn.addEventListener('click', () => this._doEncode());
    this.decodeBtn.addEventListener('click', () => this._doDecode());
    document.getElementById('clear-text-btn').addEventListener('click', () => {
      this.textArea.value = '';
      this._setStatus('Text cleared.', 'success');
    });
    document.getElementById('clear-morse-btn').addEventListener('click', () => {
      this.morseArea.value = '';
      this.overlay.innerHTML = '';
      this._setStatus('Morse cleared.', 'success');
    });

    // Allow Tab key to insert spaces in textareas
    [this.textArea, this.morseArea].forEach(ta => {
      ta.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = ta.selectionStart;
          ta.value = ta.value.slice(0, start) + '  ' + ta.value.slice(ta.selectionEnd);
          ta.selectionStart = ta.selectionEnd = start + 2;
        }
      });
    });
  },

  _doEncode() {
    const input = this.textArea.value;
    try {
      const morse = MorseCodec.encode(input);
      this.morseArea.value = morse;
      this.overlay.innerHTML = '';
      this._setStatus('Encoded successfully.', 'success');
      if (document.getElementById('text-play-check').checked) {
        this._play(morse);
      }
    } catch (e) {
      this._setStatus('⚠  ' + e.message, 'error');
    }
  },

  _doDecode() {
    const input = this.morseArea.value;
    try {
      const text = MorseCodec.decode(input);
      this.textArea.value = text;
      this._setStatus('Decoded successfully.', 'success');
      if (document.getElementById('morse-play-check').checked) {
        this._play(input);
      }
    } catch (e) {
      this._setStatus('⚠  ' + e.message, 'error');
    }
  },

  // ── Audio + Highlighting ──────────────────────────────────────

  _play(morse) {
    if (this.isPlaying) {
      AudioEngine.stop();
      return;
    }
    this.isPlaying = true;
    this._setButtonsEnabled(false);
    this._setStatus('♪  Playing…', 'playing');

    // Pre-render the overlay with the full morse string
    this._renderOverlay(morse, -1);

    AudioEngine.play(
      morse,
      (idx) => this._renderOverlay(morse, idx),
      ()    => {
        this.isPlaying = false;
        this._setButtonsEnabled(true);
        this._setStatus('♪  Done.', 'success');
        this.overlay.innerHTML = '';
      }
    );
  },

  /**
   * Render the Morse overlay: characters before idx are dimmed,
   * character at idx is bright green, rest are invisible.
   */
  _renderOverlay(morse, activeIdx) {
    if (activeIdx < 0) { this.overlay.innerHTML = ''; return; }

    let html = '';
    for (let i = 0; i < morse.length; i++) {
      const ch = morse[i] === ' ' ? '\u00A0' : morse[i]; // nbsp for spaces
      if (i < activeIdx) {
        html += `<span class="played-char">${ch}</span>`;
      } else if (i === activeIdx) {
        html += `<span class="current-char">${ch}</span>`;
      } else {
        // Invisible spacer — keeps layout identical to textarea
        html += `<span style="color:transparent">${ch}</span>`;
      }
    }
    this.overlay.innerHTML = html;

    // Pulse the encode/decode button like a morse key
    const btn = this.encodeBtn.disabled ? this.decodeBtn : this.encodeBtn;
    btn.classList.remove('playing');
    void btn.offsetWidth; // reflow to restart animation
    btn.classList.add('playing');
    setTimeout(() => btn.classList.remove('playing'), 200);
  },

  _setButtonsEnabled(enabled) {
    this.encodeBtn.disabled = !enabled;
    this.decodeBtn.disabled = !enabled;
  },

  // ── Status bar ────────────────────────────────────────────────

  _setStatus(msg, type = '') {
    this.statusBar.textContent = msg;
    this.statusBar.className = 'status-bar' + (type ? ' ' + type : '');
  },

  // ── Settings dialog ───────────────────────────────────────────

  _SETTINGS_KEYS: ['sample-rate', 'frequency', 'amplitude', 'dot-ms'],
  _settingsBackup: {},

  _bindDialogs() {
    // Settings
    document.getElementById('settings-btn').addEventListener('click', () => this._openSettings());
    document.getElementById('settings-close').addEventListener('click', () => this._closeSettings(false));
    document.getElementById('settings-cancel').addEventListener('click', () => this._closeSettings(false));
    document.getElementById('settings-apply').addEventListener('click', () => this._closeSettings(true));
    document.getElementById('settings-reset').addEventListener('click', () => this._resetSettings());
    document.getElementById('settings-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) this._closeSettings(false);
    });

    // About
    document.getElementById('about-btn').addEventListener('click', () => this._openAbout());
    document.getElementById('about-close').addEventListener('click', () => this._closeAbout());
    document.getElementById('about-ok').addEventListener('click', () => this._closeAbout());
    document.getElementById('about-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) this._closeAbout();
    });

    // Keyboard ESC
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!document.getElementById('settings-backdrop').hidden) this._closeSettings(false);
      if (!document.getElementById('about-backdrop').hidden) this._closeAbout();
    });
  },

  _openSettings() {
    // Snapshot current values in case user cancels
    this._settingsBackup = {
      sampleRate: AudioSettings.sampleRate,
      frequency:  AudioSettings.frequency,
      amplitude:  AudioSettings.amplitude,
      dotMs:      AudioSettings.dotMs,
    };
    // Reflect live values into controls
    this._syncSettingsToUI(AudioSettings);
    document.getElementById('settings-backdrop').hidden = false;
    document.getElementById('settings-dialog').focus?.();
  },

  _closeSettings(apply) {
    if (apply) {
      // Read values from UI into AudioSettings
      AudioSettings.sampleRate = AudioSettings.clamp('sampleRate', document.getElementById('sample-rate-input').value);
      AudioSettings.frequency  = AudioSettings.clamp('frequency',  document.getElementById('frequency-input').value);
      AudioSettings.amplitude  = AudioSettings.clamp('amplitude',  document.getElementById('amplitude-input').value);
      AudioSettings.dotMs      = AudioSettings.clamp('dotMs',      document.getElementById('dot-ms-input').value);
      this._setStatus('Settings applied.', 'success');
    }
    document.getElementById('settings-backdrop').hidden = true;
  },

  _resetSettings() {
    AudioSettings.reset();
    this._syncSettingsToUI(AudioSettings);
  },

  _syncSettingsToUI(s) {
    document.getElementById('sample-rate-slider').value = s.sampleRate;
    document.getElementById('sample-rate-input').value  = s.sampleRate;
    document.getElementById('frequency-slider').value   = s.frequency;
    document.getElementById('frequency-input').value    = s.frequency;
    document.getElementById('amplitude-slider').value   = s.amplitude;
    document.getElementById('amplitude-input').value    = s.amplitude;
    document.getElementById('dot-ms-slider').value      = s.dotMs;
    document.getElementById('dot-ms-input').value       = s.dotMs;
  },

  _bindSettings() {
    const pairs = [
      ['sample-rate-slider', 'sample-rate-input'],
      ['frequency-slider',   'frequency-input'],
      ['amplitude-slider',   'amplitude-input'],
      ['dot-ms-slider',      'dot-ms-input'],
    ];

    pairs.forEach(([sliderId, numberId]) => {
      const slider = document.getElementById(sliderId);
      const number = document.getElementById(numberId);

      slider.addEventListener('input', () => {
        number.value = slider.value;
      });

      number.addEventListener('input', () => {
        const clamped = Math.min(Number(slider.max),
                        Math.max(Number(slider.min), Number(number.value)));
        slider.value = clamped;
      });
    });
  },

  // ── About dialog ─────────────────────────────────────────────

  _openAbout() {
    document.getElementById('about-backdrop').hidden = false;
  },

  _closeAbout() {
    document.getElementById('about-backdrop').hidden = true;
  },

  // ── PWA install ───────────────────────────────────────────────

  _deferredPrompt: null,

  _bindInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this._deferredPrompt = e;
      this._showInstallBanner();
    });
  },

  _showInstallBanner() {
    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.innerHTML = `
      <span>Install Morse as an app</span>
      <button class="btn btn--primary" id="install-yes" style="padding:5px 12px;font-size:12px">Install</button>
      <button class="btn btn--ghost" id="install-no" style="padding:5px 8px;font-size:12px">✕</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('install-yes').addEventListener('click', async () => {
      this._deferredPrompt?.prompt();
      const { outcome } = await this._deferredPrompt?.userChoice;
      banner.remove();
      this._deferredPrompt = null;
    });

    document.getElementById('install-no').addEventListener('click', () => {
      banner.remove();
    });
  },

  // ── Service Worker ────────────────────────────────────────────

  _registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // SW registration failure is non-fatal — app still works online
      });
    }
  },
};

// ── Boot ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => App.init());