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
//
// CAMBIOS TURNO 17 (reestructuración: libro literal con el Visor
// incrustado, aprobada en el Turno 16 — "manos a la obra"):
// - NUEVO: this._startBtn (id btn-start-immersion, en la página
//   izquierda del libro) + _startImmersion() + _disintegrate(): al
//   tocar el botón, cada letra del texto en pantalla se envuelve en su
//   propio <span> y se anima (desplazamiento/giro/desvanecido al azar,
//   con retraso escalonado) — la versión casera del efecto "portal"
//   investigado en el Turno 16, sin ninguna librería nueva. 650ms
//   después arranca el play() de siempre.
// - CAMBIO DE COMPORTAMIENTO: el botón "Iniciar" del modal de audio ya
//   NO llama a play() — solo habilita el audio y cierra el modal. Antes
//   la narración arrancaba sola al cerrarlo; ahora el que la inicia es
//   el botón del libro, para que el efecto de desintegración sea el
//   único camino de entrada "de cine" (los controles compactos de la
//   página derecha siguen pudiendo iniciar/pausar sin el adorno).
// - NUEVO: el constructor ahora llama a _showVerse(0) y a
//   scene3D.render(0, ...) una vez — antes la página izquierda quedaba
//   vacía y el canvas sin dibujar hasta que play() arrancaba, y con el
//   libro nuevo no habría nada que leer ni que tocar al cargar.
// - onSequenceEnd vuelve a mostrar el botón de inmersión al terminar la
//   perícopa de verdad, para poder repetirla.
// - _showVerse: el color de la línea de referencia pasó de slate-500 a
//   stone-500 (la página ahora es pergamino claro, no oscura).
//
// CAMBIOS TURNO 18 (el Visor pasa a ser una LÁMINA ILUSTRADA del libro):
// - Dos modos, en data-mode del #book-wrap: "reading" (al cargar: solo el
//   pasaje repartido en las dos páginas, como un libro normal; el Visor
//   NO se ve) e "immersion" (la lámina ilustrada en la página derecha, el
//   texto completo en la izquierda con el versículo y la palabra
//   narrados resaltados, y la reflexión de cada versículo).
// - Tocar el pasaje (o el botón de invitación) dispara _startImmersion():
//   las letras de AMBAS páginas se desmaterializan (_disintegrate), y a
//   los ~750 ms el texto se re-materializa en la izquierda mientras la
//   lámina se revela en la derecha con un anillo dorado (scene.reveal) y
//   arranca la narración. "Volver a leer" (btn-close-visor) hace el camino
//   de vuelta.
// - La escena ahora es IllustratedScene (WebGL directo, sin Three.js):
//   misma interfaz que Scene3D (render / snapToStage / triggerLightning)
//   más reveal() / resetReveal(). Scene3D.js queda en el repo como
//   respaldo histórico, pero ya NADA lo importa. La propiedad se sigue
//   llamando scene3D para no renombrar por renombrar.
// - Se quitó el efecto de "pasar la página" por versículo
//   (_playPageTurn): el texto ya no se intercambia al avanzar, solo se
//   mueve el resaltado. Volverá cuando haya navegación entre páginas.
// - CODE REVIEW INTERNO (paso nuevo de la metodología), hallazgos
//   corregidos aquí: (1) play() ahora ignora una segunda llamada mientras
//   ya está reproduciendo (dos toques seguidos arrancaban dos
//   speakSequence y dos bucles de animación); (2) _jumpToVerse con la
//   pausa activa no reanudaba el ambiente (la voz hablaba sobre un
//   ambiente suspendido); (3) _disintegrate programaba una animación por
//   letra: ahora todas comparten un solo requestAnimationFrame, y respeta
//   prefers-reduced-motion; (4) el temporizador de arranque de la
//   inmersión se cancela si se pausa o se sale antes de que dispare.
// - Opción "horizontal" (btn-landscape): pantalla completa + bloqueo de
//   orientación donde el navegador lo permita; si no, avisa que gires el
//   teléfono. Con el teléfono girado, el CSS pone las dos páginas lado a
//   lado.


import { AmbientAudioEngine } from '../audio/AudioEngine.js';
import { VoiceEngine } from '../audio/VoiceEngine.js';
import { IllustratedScene } from '../scene/IllustratedScene.js';
import { ILLUSTRATIONS } from '../data/illustrations.js';
import { SCRIPTURE_PERICOPE, SCRIPTURE_ATTRIBUTION } from '../data/scripture.js';

// Identificador del pasaje piloto — clave en ILLUSTRATIONS. Cuando haya
// más pasajes, saldrá del libro/capítulo que esté abierto.
const PASSAGE_ID = 'mk-4-35-41';
const PLAY_PATH = 'M8 5v14l11-7z';
const PAUSE_PATH = 'M6 5h4v14H6zM14 5h4v14h-4z';


export class AppController {
  constructor() {
    this.ambient = new AmbientAudioEngine();
    this.voice = new VoiceEngine({ lang: 'es-ES' });
    // Sigue llamándose scene3D por no renombrar; desde el Turno 18 es la
    // lámina ilustrada (IllustratedScene), con la misma interfaz.
    this.scene3D = new IllustratedScene(
      document.getElementById('three-canvas-container'),
      ILLUSTRATIONS[PASSAGE_ID]
    );

    this.mode = 'reading';
    this._transitioning = false;
    this._verseEls = [];
    this._introTimer = null;
    this._toastTimer = null;

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
    // la escena (ver cabecera, Turno 12). -1 = todavía no narró nada.
    this._lastNarratedIndex = -1;

    this.bookEl = document.getElementById('book-wrap');
    this.leftBodyEl = document.getElementById('page-left-body');
    this.rightBodyEl = document.getElementById('page-right-body');
    this.exegesisEl = document.getElementById('exegesis-text');
    this.stageLabelEl = document.getElementById('scene-state-text');
    this.progressEl = document.getElementById('timeline-progress');
    this.playIconPath = document.getElementById('play-icon-path');
    this.toastEl = document.getElementById('book-toast');
    this._startBtn = document.getElementById('btn-start-immersion');
    // Modo cine (Turno 19): la lámina grande con subtítulo, solo visible en horizontal.
    this.cineBtn = document.getElementById('btn-cine');
    this.cineCaptionEl = document.getElementById('cine-caption');
    this._cineTextSpan = null;
    this._cine = true; // por defecto la lámina se ve grande mientras se narra

    // El aviso de derechos es obligatorio para poder usar RVR1960 sin
    // pedir permiso escrito (ver comentario en src/data/scripture.js) —
    // no es decorativo, se muestra siempre, no solo mientras se reproduce.
    const attributionEl = document.getElementById('scripture-attribution');
    if (attributionEl) attributionEl.textContent = SCRIPTURE_ATTRIBUTION;

    this._wireVoiceEvents();
    this._wireControls();
    this._enterReadingLayout();
  }

  // ---------- Modo lectura: el pasaje en las dos páginas ----------
  // Crea un <p> por versículo (número + texto). Se reconstruyen desde los
  // datos cada vez que se cambia de modo — _disintegrate destruye el
  // interior de los párrafos, así que no se reutilizan.
  _buildVerses() {
    this._verseEls = SCRIPTURE_PERICOPE.map((v) => {
      const p = document.createElement('p');
      p.className = 'verse';
      const num = document.createElement('span');
      num.className = 'verse-num';
      num.textContent = String(v.verse);
      const text = document.createElement('span');
      text.className = 'verse-text';
      text.textContent = v.text;
      p.appendChild(num);
      p.appendChild(document.createTextNode(' '));
      p.appendChild(text);
      return { p, text };
    });
    this._currentVerseSpan = null;
    this._currentVerseRaw = '';
  }

  // reading: los primeros versículos en la página izquierda (que además lleva
  // el título) y el resto en la derecha, como un libro que continúa de una
  // página a la otra. immersion: todo el pasaje en la izquierda; la derecha
  // es la lámina.
  _layoutVerses(mode) {
    this.leftBodyEl.replaceChildren();
    this.rightBodyEl.replaceChildren();
    const n = this._verseEls.length;
    const k = mode === 'reading' ? Math.max(1, Math.floor(n / 2)) : n;
    this._verseEls.forEach((e, i) => (i < k ? this.leftBodyEl : this.rightBodyEl).appendChild(e.p));
  }

  _enterReadingLayout() {
    this.mode = 'reading';
    this.bookEl.dataset.mode = 'reading';
    this._clearCineCaption();
    this._buildVerses();
    this._layoutVerses('reading');
    [this.leftBodyEl, this.rightBodyEl].forEach((el) => el.classList.add('tappable'));
  }

  // ---------- Transición lectura -> inmersión ("portal") ----------
  // El gesto del usuario (tocar el pasaje) primero desmaterializa las
  // letras, y solo después cambia el libro de modo y arranca la narración
  // — el play() de siempre, sin lógica nueva de reproducción aquí.
  _startImmersion() {
    if (this.mode !== 'reading' || this._transitioning) return;
    this._transitioning = true;
    this._disintegrate(this.leftBodyEl);
    this._disintegrate(this.rightBodyEl);
    setTimeout(() => this._enterImmersionLayout(), 750);
  }

  _enterImmersionLayout() {
    this.mode = 'immersion';
    this.bookEl.dataset.mode = 'immersion';
    this._applyCine();
    [this.leftBodyEl, this.rightBodyEl].forEach((el) => el.classList.remove('tappable'));
    this._buildVerses();
    this._layoutVerses('immersion');
    this._restartAnimation(this.leftBodyEl, 'materialize');
    // En vertical la lámina queda arriba: llevar el libro a la vista (el
    // toque pudo ser en la página de abajo y el diseño acaba de cambiar).
    this.bookEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    this.currentStage = 'storm-building';
    this.currentVerseIndex = -1;
    this._lastNarratedIndex = -1;
    this.scene3D.snapToStage(this.currentStage);
    this.scene3D.resetReveal();
    this.scene3D.reveal(1700);
    this._updateStageLabel(this.currentStage);
    this._updateProgress();
    if (this.exegesisEl) this.exegesisEl.textContent = SCRIPTURE_PERICOPE[0].exegesis || '';
    this._transitioning = false;

    clearTimeout(this._introTimer);
    this._introTimer = setTimeout(() => {
      this._introTimer = null;
      if (this.mode === 'immersion') this.play();
    }, 600);
  }

  // Camino de vuelta: "Volver a leer el texto".
  _exitImmersion() {
    if (this.mode !== 'immersion') return;
    clearTimeout(this._introTimer);
    this._introTimer = null;
    this.pause();
    this.currentVerseIndex = -1;
    this._lastNarratedIndex = -1;
    this.scene3D.resetReveal();
    this._enterReadingLayout();
    this._restartAnimation(this.leftBodyEl, 'materialize');
    this._restartAnimation(this.rightBodyEl, 'materialize');
    this.bookEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Modo cine (Turno 19) ----------
  // data-cine="on"|"off" en el libro; el CSS (index.html) hace el resto y solo
  // en horizontal. El botón de las flechas alterna entre la lámina grande con
  // subtítulo y el libro de dos páginas con el texto completo.
  _applyCine() {
    this.bookEl.dataset.cine = this._cine ? 'on' : 'off';
    if (this.cineBtn) {
      const label = this._cine ? 'Ver el libro con el texto' : 'Ver la lámina en pantalla grande';
      this.cineBtn.setAttribute('aria-pressed', String(this._cine));
      this.cineBtn.setAttribute('aria-label', label);
      this.cineBtn.title = label;
    }
  }

  _setCineCaption(v) {
    if (!this.cineCaptionEl) return;
    const num = document.createElement('span');
    num.className = 'verse-num';
    num.textContent = String(v.verse);
    const txt = document.createElement('span');
    txt.textContent = v.text;
    this.cineCaptionEl.replaceChildren(num, document.createTextNode(' '), txt);
    this._cineTextSpan = txt;
  }

  _clearCineCaption() {
    this._cineTextSpan = null;
    if (this.cineCaptionEl) this.cineCaptionEl.replaceChildren();
  }

  // Reinicia una animación CSS aunque la clase ya estuviera puesta.
  _restartAnimation(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // fuerza el reflow: sin esto el navegador ignora el quitar+poner
    el.classList.add(cls);
  }

  // Muestra el versículo `index` como el actual: lo marca, deja el resto
  // como texto plano y pone su reflexión. Solo en modo inmersión.
  _showVerse(index) {
    if (this.mode !== 'immersion') return;
    const v = SCRIPTURE_PERICOPE[index];
    const entry = this._verseEls[index];
    if (!v || !entry) return;
    if (this._currentVerseSpan) this._currentVerseSpan.textContent = this._currentVerseRaw;
    this._verseEls.forEach((e, i) => e.p.classList.toggle('is-current', i === index));
    this._currentVerseSpan = entry.text;
    this._currentVerseRaw = v.text;
    this._currentVerseSpan.textContent = v.text;
    if (this.exegesisEl) this.exegesisEl.textContent = v.exegesis || '';
    this._setCineCaption(v);
    // Con las páginas lado a lado cada una se desplaza por dentro: llevar el
    // versículo actual a la vista. En vertical NO: la lámina está arriba y
    // desplazar la pantalla la sacaría de la vista mientras se narra.
    if (window.matchMedia && window.matchMedia('(orientation: landscape) and (min-width: 640px)').matches) {
      entry.p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Envuelve cada carácter visible de `container` en su propio <span
  // class="dissolve-letter"> (la transición vive en el CSS, ver
  // index.html) y lo anima con un desplazamiento/giro al azar y un
  // pequeño retraso escalonado por letra — la versión casera del efecto
  // de "texto que se desintegra" investigada en el Turno 16. Se
  // prefirió esto sobre una librería como Disintegrate.js porque no
  // agrega ninguna dependencia nueva ni una conversión DOM→canvas de
  // por medio, que es justo el tipo de cosa que ya nos ha dado
  // sorpresas en Android/Samsung Browser (Turnos 7, 12, 13).
  _disintegrate(container) {
    if (!container) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    const items = [];
    textNodes.forEach((textNode) => {
      const frag = document.createDocumentFragment();
      [...textNode.textContent].forEach((ch) => {
        if (ch.trim() === '') {
          frag.appendChild(document.createTextNode(ch));
          return;
        }
        const span = document.createElement('span');
        span.className = 'dissolve-letter';
        span.textContent = ch;
        span.style.transitionDelay = `${Math.random() * 200}ms`;
        items.push({
          span,
          dx: (Math.random() - 0.5) * 50,
          dy: -15 - Math.random() * 45,
          rot: (Math.random() - 0.5) * 70,
        });
        frag.appendChild(span);
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });
    // Un solo requestAnimationFrame para todas las letras: si el
    // transform se pusiera en el mismo cuadro en que el span entra al
    // DOM, el navegador no tendría un estado "antes" del que animar y
    // saltaría directo al final.
    requestAnimationFrame(() => {
      items.forEach(({ span, dx, dy, rot }) => {
        if (!reduce) span.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
        span.style.opacity = '0';
      });
    });
  }

  _toast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 3200);
  }

  // "Ver el libro abierto en horizontal": pantalla completa + bloqueo de
  // orientación donde el navegador lo permita (Chrome/Samsung Internet en
  // Android sí, con un gesto del usuario; iPhone no). Si algo falla, el
  // aviso de girar el teléfono sigue siendo válido: el CSS reacciona a la
  // orientación, no a este botón.
  async _toggleLandscape() {
    try {
      if (document.fullscreenElement) {
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        await document.exitFullscreen();
        return;
      }
      if (!document.documentElement.requestFullscreen) throw new Error('sin pantalla completa');
      await document.documentElement.requestFullscreen();
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (err) {
      this._toast('Gira tu teléfono para ver el libro abierto.');
    }
  }

  // Resalta la palabra activa usando el charIndex real que entrega el
  // evento 'boundary' del navegador (o el estimado de VoiceEngine).
  // Solo se resalta dentro del versículo actual: basta con comparar que
  // el evento sea de ese versículo.
  _highlightAtCharIndex(verseIndex, charIndex) {
    if (verseIndex !== this.currentVerseIndex || !this._currentVerseSpan) return;
    const text = this._currentVerseRaw;
    const before = text.slice(0, charIndex);
    const wordMatch = text.slice(charIndex).match(/^\S+/);
    const word = wordMatch ? wordMatch[0] : '';
    const after = text.slice(charIndex + word.length);
    // guardian-ok(inner-html): before/word/after pasan por _escape() (textContent a innerHTML) antes de insertarse
    this._currentVerseSpan.innerHTML =
      this._escape(before) +
      '<span class="word-active">' + this._escape(word) + '</span>' +
      this._escape(after);
    if (this._cineTextSpan) {
      const hl = document.createElement('span');
      hl.className = 'word-active';
      hl.textContent = word;
      this._cineTextSpan.replaceChildren(
        document.createTextNode(before), hl, document.createTextNode(after)
      );
    }
  }


  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
      // transición — ver Turno 12 arriba y en IllustratedScene.js.
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
        // Este botón solo habilita el audio (gesto del usuario, exigido por
        // el navegador) y cierra el modal; la narración empieza cuando se
        // toca el pasaje (Turno 17).
        this.ambient.init();
        const modal = document.getElementById('audio-bridge-modal');
        if (modal) {
          modal.classList.add('opacity-0', 'pointer-events-none');
          setTimeout(() => {
            modal.style.display = 'none';
          }, 500);
        }
      });
    }

    // Tocar el pasaje (cualquiera de las dos páginas) o el botón de
    // invitación inicia la inmersión — solo en modo lectura.
    const startIfReading = () => this._startImmersion();
    if (this._startBtn) this._startBtn.addEventListener('click', startIfReading);
    [this.leftBodyEl, this.rightBodyEl].forEach((el) => el.addEventListener('click', startIfReading));

    const closeBtn = document.getElementById('btn-close-visor');
    if (closeBtn) closeBtn.addEventListener('click', () => this._exitImmersion());

    if (this.cineBtn) {
      this.cineBtn.addEventListener('click', () => {
        this._cine = !this._cine;
        this._applyCine();
      });
    }

    const landscapeBtn = document.getElementById('btn-landscape');
    if (landscapeBtn) landscapeBtn.addEventListener('click', () => this._toggleLandscape());

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
    if (this.mode !== 'immersion') return;
    const clamped = Math.max(0, Math.min(SCRIPTURE_PERICOPE.length - 1, index));
    // Si estaba en pausa, el ambiente (que pause() suspendió) también debe
    // reanudarse — antes la voz hablaba sobre un ambiente en silencio.
    if (!this.isPlaying) this.ambient.play();
    this.voice.speakSequence(SCRIPTURE_PERICOPE, clamped);
    this.isPlaying = true;
    this._setPlayIcon(true);
    if (!this.rafId) this._startAnimLoop();
  }

  play() {
    if (this.isPlaying) return; // evita doble speakSequence / doble bucle
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
    clearTimeout(this._introTimer); // si se pausa antes de que arranque la inmersión, no arrancar
    this._introTimer = null;
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
    if (!this.playIconPath) return;
    this.playIconPath.setAttribute('d', playing ? PAUSE_PATH : PLAY_PATH);
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
