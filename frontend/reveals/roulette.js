import { animate } from 'motion';
import {
  EUROPEAN_WHEEL_ORDER,
  RED_NUMBERS,
  rouletteBallTrajectory,
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
  const orbit = document.querySelector('#roulette-ball-orbit');
  const radius = document.querySelector('#roulette-ball-radius');
  const impact = document.querySelector('#roulette-ball-impact');
  const result = document.querySelector('#wheel-result');

  function reset() {
    wheel.style.transform = 'rotate(0deg)';
    orbit.style.transform = 'rotate(0deg)';
    radius.style.transform = 'translateY(0)';
    impact.style.transform = 'translateX(0) scale(1)';
    result.textContent = '?';
  }

  function settle(resolution) {
    const { landing } = rouletteBallTrajectory(resolution.event.pocket);
    wheel.style.transform = `rotate(${landing.wheelRotation}deg)`;
    orbit.style.transform = `rotate(${landing.ballRotation}deg)`;
    radius.style.transform = 'translateY(31px)';
    impact.style.transform = 'translateX(0) scale(1)';
    result.textContent = resolution.event.pocket;
  }

  async function play(resolution) {
    reset();
    controller.begin(() => settle(resolution));
    if (controller.reducedMotion()) {
      controller.finish();
      return;
    }

    sound.play('wheel');
    const trajectory = rouletteBallTrajectory(resolution.event.pocket);
    const { landing, duration, times } = trajectory;
    const wheelControl = controller.track(animate(
      wheel,
      { rotate: [0, landing.wheelRotation - 96, landing.wheelRotation - 22, landing.wheelRotation] },
      { duration, times: [0, 0.68, 0.9, 1], ease: ['linear', 'easeOut', [0.16, 1, 0.3, 1]] },
    ));
    const orbitControl = controller.track(animate(
      orbit,
      { rotate: trajectory.orbit },
      { duration, times, ease: 'linear' },
    ));
    const radiusControl = controller.track(animate(
      radius,
      { y: trajectory.radius },
      { duration, times, ease: [0.4, 0, 0.2, 1] },
    ));
    const impactControl = controller.track(animate(
      impact,
      { x: trajectory.deflection, scale: trajectory.lift },
      { duration, times, ease: 'easeInOut' },
    ));
    await Promise.all([
      controller.wait(wheelControl),
      controller.wait(orbitControl),
      controller.wait(radiusControl),
      controller.wait(impactControl),
    ]);
    controller.finish();
  }

  return { reset, settle, play };
}
