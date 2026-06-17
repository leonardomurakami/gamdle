import { createRevealController } from './reveal-controller.js';
import { createRouletteReveal, renderWheelNumbers } from './reveals/roulette.js';
import { createCardReveal } from './reveals/cards.js';
import { createDiceReveal } from './reveals/dice.js';
import { createSlotsReveal } from './reveals/slots.js';

export function createGameAnimations(sound) {
  const controller = createRevealController(document.querySelector('#skip-animation'));
  const reveals = {
    wheel: createRouletteReveal({ controller, sound }),
    cards: createCardReveal({ controller, sound }),
    dice: createDiceReveal({ controller, sound }),
    slots: createSlotsReveal({ controller, sound }),
  };

  renderWheelNumbers(document.querySelector('#wheel-numbers'));

  async function play(table, resolution) {
    const reveal = reveals[table];
    if (!reveal) throw new Error(`Unknown animation table: ${table}`);
    await reveal.play(resolution);
  }

  function reset(table) {
    controller.cancel();
    reveals[table]?.reset();
  }

  return { play, reset, finish: controller.finish };
}
