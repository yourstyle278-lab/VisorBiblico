// AppController.js — Conecta el motor de voz, el audio ambiental y la
// escena 3D. El "reloj maestro" ya NO es un tiempo total fijo inventado
// (33.5s): ahora la narración real (evento por evento de la voz) decide
// en qué versículo/etapa está la escena. La animación de olas y cámara
// usa su propio reloj continuo, aparte, solo para que se vea viva.
//
// La barra de progreso antigua permitía saltar a "cualquier segundo" —
// eso dejó de tener sentido porque la Web Speech API no permite buscar
// (seek) dentro de una locución. Por eso el transporte ahora es por
// versículo (anterior/siguiente), no por tiempo.

import { AmbientAudioEngine } from '../audio/AudioEngine.js';
import { VoiceEngine } from '../audio/VoiceEngine.js';
import { Scene3D } from '../scene/Scene3D.js';
import {
  SCRIPTURE_PERICOPE,
  SCRIPTURE_REFERENCE,
  SCRIPTURE_ATTRIBUTION,
} from '../data/scripture.js';

export class AppController {
  constructor() {
    this.ambient = new AmbientAudioEngine();
    this.voice = new VoiceEngine({ lang: 'es-ES' });
    this.scene3D = new Scene3D(document.getElementById('three-canvas-container'));

    this.currentVerseIndex = -1;
    this.currentStage = 'storm-building';
    this.isPlaying = false;
    this.rafId = null;

    this.scriptureEl = document.getElementById('scripture-container');
    this.stageLabelEl = document.getElementById('scene-state-text');
    this.progressEl = document.getElementById('timeline-progress');
    this.playIcon = document.getElementById('play-icon');
    this.radarCanvas = document.getElementById('radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;

    // El aviso de derechos es obligatorio para poder usar RVR1960 sin
    // pedir permiso escrito (ver comentario en src/data/scripture.js) —
    // no es decorativo, se muestra siempre, no solo mientras se reproduce.
    const attributionEl = document.getElementById('scripture-attribution');
    if (attributionEl) attributionEl.textContent = SCRIPTURE_ATTRIBUTION;

    this._renderScriptureShell();
    this._wireVoiceEvents();
    this._wireControls();
  }

  _renderScriptureShell() {
    this.scriptureEl.innerHTML = '';
    const refEl = document.createElement('p');
    refEl.className = 'text-xs text-slate-500 mb-2';
    refEl.textContent = SCRIPTURE_REFERENCE;
    this.scriptureEl.appendChild(refEl);

    this.verseElements = SCRIPTURE_PERICOPE.map((v) => {
      const verseDiv = document.createElement('div');
      verseDiv.className = 'verse-block text-slate-400 mb-3 transition-opacity';
      const num = document.createElement('span');
      num.className = 'text-xs font-bold text-amber-500 font-mono mr-2 select-none';
      num.textContent = `v.${v.verse}`;
      const textSpan = document.createElement('span');
      textSpan.textContent = v.text;
      verseDiv.appendChild(num);
      verseDiv.appendChild(textSpan);
      this.scriptureEl.appendChild(verseDiv);
      return { container: verseDiv, textSpan, raw: v.text };
    });
  }

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Resalta la palabra activa usando el charIndex real que entrega el
  // evento 'boundary' del navegador (cuando está disponible).
  _highlightAtCharIndex(verseIndex, charIndex) {
    const entry = this.verseElements[verseIndex];
    if (!entry) return;
    const text = entry.raw;
    const before = text.slice(0, charIndex);
    const wordMatch = text.slice(charIndex).match(/^\S+/);
    const word = wordMatch ? wordMatch[0] : '';
    const after = text.slice(charIndex + word.length);
    entry.textSpan.innerHTML =
      this._escape(before) +
      '<span class="word-active">' + this._escape(word) + '</span>' +
      this._escape(after);
  }

  // Si el navegador no manda 'boundary' por palabra, resalta el
  // versículo completo — mejor eso que dejar el texto sin ninguna señal.
  _markVerseFullyHighlighted(verseIndex) {
    const entry = this.verseElements[verseIndex];
    if (!entry) return;
    entry.textSpan.innerHTML =
      '<span class="word-active">' + this._escape(entry.raw) + '</span>';
  }

  _wireVoiceEvents() {
    this.voice.onVerseStart = (index) => {
      this.currentVerseIndex = index;
      const stage = SCRIPTURE_PERICOPE[index].stage;
      this.currentStage = stage;
      this.ambient.setStage(stage);
      this.ambient.setDucking(true);
      this._updateStageLabel(stage);
      this._updateProgress();
      this.verseElements.forEach((e, i) => {
        e.container.style.opacity = i === index ? '1' : '0.5';
      });
    };

    this.voice.onWordBoundary = (index, charIndex) => {
      this._highlightAtCharIndex(index, charIndex);
    };

    this.voice.onBoundaryUnavailable = (index) => {
      this._markVerseFullyHighlighted(index);
    };

    this.voice.onVerseEnd = () => {
      this.ambient.setDucking(false);
    };

    this.voice.onSequenceEnd = () => {
      this.pause();
      this.currentVerseIndex = -1;
    };
  }

  _updateStageLabel(stage) {
    const labels = {
      'storm-building': 'Escena 1: Tempestad Embravecida',
      'storm-peak': 'Escena 1: Tempestad Embravecida',
      command: 'Escena 2: Teofanía y Mandato Divino',
      calm: 'Escena 3: La Gran Bonanza',
    };
    if (this.stageLabelEl) this.stageLabelEl.textContent = labels[stage] || '';
  }

  _updateProgress() {
    if (!this.progressEl) return;
    const total = SCRIPTURE_PERICOPE.length;
    const pct = total ? ((this.currentVerseIndex + 1) / total) * 100 : 0;
    this.progressEl.style.width = `${pct}%`;
  }

  _wireControls() {
    const initBtn = document.getElementById('btn-init-audio');
    if (initBtn) {
      initBtn.addEventListener('click', () => {
        this.ambient.init();
        const modal = document.getElementById('audio-bridge-modal');
        if (modal) {
          modal.classList.add('opacity-0', 'pointer-events-none');
          setTimeout(() => {
            modal.style.display = 'none';
          }, 500);
        }
        this.play();
      });
    }

    const playPauseBtn = document.getElementById('btn-play-pause');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        this.isPlaying ? this.pause() : this.play();
      });
    }

    const prevBtn = document.getElementById('btn-rewind');
    if (prevBtn) {
      prevBtn.title = 'Versículo anterior';
      prevBtn.addEventListener('click', () => this._jumpToVerse(this.currentVerseIndex - 1));
    }
    const nextBtn = document.getElementById('btn-forward');
    if (nextBtn) {
      nextBtn.title = 'Versículo siguiente';
      nextBtn.addEventListener('click', () => this._jumpToVerse(this.currentVerseIndex + 1));
    }
  }

  _jumpToVerse(index) {
    const clamped = Math.max(0, Math.min(SCRIPTURE_PERICOPE.length - 1, index));
    this.voice.speakSequence(SCRIPTURE_PERICOPE, clamped);
    this.isPlaying = true;
    this._setPlayIcon(true);
    if (!this.rafId) this._startAnimLoop();
  }

  play() {
    this.ambient.play();
    this.isPlaying = true;
    this._setPlayIcon(true);

    if (!this.voice.supported) {
      console.warn('Este navegador no soporta la Web Speech API (speechSynthesis).');
    } else if (this.voice.synth.paused) {
      this.voice.resume();
    } else if (this.currentVerseIndex < 0) {
      this.voice.speakSequence(SCRIPTURE_PERICOPE, 0);
    }

    this._startAnimLoop();
  }

  pause() {
    this.ambient.pause();
    this.voice.pause();
    this.isPlaying = false;
    this._setPlayIcon(false);
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _setPlayIcon(playing) {
    if (!this.playIcon) return;
    this.playIcon.className = playing
      ? 'fa-solid fa-pause text-xl'
      : 'fa-solid fa-play text-xl ml-0.5';
  }

  _startAnimLoop() {
    const start = performance.now();
    const loop = (now) => {
      const elapsed = (now - start) / 1000;
      this.ambient.updateWindOrbit(elapsed);
      this.scene3D.render(elapsed, this.currentStage);
      this._drawRadar(elapsed);
      if (this.isPlaying) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.rafId = null;
      }
    };
    this.rafId = requestAnimationFrame(loop);
  }

  _drawRadar(elapsed) {
    if (!this.radarCtx) return;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    this.radarCtx.clearRect(0, 0, w, h);
    this.radarCtx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
    this.radarCtx.beginPath();
    this.radarCtx.arc(cx, cy, 20, 0, Math.PI * 2);
    this.radarCtx.arc(cx, cy, 45, 0, Math.PI * 2);
    this.radarCtx.stroke();

    // Solo el viento está espacializado de verdad, por eso es el único
    // punto que se dibuja. Antes había un punto fijo etiquetado "voz de
    // Jesús" sin ningún audio real detrás — se quitó (ver DCM, hallazgo 6).
    const windX = cx + Math.sin(elapsed * 0.5) * 40;
    const windY = cy + Math.cos(elapsed * 0.5) * 40;
    this.radarCtx.fillStyle = '#38bdf8';
    this.radarCtx.beginPath();
    this.radarCtx.arc(windX, windY, 4, 0, Math.PI * 2);
    this.radarCtx.fill();
  }
}
