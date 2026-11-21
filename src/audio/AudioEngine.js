// AudioEngine.js — Motor de audio AMBIENTAL (viento, oleaje, colchón sacro,
// trueno). Todo esto es síntesis procedimental: 0 bytes de red, funciona
// offline. La voz vive aparte, en VoiceEngine.js: el navegador no permite
// conectar la salida de speechSynthesis a este grafo de Web Audio, así
// que mezclarlas en la misma clase no tendría sentido (ver DCM, 6.1).
//
// ESTADO: portado del HTML original de Fase 3 (esa parte ya se había
// probado y funcionaba: viento, oleaje y dron sí sonaban). setStage() en
// vez de umbrales de tiempo fijos, y setDucking(), se agregaron en Turno 3.
//
// CAMBIO TURNO 7 (ruta: src/audio/AudioEngine.js):
// - setDucking(): el nivel al que baja el ambiente pasó de 0.35 a 0.8
//   (mucho más leve). AppController ahora solo lo llama durante la etapa
//   "command" — antes se llamaba en todo versículo y apagaba la
//   sensación de tormenta peligrosa casi de inmediato.
//
// CAMBIO TURNO 21 (ruta: src/audio/AudioEngine.js) — DIAGNÓSTICO CON
// EVIDENCIA (análisis espectral de dos grabaciones de pantalla del usuario):
// desde el "Calla, enmudece" sonaba un zumbido grave sostenido: DOS TONOS
// PUROS a 108 Hz (seno) y 216 Hz (triángulo), a la octava y sin nada en
// medio (timbre "hueco"), con el 87 % de la energía entre 80 y 320 Hz y un
// nivel de ≈ −11 dBFS, MÁS FUERTE QUE LA NARRACIÓN; y al terminar, pause()
// suspendía el contexto de golpe (−12 dBFS → silencio en < 0,1 s).
// Cambios:
// - Colchón cálido en lugar del dron: La2 + Mi3 + La3 + Mi4 (raíz, quinta,
//   octava y quinta alta), cada nota doble y apenas desafinada (±3 cents,
//   efecto coro), a través de un filtro pasa-bajos que respira muy despacio.
//   Nivel ≈ 20 dB más bajo que el dron anterior: ahora acompaña a la voz.
// - Etapa nueva "dusk" (anochecer tranquilo, versículos 35 y 36): viento y
//   oleaje suaves y un hilo del colchón. El ambiente de antes de empezar la
//   narración también arranca en ese nivel (antes arrancaba en tormenta).
// - fadeOut(s): baja el ambiente con un fundido (lo usa AppController al
//   terminar la narración). cancelFade(): lo anula (saltos de versículo).
// - play()/pause(): entrada suave de 0,25 s y bajada de 80 ms antes de
//   suspender: se acabó el "clic" al pausar y reanudar.
// - supportsDusk = true: AppController lo consulta para saber si este
//   archivo ya entiende la etapa "dusk".

const MASTER_LEVEL = 0.8;

// Nivel del colchón por etapa (antes 0.2 en "command" y 0.35 en "calm").
const PAD_LEVEL = { dusk: 0.03, command: 0.05, calm: 0.085 };

export class AmbientAudioEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.isPlaying = false;
    this.startTime = 0;
    this.pauseOffset = 0;
    this.supportsDusk = true; // Turno 21 — ver cabecera

    this.masterGain = null;
    this.ambientGain = null; // todo lo ambiental pasa por aquí para poder "duckear"

    this.windNoiseNode = null;
    this.windFilterNode = null;
    this.windGainNode = null;
    this.windPannerNode = null;
    this.windLfoNode = null;

    this.waveNoiseNode = null;
    this.waveFilterNode = null;
    this.waveGainNode = null;

    this.droneOscs = []; // Turno 21: el colchón (antes droneOsc1/droneOsc2)
    this.droneFilter = null;
    this.droneGain = null;
    this._suspendTimer = null;
    this._fading = false; // hay un fundido de salida en curso
  }

  init() {
    if (this.isInitialized) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = MASTER_LEVEL;
    this.masterGain.connect(this.ctx.destination);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 1.0;
    this.ambientGain.connect(this.masterGain);

    if (this.ctx.listener.forwardX) {
      this.ctx.listener.forwardX.value = 0;
      this.ctx.listener.forwardY.value = 0;
      this.ctx.listener.forwardZ.value = -1;
      this.ctx.listener.upX.value = 0;
      this.ctx.listener.upY.value = 1;
      this.ctx.listener.upZ.value = 0;
    }

    this._setupWind();
    this._setupWaves();
    this._setupDrone();
    this.isInitialized = true;
  }

  _createNoiseBuffer(duration = 5) {
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  _setupWind() {
    this.windNoiseNode = this.ctx.createBufferSource();
    this.windNoiseNode.buffer = this._createNoiseBuffer(5);
    this.windNoiseNode.loop = true;

    this.windFilterNode = this.ctx.createBiquadFilter();
    this.windFilterNode.type = 'bandpass';
    this.windFilterNode.frequency.value = 400;
    this.windFilterNode.Q.value = 3.0;

    this.windLfoNode = this.ctx.createOscillator();
    this.windLfoNode.frequency.value = 0.2;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 250;
    this.windLfoNode.connect(lfoGain);
    lfoGain.connect(this.windFilterNode.frequency);

    this.windPannerNode = this.ctx.createPanner();
    this.windPannerNode.panningModel = 'HRTF';
    this.windPannerNode.distanceModel = 'inverse';

    this.windGainNode = this.ctx.createGain();
    this.windGainNode.gain.value = 0.14; // Turno 21: arranca en "dusk" (antes 0.6, tormenta)

    this.windNoiseNode.connect(this.windFilterNode);
    this.windFilterNode.connect(this.windPannerNode);
    this.windPannerNode.connect(this.windGainNode);
    this.windGainNode.connect(this.ambientGain);

    this.windNoiseNode.start();
    this.windLfoNode.start();
  }

  _setupWaves() {
    this.waveNoiseNode = this.ctx.createBufferSource();
    this.waveNoiseNode.buffer = this._createNoiseBuffer(6);
    this.waveNoiseNode.loop = true;

    this.waveFilterNode = this.ctx.createBiquadFilter();
    this.waveFilterNode.type = 'lowpass';
    this.waveFilterNode.frequency.value = 220;

    this.waveGainNode = this.ctx.createGain();
    this.waveGainNode.gain.value = 0.28; // Turno 21: arranca en "dusk" (antes 0.5, tormenta)

    this.waveNoiseNode.connect(this.waveFilterNode);
    this.waveFilterNode.connect(this.waveGainNode);
    this.waveGainNode.connect(this.ambientGain);

    this.waveNoiseNode.start();
  }

  // Turno 21 — colchón cálido (ver cabecera). Cuatro notas, cada una doble y
  // apenas desafinada, por un pasa-bajos que respira (LFO de 0,045 Hz).
  _setupDrone() {
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = PAD_LEVEL.dusk;

    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 480;
    this.droneFilter.Q.value = 0.4;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 110;
    lfo.connect(lfoDepth);
    lfoDepth.connect(this.droneFilter.frequency);
    lfo.start();

    // [frecuencia, peso]: La2, Mi3, La3, Mi4.
    const notes = [
      [110.0, 0.5],
      [164.81, 0.34],
      [220.0, 0.24],
      [329.63, 0.1],
    ];
    notes.forEach(([freq, weight]) => {
      [-3, 3].forEach((cents) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = cents;
        const g = ctx.createGain();
        g.gain.value = weight * 0.5;
        osc.connect(g);
        g.connect(this.droneFilter);
        osc.start();
        this.droneOscs.push(osc);
      });
    });

    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.ambientGain);
  }

  triggerThunder() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 1.2);
    gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.2);
    osc.connect(gain);
    gain.connect(this.ambientGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 1.2);
  }

  // stage: 'dusk' | 'storm-building' | 'storm-peak' | 'command' | 'calm'
  // Reemplaza los umbrales de tiempo fijo (time < 20.0, etc.) del
  // original: ahora el ambiente reacciona a qué versículo se narra.
  setStage(stage) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (stage === 'dusk') {
      // Turno 21: anochecer tranquilo — oleaje suave, brisa y un hilo del colchón.
      this.windGainNode.gain.setTargetAtTime(0.14, t, 1.0);
      this.waveGainNode.gain.setTargetAtTime(0.28, t, 1.0);
      this.droneGain.gain.setTargetAtTime(PAD_LEVEL.dusk, t, 1.5);
    } else if (stage === 'storm-building' || stage === 'storm-peak') {
      this.windGainNode.gain.setTargetAtTime(0.6, t, 0.4);
      this.waveGainNode.gain.setTargetAtTime(0.5, t, 0.4);
      this.droneGain.gain.setTargetAtTime(0.0, t, 0.6);
    } else if (stage === 'command') {
      this.windGainNode.gain.setTargetAtTime(0.05, t, 0.6);
      this.waveGainNode.gain.setTargetAtTime(0.08, t, 0.6);
      this.droneGain.gain.setTargetAtTime(PAD_LEVEL.command, t, 0.8);
    } else {
      this.windGainNode.gain.setTargetAtTime(0.02, t, 1.0);
      this.waveGainNode.gain.setTargetAtTime(0.03, t, 1.0);
      this.droneGain.gain.setTargetAtTime(PAD_LEVEL.calm, t, 1.0);
    }
  }

  // Baja el ambiente mientras se narra, para que la voz se entienda.
  // Turno 7: bajado de 0.35 a 0.8 (más leve) — AppController ahora solo
  // llama esto durante la etapa "command", no en todo versículo.
  setDucking(isNarrating) {
    if (!this.ambientGain || !this.ctx) return;
    const target = isNarrating ? 0.8 : 1.0;
    this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.3);
  }

  updateWindOrbit(elapsedSeconds) {
    if (!this.windPannerNode) return;
    const angle = elapsedSeconds * 0.5;
    this.windPannerNode.positionX.value = Math.sin(angle) * 5;
    this.windPannerNode.positionZ.value = Math.cos(angle) * 5;
  }

  getElapsedTime() {
    if (!this.isPlaying || !this.ctx) return this.pauseOffset;
    return this.ctx.currentTime - this.startTime + this.pauseOffset;
  }

  // Turno 21: fundido de salida (AppController lo llama al terminar la
  // narración; después llama a pause()). Es exponencial: en decibelios es una
  // bajada pareja, que el oído oye como un fundido natural.
  fadeOut(seconds = 2.5) {
    if (!this.ctx || !this.masterGain || !this.isPlaying) return;
    const g = this.masterGain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, 0.0011), t);
    g.exponentialRampToValueAtTime(0.001, t + seconds);
    this._fading = true;
  }

  // Anula un fundido en curso y devuelve el volumen (saltos de versículo).
  cancelFade() {
    if (!this.ctx || !this.masterGain) return;
    const g = this.masterGain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(MASTER_LEVEL, t + 0.2);
    this._fading = false;
  }

  play() {
    if (!this.ctx) this.init();
    clearTimeout(this._suspendTimer);
    this._suspendTimer = null;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // Turno 21: entrada suave (sin "clic" al reanudar) y fin de cualquier fundido pendiente.
    const g = this.masterGain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(MASTER_LEVEL, t + 0.25);
    this._fading = false;
    this.startTime = this.ctx.currentTime;
    this.isPlaying = true;
  }

  // Nota: el HTML original también tenía este hueco — pause() solo
  // apagaba una bandera interna, pero el AudioContext seguía corriendo,
  // así que viento/olas/dron continuaban sonando de fondo aunque la UI
  // dijera "pausado". Aquí sí se suspende el contexto de verdad.
  // Turno 21: con una bajada de 80 ms antes de suspender (sin "clic").
  pause() {
    if (!this.isPlaying) return;
    this.pauseOffset = this.getElapsedTime();
    this.isPlaying = false;
    if (!this.ctx) return;
    // Si venía de un fundido de salida, el volumen ya está en ~0: solo se
    // suspende (no se toca el volumen para no provocar un salto).
    if (!this._fading) {
      const g = this.masterGain.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(g.value, 0.0002), t);
      g.exponentialRampToValueAtTime(0.0001, t + 0.08);
    }
    clearTimeout(this._suspendTimer);
    this._suspendTimer = setTimeout(() => {
      this._suspendTimer = null;
      if (!this.isPlaying && this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    }, 130);
  }
}
