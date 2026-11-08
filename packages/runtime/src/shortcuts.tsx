import { resolveShortcut, type KeyEventLike, type KeyTargetLike, type ShortcutAction } from '@swatchbook/core';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useRoute } from './route';

export type HandledShortcut = Exclude<ShortcutAction, { type: 'go-screen' | 'close' }>;
export type ShortcutType = HandledShortcut['type'];
/** Returning false declines the action. A void return means it was handled. */
export type ShortcutHandler = (action: HandledShortcut) => boolean | void;
export type ShortcutHandlers = Partial<Record<ShortcutType, ShortcutHandler>>;
export type RowFocusPredicate = (event: KeyboardEvent) => boolean;

export function topShortcutHandler(stack: readonly ShortcutHandlers[], action: ShortcutType): ShortcutHandler | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    const handler = stack[i]?.[action];
    if (handler) return handler;
  }
  return undefined;
}
function targetLike(target: EventTarget | null, descendants = true): KeyTargetLike | null {
  if (!(target instanceof Element)) return null;
  const element = target as HTMLElement & { type?: string };
  return {
    tagName: element.tagName, type: element.type, role: element.getAttribute('role') ?? undefined,
    ariaModal: element.getAttribute('aria-modal'),
    open: element.tagName === 'DIALOG' && element.hasAttribute('open'),
    hidden: element.hasAttribute('hidden'), ariaHidden: element.getAttribute('aria-hidden'),
    inert: element.hasAttribute('inert'), style: { display: element.style?.display },
    parentElement: targetLike(element.parentElement ?? (element.getRootNode() as ShadowRoot).host ?? null, false),
    ...(descendants ? {
      querySelector: (selector: string) => targetLike(element.querySelector(selector), false),
      querySelectorAll: (selector: string) => Array.from(element.querySelectorAll(selector), node => targetLike(node, false)!),
    } : {}),
    isContentEditable: element.isContentEditable, contentEditable: element.getAttribute('contenteditable') ?? undefined,
  };
}
/** Adapt native methods explicitly so their receiver remains the KeyboardEvent. */
export function keyboardEventLike(event: KeyboardEvent): KeyEventLike {
  return {
    key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey,
    repeat: event.repeat, isComposing: event.isComposing, keyCode: event.keyCode, defaultPrevented: event.defaultPrevented,
    target: targetLike(event.target), composedPath: () => event.composedPath().map(node => targetLike(node, false)).filter(target => target !== null),
    getModifierState: key => event.getModifierState(key),
  };
}

type Registration = { current: ShortcutHandlers; order: number };
let sequence = 0;
const ShortcutContext = createContext<Registration[] | null>(null);
export function ShortcutsProvider({ children, rowFocused, modalOpen }: { children: ReactNode; rowFocused?: RowFocusPredicate; modalOpen?: () => boolean }) {
  const stack = useRef<Registration[]>([]).current;
  const { go } = useRoute();
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') return;
      const action = resolveShortcut(keyboardEventLike(event), { rowFocused: rowFocused?.(event), modalOpen: modalOpen?.() });
      if (!action || action.type === 'close') return;
      if (action.type === 'go-screen') { go(action.screen); event.preventDefault(); return; }
      for (let i = stack.length - 1; i >= 0; i--) {
        const handler: ShortcutHandler | undefined = stack[i]!.current[action.type];
        if (handler && handler(action) !== false) { event.preventDefault(); return; }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [go, rowFocused, modalOpen, stack]);
  return <ShortcutContext value={stack}>{children}</ShortcutContext>;
}

export function useShortcutHandlers(handlers: ShortcutHandlers): void {
  const stack = useContext(ShortcutContext);
  if (!stack) throw new Error('useShortcutHandlers requires RuntimeProvider');
  // Render order is parent before child; effect order must not decide priority.
  const [order] = useState(() => ++sequence);
  const registration = useRef<Registration>({ current: handlers, order });
  useLayoutEffect(() => { registration.current.current = handlers; });
  useEffect(() => {
    const entry = registration.current;
    stack.push(entry);
    stack.sort((a, b) => a.order - b.order);
    return () => { const index = stack.indexOf(entry); if (index !== -1) stack.splice(index, 1); };
  }, [stack]);
}
export function useShortcut(action: ShortcutType, handler: ShortcutHandler): void {
  useShortcutHandlers({ [action]: handler });
}
