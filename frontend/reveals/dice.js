export function createDiceReveal({ controller, sound }) {
  const boxElement = document.querySelector('#dice-box');
  const placeholder = document.querySelector('#dice-placeholder');
  const placeholderCopy = document.querySelector('#dice-placeholder-copy');
  const total = document.querySelector('#dice-result');
  let box = null;
  let boxPromise = null;

  async function getBox() {
    if (box) return box;
    if (!boxPromise) {
      boxPromise = import('/dice-box.js').then(async ({ default: DiceBox }) => {
        const instance = new DiceBox('#dice-box', {
          sounds: false,
          shadows: true,
          theme_surface: 'green-felt',
          theme_colorset: 'white',
          theme_texture: '',
          theme_material: 'plastic',
          color_spotlight: 0xffb13b,
          light_intensity: 0.9,
          gravity_multiplier: 420,
          strength: 1.35,
          baseScale: 92,
          iterationLimit: 700,
        });
        await instance.initialize();
        box = instance;
        return instance;
      }).catch((error) => {
        console.warn('3D dice unavailable, using the static result.', error);
        return null;
      });
    }
    return boxPromise;
  }

  function reset() {
    box?.clearDice();
    boxElement.classList.remove('visible');
    placeholder.hidden = false;
    placeholderCopy.textContent = 'Dice ready';
    total.textContent = '?';
  }

  function settle(resolution, preservePhysics = false) {
    if (!preservePhysics) {
      box?.clearDice();
      boxElement.classList.remove('visible');
      placeholder.hidden = false;
      placeholderCopy.textContent = `${resolution.event.die1} + ${resolution.event.die2}`;
    } else {
      placeholder.hidden = true;
    }
    boxElement.setAttribute(
      'aria-label',
      `Dice landed on ${resolution.event.die1} and ${resolution.event.die2}`,
    );
    total.textContent = resolution.event.die1 + resolution.event.die2;
  }

  async function play(resolution) {
    reset();
    let completedPhysically = false;
    await controller.playReveal(
      resolution,
      (res) => settle(res, completedPhysically),
      async () => {
        const diceBox = await controller.wait(getBox());
        if (!diceBox) return;

        placeholder.hidden = true;
        boxElement.classList.add('visible');
        sound.play('dice');
        const roll = diceBox.roll(`2d6@${resolution.event.die1},${resolution.event.die2}`);
        await controller.wait(roll);
        completedPhysically = diceBox.rolling === false;
        settle(resolution, completedPhysically);
      },
    );
  }

  return { reset, settle, play };
}
