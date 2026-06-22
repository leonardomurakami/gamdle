import { animate } from 'motion';
import {
  SLOT_SYMBOL_GLYPHS,
  SLOT_SYMBOL_ORDER,
  slotLanding,
} from '../game-geometry.js';

const REEL_CYCLES = 6;

function buildStrip(reel) {
  const symbols = Array.from({ length: REEL_CYCLES + 2 }, () => SLOT_SYMBOL_ORDER).flat();
  reel.innerHTML = `<div class="reel-strip" aria-hidden="true">${symbols.map((symbol) => (
    `<span data-symbol="${symbol}">${SLOT_SYMBOL_GLYPHS[symbol]}</span>`
  )).join('')}</div>`;
}

export function createSlotsReveal({ controller, sound }) {
  const reels = [...document.querySelectorAll('.slot-reel')];
  const lights = [...document.querySelectorAll('.slot-lights i')];
  reels.forEach(buildStrip);

  function offsetFor(reel, itemIndex) {
    return -itemIndex * reel.clientHeight;
  }

  function reset() {
    reels.forEach((reel, index) => {
      const strip = reel.querySelector('.reel-strip');
      strip.style.transform = `translateY(${offsetFor(reel, index)}px)`;
      strip.style.filter = 'blur(0)';
    });
    lights.forEach((light) => light.classList.remove('lit'));
  }

  function settle(resolution) {
    reels.forEach((reel, index) => {
      const strip = reel.querySelector('.reel-strip');
      const landing = slotLanding(resolution.event.symbols[index], REEL_CYCLES);
      strip.style.transform = `translateY(${offsetFor(reel, landing.itemIndex)}px)`;
      strip.style.filter = 'blur(0)';
      reel.dataset.symbol = landing.symbol;
      reel.setAttribute('aria-label', `Reel ${index + 1}: ${landing.symbol}`);
    });
    lights.forEach((light) => light.classList.add('lit'));
  }

  async function play(resolution) {
    reset();
    await controller.playReveal(resolution, settle, async () => {
      const controls = reels.map((reel, index) => {
        const strip = reel.querySelector('.reel-strip');
        const landing = slotLanding(resolution.event.symbols[index], REEL_CYCLES);
        const target = offsetFor(reel, landing.itemIndex);
        const duration = 1.2 + index * 0.18;
        const control = controller.track(animate(
          strip,
          {
            y: [0, target + reel.clientHeight * 0.28, target - reel.clientHeight * 0.08, target],
            filter: ['blur(0px)', 'blur(3px)', 'blur(1px)', 'blur(0px)'],
          },
          { duration, times: [0, 0.78, 0.92, 1], ease: ['linear', 'easeOut', [0.16, 1, 0.3, 1]] },
        ));
        control.then(() => {
          if (reel.dataset.symbol !== landing.symbol) {
            reel.dataset.symbol = landing.symbol;
            sound.play('reel', false, index);
            lights[index + 1]?.classList.add('lit');
          }
        }).catch(() => {});
        return control;
      });
      await Promise.all(controls.map(controller.wait));
    });
  }

  return { reset, settle, play };
}
