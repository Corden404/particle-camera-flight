const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(dialog) {
  return [...dialog.querySelectorAll(focusableSelector)].filter(element =>
    !element.closest('[hidden], [inert]') && element.getClientRects().length > 0
  );
}

// One modal at a time, with an inert background and native controls inside it.
export function createModalController({ root, dialogs, fallbackFocus, onChange = () => {} }) {
  let active = null;
  let origin = null;
  let dismissible = true;
  const priorInert = new Map();

  for (const dialog of dialogs) {
    dialog.hidden = true;
    dialog.inert = true;
    dialog.setAttribute('aria-hidden', 'true');
  }

  function focusInside() {
    const target = active?.querySelector('[data-initial-focus]') || (active && focusableElements(active)[0]) || active;
    target?.focus({ preventScroll: true });
  }

  function close({ restoreFocus = true, force = false } = {}) {
    if (!active || (!dismissible && !force)) return false;
    const closing = active;
    active = null;
    for (const [element, wasInert] of priorInert) element.inert = wasInert;
    priorInert.clear();
    if (restoreFocus) {
      const canRestore = origin?.isConnected && origin !== document.body && !origin.disabled && !origin.closest('[hidden], [inert]');
      (canRestore ? origin : fallbackFocus)?.focus({ preventScroll: true });
    } else if (closing.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    closing.classList.remove('show');
    closing.hidden = true;
    closing.inert = true;
    closing.setAttribute('aria-hidden', 'true');
    origin = null;
    onChange(null);
    return true;
  }

  function open(dialog, { trigger = document.activeElement, canDismiss = true } = {}) {
    if (active === dialog) return;
    const returnTo = active ? origin : trigger;
    close({ restoreFocus: false, force: true });
    origin = returnTo;
    active = dialog;
    dismissible = canDismiss;
    for (const element of root.children) {
      priorInert.set(element, element.inert);
      element.inert = element !== dialog;
    }
    dialog.hidden = false;
    dialog.inert = false;
    dialog.setAttribute('aria-hidden', 'false');
    dialog.classList.add('show');
    onChange(dialog);
    focusInside();
  }

  function onKeyDown(event) {
    if (!active || event.defaultPrevented) return;
    if (event.key === 'Escape' && dismissible) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    const elements = focusableElements(active);
    const first = elements[0];
    const last = elements.at(-1);
    const focused = document.activeElement;
    if (!first) {
      event.preventDefault();
      active.focus({ preventScroll: true });
    } else if (event.shiftKey && (focused === first || !elements.includes(focused))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (focused === last || !active.contains(focused))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  function onFocusIn(event) {
    if (active && !active.contains(event.target)) focusInside();
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('focusin', onFocusIn);
  return {
    get active() { return active; },
    open,
    close,
    dispose() {
      close({ restoreFocus: false, force: true });
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    }
  };
}
