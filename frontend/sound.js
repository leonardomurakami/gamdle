export function createSound(getEnabled) {
  let context = null;

  function initialize() {
    if (!getEnabled() || context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) context = new AudioContext();
  }

  function tone(frequency, duration = 0.08, offset = 0, type = 'sine', gain = 0.035) {
    if (!getEnabled()) return;
    initialize();
    if (!context) return;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, context.currentTime + offset);
    volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + duration);
    oscillator.connect(volume).connect(context.destination);
    oscillator.start(context.currentTime + offset);
    oscillator.stop(context.currentTime + offset + duration);
  }

  function play(name, won = false, index = 0) {
    if (name === 'wheel') [0, 0.1, 0.2, 0.3].forEach((offset, step) => tone(330 + step * 26, 0.04, offset, 'square', 0.014));
    if (name === 'cards') tone(520, 0.07, 0, 'triangle', 0.025);
    if (name === 'dice') {
      tone(120, 0.11, 0, 'square', 0.04);
      tone(165, 0.09, 0.13, 'square', 0.03);
    }
    if (name === 'reel') tone(310 + index * 90, 0.08, 0, 'square', 0.025);
    if (name === 'result') {
      if (won) {
        tone(520, 0.12);
        tone(660, 0.12, 0.11);
        tone(820, 0.18, 0.22);
      } else {
        tone(220, 0.12, 0, 'sawtooth', 0.025);
        tone(165, 0.18, 0.12, 'sawtooth', 0.02);
      }
    }
  }

  return { initialize, play, tone };
}
