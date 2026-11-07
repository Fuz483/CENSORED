import { useEffectEvent, useLayoutEffect, useRef } from "react";

const focusableSelector = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[tabindex]",
].join(",");

function getTabStops(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden",
  );
}

export function useDialog<T extends HTMLElement = HTMLElement>(
  onClose: () => void,
  { open = true, closeOnEscape = true }: { open?: boolean; closeOnEscape?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const dismiss = useEffectEvent((fromKeyboard: boolean) => {
    if (!fromKeyboard || closeOnEscape) onClose();
  });

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog || !dialog.getClientRects().length) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (getTabStops(dialog)[0] ?? dialog).focus({ preventScroll: true });

    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss(true);
        return;
      }
      if (event.key !== "Tab") return;

      const tabStops = getTabStops(dialog);
      const active = document.activeElement;
      const first = tabStops[0];
      const last = tabStops.at(-1);
      if (!first || active === dialog || !dialog.contains(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        ((event.shiftKey ? last : first) ?? dialog).focus();
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target) && dialog.getClientRects().length) {
        (getTabStops(dialog)[0] ?? dialog).focus({ preventScroll: true });
      }
    };
    const handleResize = () => {
      if (!dialog.getClientRects().length) dismiss(false);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("focusin", containFocus);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("focusin", containFocus);
      window.removeEventListener("resize", handleResize);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return ref;
}
