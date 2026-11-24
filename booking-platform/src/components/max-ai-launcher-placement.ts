type Rectangle = { left: number; right: number; top: number; bottom: number };
const GAP = 10;
const CONTROL_SELECTOR = 'a,button:not(.stay-photo-tile),input,select,textarea,summary,.mobile-booking-action,.stay-mobile-action,.mobile-nav,.concierge-footer-hours';
const BAR_SELECTOR = '.mobile-booking-action,.stay-mobile-action,.mobile-nav';

/** Always calculate from the resting position, so moving away cannot cause oscillation. */
export function mobileLauncherLift(resting: Rectangle, obstacles: Rectangle[]): number {
  const height = resting.bottom - resting.top;
  let top = resting.top;
  for (let pass = 0; pass <= obstacles.length; pass++) {
    const collisions = obstacles.filter(rect => resting.left < rect.right + GAP && resting.right > rect.left - GAP && top < rect.bottom + GAP && top + height > rect.top - GAP);
    if (!collisions.length) break;
    const next = Math.min(...collisions.map(rect => rect.top - height - GAP));
    if (next >= top) break;
    top = next;
  }
  return Math.max(0, resting.top - top);
}

/** Observe nearby actions; scrolling only reads this bounded set, never scans the page. */
export function observeLauncherPlacement(launcher: HTMLButtonElement, desktopScope: string | null): () => void {
  const mobile = window.matchMedia('(max-width: 760px)');
  const clearance = document.querySelector<HTMLElement>('.max-ai-mobile-clearance');
  let stopObserving: (() => void) | undefined;
  function start() {
    stopObserving?.();
    stopObserving = undefined;
    if (!mobile.matches && !desktopScope) return;
    let frame = 0, lift = 0, barInset = 0, controlsChanged = true;
    let intersections: IntersectionObserver;
    const observed = new Set<HTMLElement>(), nearby = new Set<HTMLElement>(), bars = new Set<HTMLElement>();
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    function measure() {
      frame = 0;
      if (controlsChanged) { controlsChanged = false; refresh(); }
      if (launcher.hidden || document.querySelector('dialog[open]')) return;
      const box = launcher.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const resting = { left: box.left, right: box.right, top: box.top + lift, bottom: box.bottom + lift };
      const obstacles: Rectangle[] = [];
      let nextBarInset = 0;
      for (const control of new Set([...bars, ...nearby])) {
        if (obstacles.length >= 64) break;
        if (!control.isConnected || control.closest('[hidden],dialog')) continue;
        const rect = control.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
        if (!bars.has(control) && rect.height > 120) continue;
        const style = getComputedStyle(control);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        if (bars.has(control) && style.position === 'fixed' && rect.bottom >= window.innerHeight - 1) nextBarInset = Math.max(nextBarInset, window.innerHeight - rect.top);
        if (rect.left >= resting.right + GAP || rect.right <= resting.left - GAP) continue;
        obstacles.push(rect);
      }
      if (nextBarInset !== barInset) { barInset = nextBarInset; clearance?.style.setProperty('--max-ai-bar-inset', `${barInset}px`); }
      const next = Math.min(mobileLauncherLift(resting, obstacles), Math.max(0, resting.top - GAP));
      if (next !== lift) { lift = next; launcher.style.setProperty('--max-ai-lift', `${lift}px`); }
    }
    function refresh() {
      const root = mobile.matches ? document : desktopScope ? document.querySelector(desktopScope) : null;
      const selector = !mobile.matches ? `${CONTROL_SELECTOR},.checkout-acknowledgement,.final-traveller-summary p` : CONTROL_SELECTOR;
      const controls = new Set(Array.from(root?.querySelectorAll<HTMLElement>(selector) ?? []).filter(node => !node.closest('.max-ai-dialog,.max-ai-launcher,dialog')).slice(0, 600));
      for (const node of observed) if (!controls.has(node)) { intersections.unobserve(node); observed.delete(node); nearby.delete(node); bars.delete(node); }
      for (const node of controls) if (!observed.has(node)) { observed.add(node); intersections.observe(node); if (node.matches(BAR_SELECTOR)) bars.add(node); }
    }
    function observeRegion() {
      intersections?.disconnect();
      nearby.clear();
      intersections = new IntersectionObserver(entries => {
        for (const entry of entries) { if (entry.isIntersecting) nearby.add(entry.target as HTMLElement); else nearby.delete(entry.target as HTMLElement); }
        schedule();
      });
      for (const node of observed) intersections.observe(node);
      schedule();
    }
    observeRegion();
    const mutations = new MutationObserver(records => {
      const changes = records.filter(record => !(record.target instanceof Element && record.target.closest('.max-ai-launcher,.max-ai-dialog,.max-ai-mobile-clearance')));
      if (!changes.length) return;
      // Scrolling can update classes/styles frequently. Those only require a
      // bounded geometry pass; rebuild the observed set only when controls change.
      if (changes.some(record => record.type === 'childList' || (record.target instanceof HTMLElement && record.target.matches(BAR_SELECTOR) && !observed.has(record.target)))) controlsChanged = true;
      for (const record of changes) if (record.target instanceof HTMLElement && observed.has(record.target)) {
        if (record.target.matches(BAR_SELECTOR)) bars.add(record.target); else bars.delete(record.target);
      }
      schedule();
    });
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'open'] });
    const scroll = () => { if (nearby.size || bars.size || lift) schedule(); };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', observeRegion);
    stopObserving = () => { mutations.disconnect(); intersections.disconnect(); window.removeEventListener('scroll', scroll); window.removeEventListener('resize', observeRegion); cancelAnimationFrame(frame); launcher.style.removeProperty('--max-ai-lift'); clearance?.style.removeProperty('--max-ai-bar-inset'); };
  }
  start();
  mobile.addEventListener('change', start);
  return () => { mobile.removeEventListener('change', start); stopObserving?.(); };
}
