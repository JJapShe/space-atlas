'use strict';

(() => {
  function setState(state) {
    if (window.atlasOfflineState === state) return;
    window.atlasOfflineState = state;
    window.dispatchEvent(new CustomEvent('atlas-offline', { detail: { state } }));
  }

  const workers = navigator.serviceWorker;
  if (!window.isSecureContext || !workers) {
    setState('unavailable');
    return;
  }

  const scope = new URL('./', document.baseURI).href;
  const workerUrl = new URL('sw.js', scope).href;
  let starting;
  let pendingStatus;
  const watched = new WeakSet();
  let registration;

  function verify() {
    const controller = workers.controller?.scriptURL === workerUrl
      ? workers.controller
      : registration?.active;
    if (controller?.scriptURL !== workerUrl) return;
    if (pendingStatus) pendingStatus();
    const channel = new MessageChannel();
    const finish = () => {
      clearTimeout(timer);
      channel.port1.close();
      pendingStatus = undefined;
    };
    const timer = setTimeout(() => {
      finish();
      setState('unavailable');
    }, 120000);
    pendingStatus = finish;
    channel.port1.onmessage = ({ data }) => {
      finish();
      setState(data === 'ready' ? 'ready' : 'unavailable');
    };
    try {
      controller.postMessage({ type: 'atlas-offline-status' }, [channel.port2]);
    } catch {
      finish();
      setState('unavailable');
    }
  }

  function watch(worker) {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    const inspect = () => {
      if (worker.state === 'redundant' && !registration?.active) {
        setState('unavailable');
      }
    };
    worker.addEventListener('statechange', inspect);
    inspect();
  }

  async function prepare() {
    try {
      const existing = await workers.getRegistration(scope);
      registration = existing?.scope === scope ? existing : undefined;
      if (!registration || !(registration.active || registration.installing || registration.waiting)) {
        if (!navigator.onLine) {
          setState('unavailable');
          return;
        }
        registration = await workers.register('./sw.js', { scope: './', updateViaCache: 'none' });
      }
      if (!watched.has(registration)) {
        watched.add(registration);
        registration.addEventListener('updatefound', () => watch(registration.installing));
      }
      watch(registration.installing);
      verify();
      if (existing && navigator.onLine) registration.update().catch(() => {});
    } catch {
      if (workers.controller?.scriptURL === workerUrl) verify();
      else setState('unavailable');
    }
  }

  function start() {
    if (starting) return;
    if (window.atlasOfflineState !== 'ready') setState('preparing');
    starting = prepare().finally(() => { starting = undefined; });
  }

  workers.addEventListener('controllerchange', verify);
  window.addEventListener('online', start);
  start();
})();
