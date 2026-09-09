// VoiceEngine.js — Narra el pasaje con la voz nativa del navegador
// (Web Speech API). Es la opción C del DCM: voz simple, sin espacializar
// en 3D. No existe una forma estándar de conectar speechSynthesis a un
// grafo de Web Audio, así que la espacialización se queda solo para el
// ambiente (ver AudioEngine.js).
//
// CAMBIO TURNO 7 (ruta: src/audio/VoiceEngine.js):
// - Se confirmó (probado por el usuario en Android 13 + Samsung
//   Browser) que el evento 'boundary' por palabra no llega en ese
//   entorno — coincide con reportes conocidos ("boundary" no dispara en
//   Android, ver codersblock.com/blog/javascript-text-to-speech...).
//   Antes, si no llegaba, se resaltaba el VERSÍCULO ENTERO como bloque.
//   Ahora, en su lugar, se estima el tiempo de cada palabra (según su
//   longitud en letras y la velocidad de la voz) y se dispara
//   onWordBoundary igual que si fuera un evento real — AppController no
//   necesita saber si el resaltado es real o estimado, lo recibe igual.
// - pause()/resume() se dejan aquí por si alguna vez se detecta un
//   navegador donde sí funcionen, pero AppController.js YA NO los llama
//   (rotos en Chrome/Android — ver comentario en AppController.js).

export class VoiceEngine {
  constructor({ lang = 'es-ES', rate = 0.95 } = {}) {
    this.synth = window.speechSynthesis || null;
    this.lang = lang;
    this.rate = rate;
    this.supported = !!this.synth;

    this.onVerseStart = null; // (verseIndex) => void
    this.onWordBoundary = null; // (verseIndex, charIndex) => void — real o estimado
    this.onVerseEnd = null; // (verseIndex) => void
    this.onSequenceEnd = null; // () => void

    this._queue = [];
    this._currentIndex = -1;
    this._fallbackTimer = null;
    this._estimatedTimers = [];
  }

  // Nota: en varios navegadores getVoices() devuelve una lista vacía
  // hasta que el evento 'voiceschanged' se dispara una vez. Como esto se
  // llama recién al presionar reproducir (después de que la página ya
  // lleva un rato cargada), normalmente ya está poblada.
  pickVoice() {
    if (!this.supported) return null;
    const voices = this.synth.getVoices();
    return (
      voices.find((v) => v.lang === this.lang) ||
      voices.find((v) => v.lang && v.lang.startsWith('es')) ||
      null
    );
  }

  // "verses" siempre es el arreglo COMPLETO de la perícopa; "startIndex"
  // es desde qué versículo empezar (no un .slice() — ver historial).
  speakSequence(verses, startIndex = 0) {
    if (!this.supported) return false;
    this.stop();
    this._queue = verses;
    this._currentIndex = startIndex - 1;
    this._speakNext();
    return true;
  }

  _speakNext() {
    this._currentIndex += 1;
    if (this._currentIndex >= this._queue.length) {
      if (this.onSequenceEnd) this.onSequenceEnd();
      return;
    }
    const index = this._currentIndex;
    const verseText = this._queue[index].text;
    const utterance = new SpeechSynthesisUtterance(verseText);
    utterance.lang = this.lang;
    utterance.rate = this.rate;
    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;

    let gotRealBoundary = false;
    this._clearEstimatedTimers();
    clearTimeout(this._fallbackTimer);
    this._fallbackTimer = setTimeout(() => {
      if (!gotRealBoundary) this._runEstimatedHighlighting(index, verseText);
    }, 700);

    utterance.onstart = () => {
      if (this.onVerseStart) this.onVerseStart(index);
    };
    utterance.onboundary = (event) => {
      gotRealBoundary = true;
      this._clearEstimatedTimers();
      if (this.onWordBoundary) this.onWordBoundary(index, event.charIndex);
    };
    utterance.onend = () => {
      clearTimeout(this._fallbackTimer);
      this._clearEstimatedTimers();
      if (this.onVerseEnd) this.onVerseEnd(index);
      this._speakNext();
    };
    utterance.onerror = () => {
      clearTimeout(this._fallbackTimer);
      this._clearEstimatedTimers();
      this._speakNext();
    };

    this.synth.speak(utterance);
  }

  // Plan B cuando no llega el evento real: reparte la duración estimada
  // del versículo entre sus palabras, proporcional a cuántas letras
  // tiene cada una, y dispara onWordBoundary en esos tiempos. 15
  // caracteres/segundo a rate=1.0 es una estimación de habla normal, no
  // una medición exacta — se documenta como tal, no se presenta como
  // dato confirmado.
  _runEstimatedHighlighting(index, text) {
    const CHARS_PER_SECOND_AT_RATE_1 = 15;
    const words = [];
    let charPos = 0;
    text.split(/(\s+)/).forEach((token) => {
      if (token.trim().length > 0) words.push({ charIndex: charPos, length: token.length });
      charPos += token.length;
    });
    if (words.length === 0) return;

    const totalEstimatedMs = (text.length / CHARS_PER_SECOND_AT_RATE_1 / this.rate) * 1000;
    let elapsedMs = 0;
    this._estimatedTimers = words.map((w) => {
      const wordShareMs = (w.length / text.length) * totalEstimatedMs;
      const timer = setTimeout(() => {
        if (this.onWordBoundary) this.onWordBoundary(index, w.charIndex);
      }, elapsedMs);
      elapsedMs += wordShareMs;
      return timer;
    });
  }

  _clearEstimatedTimers() {
    this._estimatedTimers.forEach((t) => clearTimeout(t));
    this._estimatedTimers = [];
  }

  // No usados por AppController (ver nota arriba) — se dejan por si
  // algún navegador futuro los soporta bien.
  pause() {
    if (this.supported && this.synth.speaking) this.synth.pause();
  }

  resume() {
    if (this.supported && this.synth.paused) this.synth.resume();
  }

  stop() {
    clearTimeout(this._fallbackTimer);
    this._clearEstimatedTimers();
    if (this.supported) this.synth.cancel();
    this._queue = [];
    this._currentIndex = -1;
  }
}
