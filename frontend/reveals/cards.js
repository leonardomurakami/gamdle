import { animate } from 'motion';

const SUITS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const RANKS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

export function createCardReveal({ controller, sound }) {
  const card = document.querySelector('#playing-card');
  const copy = document.querySelector('#card-stage-copy');

  function populate(resolution) {
    const { rank: value, suit } = resolution.event;
    const rank = RANKS[value] || value;
    const symbol = SUITS[suit];
    document.querySelectorAll('[data-card-rank]').forEach((element) => { element.textContent = rank; });
    document.querySelectorAll('[data-card-suit]').forEach((element) => { element.textContent = symbol; });
    document.querySelector('#card-name').textContent = resolution.label;
    card.classList.toggle('red-card', suit === 'hearts' || suit === 'diamonds');
    card.classList.toggle('face-card', value >= 11);
  }

  function reset() {
    card.style.transform = 'translateY(0) rotateY(0deg) rotateZ(0deg)';
    copy.textContent = 'The daily card is face down.';
  }

  function settle(resolution) {
    populate(resolution);
    card.style.transform = 'translateY(0) rotateY(180deg) rotateZ(0deg)';
    copy.textContent = resolution.label;
  }

  async function play(resolution) {
    reset();
    populate(resolution);
    copy.textContent = 'Dealing today’s card…';
    await controller.playReveal(resolution, settle, async () => {
      sound.play('cards');
      const control = controller.track(animate(
        card,
        {
          y: [-42, -10, 0, 0],
          rotateY: [0, 0, 104, 180],
          rotateZ: [-3, -1, 0.7, 0],
          scale: [0.96, 1.02, 1.01, 1],
        },
        { duration: 1.65, times: [0, 0.3, 0.68, 1], ease: [0.22, 1, 0.36, 1] },
      ));
      await controller.wait(control);
    });
  }

  return { reset, settle, play };
}
