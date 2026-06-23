import {
  EUROPEAN_WHEEL_ORDER,
  RED_NUMBERS,
  roulettePocketIndex,
} from '../game-geometry.js';

const point = (radius, angle) => `${160 + Math.cos(angle) * radius},${160 + Math.sin(angle) * radius}`;

export function renderWheelNumbers(group) {
  group.innerHTML = EUROPEAN_WHEEL_ORDER.map((number, index) => {
    const start = (index / 37) * Math.PI * 2 - Math.PI / 2;
    const end = ((index + 1) / 37) * Math.PI * 2 - Math.PI / 2;
    const middle = (start + end) / 2;
    const path = `M ${point(84, start)} L ${point(125, start)} A 125 125 0 0 1 ${point(125, end)} L ${point(84, end)} A 84 84 0 0 0 ${point(84, start)} Z`;
    const x = 160 + Math.cos(middle) * 105;
    const y = 160 + Math.sin(middle) * 105;
    const className = number === 0 ? 'green-pocket' : RED_NUMBERS.has(number) ? 'red-pocket' : 'black-pocket';
    return `<path class="${className}" d="${path}"></path><text x="${x.toFixed(2)}" y="${y.toFixed(2)}" transform="rotate(${(middle * 180 / Math.PI + 90).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})">${number}</text>`;
  }).join('');
}

export function createRouletteReveal({ controller, sound }) {
  const wheel = document.querySelector('#roulette-wheel');
  const result = document.querySelector('#wheel-result');
  const pocketPaths = () => [...document.querySelectorAll('#wheel-numbers path')];

  function reset() {
    wheel.style.transform = 'rotate(0deg)';
    result.textContent = '?';
    pocketPaths().forEach((p) => p.classList.remove('pocket-lit'));
  }

  function settle(resolution) {
    pocketPaths().forEach((p) => p.classList.remove('pocket-lit'));
    const paths = pocketPaths();
    const idx = roulettePocketIndex(resolution.event.pocket);
    if (paths[idx]) paths[idx].classList.add('pocket-lit');
    result.textContent = resolution.event.pocket;
  }

  async function play(resolution) {
    reset();
    await controller.playReveal(resolution, settle, async () => {
      sound.play('wheel');
      const paths = pocketPaths();
      const targetIndex = roulettePocketIndex(resolution.event.pocket);
      const totalPockets = EUROPEAN_WHEEL_ORDER.length;

      const cycles = 3;
      const totalAdvances = cycles * totalPockets + targetIndex;

      const minInterval = 30;
      const maxInterval = 240;

      let advance = 0;

      await new Promise((resolveAnim) => {
        function frame() {
          paths.forEach((p) => p.classList.remove('pocket-lit'));
          const current = advance % totalPockets;
          const lit = paths[current];
          if (lit) lit.classList.add('pocket-lit');

          advance++;
          if (advance > totalAdvances) {
            resolveAnim();
            return;
          }

          const progress = advance / totalAdvances;
          const interval = minInterval + (maxInterval - minInterval) * Math.pow(progress, 2);
          setTimeout(frame, interval);
        }
        frame();
      });
    });
  }

  return { reset, settle, play };
}
