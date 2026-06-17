export function createRevealController(skipButton) {
  let controls = [];
  let settle = null;
  let settled = true;
  let skipTimer = null;
  let resolveCompletion = null;
  let completion = Promise.resolve();

  function reducedMotion() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function begin(finalizer) {
    cancel();
    settle = finalizer;
    settled = false;
    completion = new Promise((resolve) => { resolveCompletion = resolve; });
    skipButton.hidden = true;
    if (!reducedMotion()) {
      skipTimer = setTimeout(() => {
        if (!settled) skipButton.hidden = false;
      }, 500);
    }
  }

  function track(control) {
    controls.push(control);
    return control;
  }

  function finish() {
    if (settled) return;
    settled = true;
    clearTimeout(skipTimer);
    skipButton.hidden = true;
    controls.forEach((control) => {
      try { control.stop(); } catch { /* Animation may already be complete. */ }
    });
    controls = [];
    const finalizer = settle;
    settle = null;
    finalizer?.();
    resolveCompletion?.();
    resolveCompletion = null;
  }

  function cancel() {
    clearTimeout(skipTimer);
    controls.forEach((control) => {
      try { control.stop(); } catch { /* Animation may already be complete. */ }
    });
    controls = [];
    settle = null;
    settled = true;
    resolveCompletion?.();
    resolveCompletion = null;
    skipButton.hidden = true;
  }

  async function wait(control) {
    try {
      return await Promise.race([control, completion]);
    } catch {
      // Stopped animations settle through finish().
      return undefined;
    }
  }

  skipButton.addEventListener('click', finish);

  return { begin, track, finish, cancel, wait, reducedMotion };
}
