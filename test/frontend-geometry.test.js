import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EUROPEAN_WHEEL_ORDER,
  SLOT_SYMBOL_ORDER,
  rouletteBallTrajectory,
  rouletteLanding,
  roulettePocketIndex,
  slotLanding,
} from '../frontend/game-geometry.js';

test('European roulette contains every pocket exactly once', () => {
  assert.equal(EUROPEAN_WHEEL_ORDER.length, 37);
  assert.deepEqual([...EUROPEAN_WHEEL_ORDER].sort((a, b) => a - b), Array.from({ length: 37 }, (_, index) => index));
});

test('every roulette landing aligns the ball and resolved pocket at the top', () => {
  for (let pocket = 0; pocket <= 36; pocket += 1) {
    const landing = rouletteLanding(pocket);
    assert.equal(EUROPEAN_WHEEL_ORDER[roulettePocketIndex(pocket)], pocket);
    assert.ok(Math.abs(landing.relativePocketAngle - landing.relativeBallAngle) < 1e-9);
  }
});

test('every roulette trajectory spirals inward and finishes on its resolved pocket', () => {
  for (let pocket = 0; pocket <= 36; pocket += 1) {
    const trajectory = rouletteBallTrajectory(pocket);
    const last = trajectory.times.length - 1;

    assert.equal(trajectory.radius.length, trajectory.times.length);
    assert.equal(trajectory.orbit.length, trajectory.times.length);
    assert.equal(trajectory.deflection.length, trajectory.times.length);
    assert.equal(trajectory.lift.length, trajectory.times.length);
    assert.equal(trajectory.orbit[last], trajectory.landing.ballRotation);
    assert.equal(trajectory.radius[last], 31);
    assert.equal(trajectory.deflection[last], 0);
    assert.equal(trajectory.lift[last], 1);

    for (let index = 1; index < last - 1; index += 1) {
      assert.ok(trajectory.radius[index] >= trajectory.radius[index - 1]);
      assert.ok(trajectory.orbit[index] < trajectory.orbit[index - 1]);
    }
    assert.ok(Math.abs(
      trajectory.landing.relativePocketAngle - trajectory.landing.relativeBallAngle,
    ) < 1e-9);
  }
});

test('slot landing offsets point to the authoritative symbol', () => {
  for (const symbol of SLOT_SYMBOL_ORDER) {
    const landing = slotLanding(symbol, 5);
    assert.equal(landing.symbolIndex, SLOT_SYMBOL_ORDER.indexOf(symbol));
    assert.equal(landing.itemIndex % SLOT_SYMBOL_ORDER.length, landing.symbolIndex);
  }
});
