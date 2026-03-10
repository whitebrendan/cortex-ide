import type { AsyncCleanupRegistrar } from "@/utils/asyncCleanup";
import type { DeepLinkAction } from "@/utils/deepLink";

export type ManagedCleanup = (() => void) | void | null | undefined;

export interface DeferredTaskOptions {
  timeout?: number;
  fallbackDelay?: number;
}

export interface ExtensionPaletteCommand {
  id: string;
  label: string;
  category: string;
}

export interface ExtensionNotificationPayload {
  type?: "info" | "error";
  message?: string;
}

interface ExtensionContributionSource {
  manifest?: {
    name?: string;
    contributes?: {
      commands?: Array<{
        command: string;
        title: string;
        category?: string;
      }>;
    };
  };
}

export const APP_DEEP_LINK_EVENT = "app:deep-link";

interface IdleCapableWindow extends Window {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
}

const pendingDeepLinkActions: DeepLinkAction[] = [];
let deepLinkConsumerCount = 0;

export function registerAsyncCleanup(
  registrar: AsyncCleanupRegistrar,
  task: Promise<ManagedCleanup>,
  onError?: (error: unknown) => void,
): void {
  void task
    .then((cleanup) => {
      registrar.add(cleanup);
    })
    .catch((error) => {
      onError?.(error);
    });
}

export function scheduleDeferredTask(
  callback: () => void,
  options: DeferredTaskOptions = {},
): () => void {
  const { timeout = 2000, fallbackDelay = 500 } = options;

  if (typeof window === "undefined") {
    callback();
    return () => {};
  }

  const idleWindow = window as IdleCapableWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    const idleHandle = idleWindow.requestIdleCallback(() => {
      callback();
    }, { timeout });

    return () => {
      idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }

  const timeoutHandle = window.setTimeout(callback, fallbackDelay);
  return () => {
    window.clearTimeout(timeoutHandle);
  };
}

export function buildExtensionPaletteCommands(rawExtensions: unknown): ExtensionPaletteCommand[] {
  const currentExtensions = Array.isArray(rawExtensions)
    ? (rawExtensions as ExtensionContributionSource[])
    : [];

  const commands = new Map<string, ExtensionPaletteCommand>();

  for (const extension of currentExtensions) {
    const contributions = extension.manifest?.contributes?.commands ?? [];
    const extensionName = extension.manifest?.name || "Unknown";

    for (const contribution of contributions) {
      commands.set(contribution.command, {
        id: contribution.command,
        label: contribution.title,
        category: contribution.category || extensionName,
      });
    }
  }

  return [...commands.values()];
}

export function dispatchDeepLinkAction(action: DeepLinkAction): void {
  if (deepLinkConsumerCount === 0) {
    pendingDeepLinkActions.push(action);
    return;
  }

  window.dispatchEvent(
    new CustomEvent<DeepLinkAction>(APP_DEEP_LINK_EVENT, {
      detail: action,
    }),
  );
}

export function registerDeepLinkConsumer(
  handler: (action: DeepLinkAction) => void,
): () => void {
  deepLinkConsumerCount += 1;

  const eventHandler: EventListener = (event) => {
    handler((event as CustomEvent<DeepLinkAction>).detail);
  };

  window.addEventListener(APP_DEEP_LINK_EVENT, eventHandler);

  const queuedActions = pendingDeepLinkActions.splice(0, pendingDeepLinkActions.length);
  queuedActions.forEach((action) => {
    handler(action);
  });

  return () => {
    window.removeEventListener(APP_DEEP_LINK_EVENT, eventHandler);
    deepLinkConsumerCount = Math.max(0, deepLinkConsumerCount - 1);
  };
}

export function resetAppStartupState(): void {
  pendingDeepLinkActions.length = 0;
  deepLinkConsumerCount = 0;
}

export function getPendingDeepLinkActionCount(): number {
  return pendingDeepLinkActions.length;
}
