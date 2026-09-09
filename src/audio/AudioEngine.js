// AudioEngine.js — Motor de audio AMBIENTAL (viento, oleaje, dron sacro,
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

export class AmbientAudioEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.isPlaying = false;
    this.startTime = 0;
    this.pauseOffset = 0;

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

    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneGain = null;
  }

  init() {
    if (this.isInitialized) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
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
    this.windGainNode.gain.value = 0.6;

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
    this.waveGainNode.gain.value = 0.5;

    this.waveNoiseNode.connect(this.waveFilterNode);
    this.waveFilterNode.connect(this.waveGainNode);
    this.waveGainNode.connect(this.ambientGain);

    this.waveNoiseNode.start();
  }

  _setupDrone() {
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc1.frequency.value = 108;
    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.value = 216;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;

    this.droneOsc1.connect(this.droneGain);
    this.droneOsc2.connect(this.droneGain);
    this.droneGain.connect(this.ambientGain);

    this.droneOsc1.start();
    this.droneOsc2.start();
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

  // stage: 'storm-building' | 'storm-peak' | 'command' | 'calm'
  // Reemplaza los umbrales de tiempo fijo (time < 20.0, etc.) del
  // original: ahora el ambiente reacciona a qué versículo se narra.
  setStage(stage) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (stage === 'storm-building' || stage === 'storm-peak') {
      this.windGainNode.gain.setTargetAtTime(0.6, t, 0.4);
      this.waveGainNode.gain.setTargetAtTime(0.5, t, 0.4);
      this.droneGain.gain.setTargetAtTime(0.0, t, 0.6);
    } else if (stage === 'command') {
      this.windGainNode.gain.setTargetAtTime(0.05, t, 0.6);
      this.waveGainNode.gain.setTargetAtTime(0.08, t, 0.6);
      this.droneGain.gain.setTargetAtTime(0.2, t, 0.8);
    } else {
      this.windGainNode.gain.setTargetAtTime(0.02, t, 1.0);
      this.waveGainNode.gain.setTargetAtTime(0.03, t, 1.0);
      this.droneGain.gain.setTargetAtTime(0.35, t, 1.0);
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

  play() {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.startTime = this.ctx.currentTime;
    this.isPlaying = true;
  }

  // Nota: el HTML original también tenía este hueco — pause() solo
  // apagaba una bandera interna, pero el AudioContext seguía corriendo,
  // así que viento/olas/dron continuaban sonando de fondo aunque la UI
  // dijera "pausado". Aquí sí se suspende el contexto de verdad.
  pause() {
    if (!this.isPlaying) return;
    this.pauseOffset = this.getElapsedTime();
    this.isPlaying = false;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }
}
