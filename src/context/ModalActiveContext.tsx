/**
 * ModalActiveContext - Tracks whether any modal dialog is currently open
 *
 * Uses a counter to support multiple simultaneous modals.
 * Keyboard shortcut handlers check `isModalActive()` to suppress
 * shortcuts while a modal is visible (except Escape to close).
 */

import { createContext, useContext, createSignal, ParentProps, JSX } from "solid-js";

interface ModalActiveContextValue {
  isModalActive: () => boolean;
  registerModal: () => void;
  unregisterModal: () => void;
}

const ModalActiveContext = createContext<ModalActiveContextValue>();

export function ModalActiveProvider(props: ParentProps): JSX.Element {
  const [modalCount, setModalCount] = createSignal(0);

  const isModalActive = () => modalCount() > 0;

  const registerModal = () => {
    setModalCount((c) => c + 1);
  };

  const unregisterModal = () => {
    setModalCount((c) => Math.max(0, c - 1));
  };

  return (
    <ModalActiveContext.Provider value={{ isModalActive, registerModal, unregisterModal }}>
      {props.children}
    </ModalActiveContext.Provider>
  );
}

export function useModalActive(): ModalActiveContextValue {
  const context = useContext(ModalActiveContext);
  if (!context) {
    throw new Error("useModalActive must be used within ModalActiveProvider");
  }
  return context;
}

/**
 * Safe accessor that returns a no-op implementation when called outside
 * the provider tree (e.g. in tests or lazy-loaded components that mount
 * before the provider). Prefer `useModalActive()` when inside the tree.
 */
export function useModalActiveOptional(): ModalActiveContextValue {
  const context = useContext(ModalActiveContext);
  if (!context) {
    return {
      isModalActive: () => false,
      registerModal: () => {},
      unregisterModal: () => {},
    };
  }
  return context;
}
