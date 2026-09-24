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
//
// CAMBIOS TURNO 11 (ruta: src/app/AppController.js) — a partir de tu
// prueba real del Turno 10:
// - ARREGLADO: "cuando se para y se reproduce de nuevo empieza desde el
//   principio". La causa real: _startAnimLoop() hacía
//   `const start = performance.now()` CADA VEZ que se llamaba —
//   incluida cada reanudación — así que el reloj que alimenta las olas,
//   el balanceo de la barca y ahora las transiciones de Scene3D volvía a
//   0 en cada play(). El versículo/voz SÍ retomaba bien (eso ya estaba
//   arreglado desde el Turno 8); lo que saltaba era la animación 3D.
//   Ahora el tiempo transcurrido se acumula en _elapsedAtPause y sigue
//   sumando donde se quedó, en vez de reiniciar.
// - QUITADO: el panel "Radar de sonido espacial" completo (era un
//   indicador fijo, no interactivo — pedido explícito del usuario).
//   Con esto desaparecen radarCanvas/radarCtx/_drawRadar().
// - CAMBIADO: el panel de la Biblia ya no muestra los 5 versículos en
//   una caja con scroll — ahora muestra SOLO el versículo que se está
//   narrando en este momento (pedido explícito del Turno 9), reemplazado
//   por completo cada vez que empieza un versículo nuevo.
// - NUEVO: conecta el panel de reflexión ("exégesis") con el texto de
//   cada versículo (ver src/data/scripture.js).
//
// CAMBIOS TURNO 12 (a partir de "realmente no veo mucho cambio" y el
// "efecto rebobinar" reportado):
// - DIAGNÓSTICO CON EVIDENCIA: se releyó _elapsedAtPause/_startAnimLoop
//   línea por línea — SÍ funciona como se documentó, ese reloj no
//   reinicia. El "empieza desde el principio" no es ese reloj: la causa
//   confirmada por código está en Scene3D, que suaviza CUALQUIER cambio
//   de etapa, incluido volver de "calm" a "storm-building" al reiniciar
//   la secuencia — esa interpolación de regreso se ve exactamente como
//   "rebobinar". Arreglado abajo, en onVerseStart.
// - NUEVO: _lastNarratedIndex. Cada vez que empieza un versículo, se
//   compara contra el último narrado: si es "el mismo" (se repite por
//   la pausa) o "el siguiente natural" (avance normal de la historia),
//   la transición sigue siendo suave. Cualquier otro salto (reinicio
//   tras el final, o los botones anterior/siguiente cruzando hacia
//   atrás) llama a scene3D.snapToStage(stage) para un corte instantáneo.
// - PREVENTIVO, sin confirmar todavía: se agregó una bandera
//   (_manualStop) para que un pause() (que llama a voice.stop()) no
//   pueda disparar accidentalmente onSequenceEnd si el motor de voz
//   emite su evento de "fin" al cancelar — eso SÍ explicaría un reinicio
//   real a currentVerseIndex = -1 en cada pausa, no solo el efecto
//   visual ya diagnosticado arriba. No se pudo confirmar ni descartar
//   con evidencia real porque VoiceEngine.js no se incluyó en los
//   archivos de este turno — pedido para el próximo turno.
// - Cámara y cielo (ver src/scene/Scene3D.js): sin cambios en ESTE
//   archivo, pero afectan lo que ves — Scene3D ahora ata el color del
//   cielo a la niebla y bajó un poco la mirada de la cámara, por el
//   reclamo de "todo oscuro".
//
// CAMBIOS TURNO 13 — con VoiceEngine.js y AudioEngine.js ya en mano:
// - ✅ CONFIRMADO (ya no es hipótesis): stop() sí disparaba
//   onSequenceEnd por error en cada pausa — la causa exacta, con
//   evidencia de código, quedó documentada en VoiceEngine.js (Turno 13)
//   y arreglada DE RAÍZ ahí mismo (la utterance cancelada ya no puede
//   volver a llamar a nada). La bandera _manualStop de aquí abajo
//   dejó de ser indispensable, pero se deja como red de seguridad
//   adicional — no estorba, y no depende de adivinar un tiempo de
//   espera si algún día VoiceEngine.js cambia otra vez.
// - AudioEngine.js: revisado completo, no participa en ninguno de los
//   dos bugs (ni el rebobinado visual ni el reinicio de narración) — su
//   pause()/play() manejan su propio reloj de audio correctamente y no
//   se tocó.
//
// CAMBIOS TURNO 14 (Fase 3 del DCM — libro de dos páginas):
// - NUEVO: this._bookPageLeftEl / this._bookPageRightEl (ver index.html,
//   el HTML del libro está allá) + this._lastShownVerseIndex, para saber
//   si _showVerse() está mostrando un versículo REALMENTE distinto al
//   anterior (no una repetición por pausa/resume, ver Turno 12).
// - NUEVO: _playPageTurn(), llamado al final de _showVerse() solo
//   cuando el versículo cambió de verdad — agrega/quita la clase CSS
//   "page-turning" en las dos páginas (la animación en sí vive en
//   index.html, esto solo la dispara en el momento correcto).

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
    // Tiempo acumulado del reloj de animación hasta la última pausa —
    // ver comentario de cabecera. Empieza en 0 al cargar la app.
    this._elapsedAtPause = 0;
    this._currentElapsed = 0;
    // Último índice de versículo narrado — para que onVerseStart pueda
    // distinguir avance natural de un salto que necesita corte duro en
    // Scene3D (ver cabecera, Turno 12). -1 = todavía no narró nada.
    this._lastNarratedIndex = -1;
    // Turno 14: último versículo MOSTRADO en el libro (no narrado) —
    // para disparar el efecto de pasar página solo cuando el contenido
    // realmente cambia, no cuando _showVerse se repite por el mismo
    // versículo (pausa/resume, ver Turno 12).
    this._lastShownVerseIndex = -1;

    this.scriptureEl = document.getElementById('scripture-container');
    this.stageLabelEl = document.getElementById('scene-state-text');
    this.progressEl = document.getElementById('timeline-progress');
    this.playIcon = document.getElementById('play-icon');
    this.exegesisEl = document.getElementById('exegesis-text');
    this._bookPageLeftEl = document.getElementById('book-page-left');
    this._bookPageRightEl = document.getElementById('book-page-right');

    // El aviso de derechos es obligatorio para poder usar RVR1960 sin
    // pedir permiso escrito (ver comentario en src/data/scripture.js) —
    // no es decorativo, se muestra siempre, no solo mientras se reproduce.
    const attributionEl = document.getElementById('scripture-attribution');
    if (attributionEl) attributionEl.textContent = SCRIPTURE_ATTRIBUTION;

    this._wireVoiceEvents();
    this._wireControls();
  }

  // Reemplaza TODO el contenido del panel por el versículo `index` — ya
  // no se arma una lista con los 5 versículos de una vez (ver cabecera).
  _showVerse(index) {
    const v = SCRIPTURE_PERICOPE[index];
    if (!v || !this.scriptureEl) return;

    // Turno 14: ¿es un versículo distinto al último que se MOSTRÓ, y ya
    // había uno mostrado antes? Si sí, vale la pena "pasar la página" —
    // si no (primera vez, o el mismo versículo repitiéndose por una
    // pausa), no: no hay página anterior que pasar, o no cambió nada.
    const isRealChange = this._lastShownVerseIndex !== -1 && index !== this._lastShownVerseIndex;
    this._lastShownVerseIndex = index;

    this.scriptureEl.innerHTML = '';

    const refEl = document.createElement('p');
    refEl.className = 'text-xs text-slate-500 mb-2';
    refEl.textContent = SCRIPTURE_REFERENCE;

    const verseP = document.createElement('p');
    const num = document.createElement('span');
    num.className = 'text-xs font-bold text-amber-500 font-mono mr-2 select-none align-top';
    num.textContent = `v.${v.verse}`;
    const textSpan = document.createElement('span');
    textSpan.textContent = v.text;
    verseP.appendChild(num);
    verseP.appendChild(textSpan);

    this.scriptureEl.appendChild(refEl);
    this.scriptureEl.appendChild(verseP);

    this._currentVerseSpan = textSpan;
    this._currentVerseRaw = v.text;

    if (this.exegesisEl) this.exegesisEl.textContent = v.exegesis || '';

    if (isRealChange) this._playPageTurn();
  }

  // Turno 14 (Fase 3): dispara brevemente la clase CSS "page-turning" en
  // las dos páginas del libro (ver <style> en index.html) — un giro
  // breve sobre el lomo con una sombra pasajera, no una simulación
  // física de curvar la hoja. Se quita y se vuelve a poner (con un
  // reflow forzado en medio) para poder repetirse aunque el versículo
  // cambie antes de que la animación anterior termine.
  _playPageTurn() {
    [this._bookPageLeftEl, this._bookPageRightEl].forEach((el) => {
      if (!el) return;
      el.classList.remove('page-turning');
      void el.offsetWidth; // fuerza el reflow — sin esto, quitar y poner
                           // la misma clase en el mismo tick no reinicia
                           // la animación, el navegador la ignora.
      el.classList.add('page-turning');
    });
  }

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Resalta la palabra activa usando el charIndex real que entrega el
  // evento 'boundary' del navegador (cuando está disponible). Como ahora
  // solo se muestra un versículo a la vez, basta con comparar que el
  // evento sea del versículo que está en pantalla.
  _highlightAtCharIndex(verseIndex, charIndex) {
    if (verseIndex !== this.currentVerseIndex || !this._currentVerseSpan) return;
    const text = this._currentVerseRaw;
    const before = text.slice(0, charIndex);
    const wordMatch = text.slice(charIndex).match(/^\S+/);
    const word = wordMatch ? wordMatch[0] : '';
    const after = text.slice(charIndex + word.length);
    this._currentVerseSpan.innerHTML =
      this._escape(before) +
      '<span class="word-active">' + this._escape(word) + '</span>' +
      this._escape(after);
  }

  // Dispara rayo + trueno. Antes de este arreglo, existían las funciones
  // pero nada las llamaba (se quitó el disparo por tiempo fijo al pasar
  // a un reloj basado en la voz, y nunca se puso un reemplazo).
  _strikeLightning() {
    this.scene3D.triggerLightning();
    this.ambient.triggerThunder();
  }

  // Repite el rayo/trueno cada 4-7s mientras dure la tormenta más fuerte.
  _startLightningLoop() {
    this._stopLightningLoop();
    const scheduleNext = () => {
      const delayMs = 4000 + Math.random() * 3000;
      this._lightningTimer = setTimeout(() => {
        if (this.currentStage === 'storm-peak') {
          this._strikeLightning();
          scheduleNext();
        }
      }, delayMs);
    };
    scheduleNext();
  }

  _stopLightningLoop() {
    if (this._lightningTimer) {
      clearTimeout(this._lightningTimer);
      this._lightningTimer = null;
    }
  }

  // Antes: setDucking(true) se llamaba en TODO versículo sin condición,
  // así que el ambiente bajaba casi al instante y la tormenta nunca se
  // sentía "peligrosa". Ahora solo se atenúa (y poco: ver AudioEngine.js)
  // durante la etapa "command", que es donde más importa oír con
  // claridad "Calla, enmudece".
  _applyDucking(stage) {
    this.ambient.setDucking(stage === 'command');
  }

  _wireVoiceEvents() {
    this.voice.onVerseStart = (index) => {
      const stage = SCRIPTURE_PERICOPE[index].stage;
      // ¿Es "el mismo versículo de nuevo" (se repite por la pausa) o "el
      // siguiente natural" de la historia? Si no es ninguno de los dos,
      // es un salto (reinicio tras el final, o botón anterior/siguiente
      // cruzando hacia atrás) y la escena necesita un corte, no una
      // transición — ver Turno 12 arriba y en Scene3D.js.
      const isContinuation =
        index === this._lastNarratedIndex || index === this._lastNarratedIndex + 1;
      if (!isContinuation) this.scene3D.snapToStage(stage);
      this._lastNarratedIndex = index;

      this.currentVerseIndex = index;
      const enteringStormPeak = stage === 'storm-peak' && this.currentStage !== 'storm-peak';
      this.currentStage = stage;
      this.ambient.setStage(stage);
      this._applyDucking(stage);
      this._updateStageLabel(stage);
      this._updateProgress();
      this._showVerse(index);

      if (enteringStormPeak) {
        this._strikeLightning();
        this._startLightningLoop();
      } else if (stage !== 'storm-peak') {
        this._stopLightningLoop();
      }
    };

    this.voice.onWordBoundary = (index, charIndex) => {
      this._highlightAtCharIndex(index, charIndex);
    };

    this.voice.onSequenceEnd = () => {
      if (this._manualStop) {
        // Este "fin" llegó por nuestro propio stop() dentro de pause() —
        // confirmado en el Turno 13 (ver VoiceEngine.js: cancel() dispara
        // onend/onerror de forma tardía). Ya arreglado de raíz allá; esto
        // es red de seguridad, no la defensa principal.
        this._manualStop = false;
        return;
      }
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
    } else {
      // pause()/resume() de speechSynthesis están rotos en Chrome/Android
      // (confirmado: Chromium bug #4500 — "pausing just causes the
      // utterance to end, resume is a no-op"; se reproduce igual en
      // Samsung Browser por compartir motor). Por eso, en vez de
      // resume(), se vuelve a narrar desde el INICIO del versículo donde
      // se quedó — unos segundos de un solo versículo, no de todo.
      const resumeIndex = this.currentVerseIndex >= 0 ? this.currentVerseIndex : 0;
      this.voice.speakSequence(SCRIPTURE_PERICOPE, resumeIndex);
    }

    this._startAnimLoop();
  }

  pause() {
    this.ambient.pause();
    // ✅ CONFIRMADO en el Turno 13 (ver VoiceEngine.js): stop() SÍ podía
    // disparar el "fin de secuencia" por error, porque cancel() dispara
    // onend/onerror de la utterance cancelada de forma tardía. Ya está
    // arreglado de raíz allá (la utterance cancelada ya no puede llamar
    // a nada). Esta bandera queda como red de seguridad adicional — se
    // limpia sola en 300ms si no llegó ningún evento, para no tapar un
    // fin de secuencia real más adelante.
    this._manualStop = true;
    setTimeout(() => { this._manualStop = false; }, 300);
    // stop() (cancel) en vez de pause() — mismo motivo que en play():
    // pause() no es confiable en Android. currentVerseIndex ya se guardó
    // en onVerseStart, así que play() sabe por dónde retomar.
    this.voice.stop();
    this._stopLightningLoop();
    this.isPlaying = false;
    this._setPlayIcon(false);
    // Guardar dónde se quedó el reloj de animación (ver cabecera) para
    // que la próxima _startAnimLoop() continúe, no reinicie.
    this._elapsedAtPause = this._currentElapsed;
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

  // ARREGLADO Turno 11: antes `const start = performance.now()` se
  // recalculaba en cada llamada, así que `elapsed` volvía a 0 en cada
  // play()/reanudación — eso era lo que se veía como "empieza desde el
  // principio" (las olas y el balanceo de la barca, no la voz). Ahora
  // arranca desde _elapsedAtPause y sigue sumando desde ahí.
  _startAnimLoop() {
    const loopStart = performance.now();
    const baseElapsed = this._elapsedAtPause;
    const loop = (now) => {
      const elapsed = baseElapsed + (now - loopStart) / 1000;
      this._currentElapsed = elapsed;
      this.ambient.updateWindOrbit(elapsed);
      this.scene3D.render(elapsed, this.currentStage);
      if (this.isPlaying) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.rafId = null;
      }
    };
    this.rafId = requestAnimationFrame(loop);
  }
}
