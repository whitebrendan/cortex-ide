import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_TIMEOUT_MS = 30_000;

export interface SafeInvokeOptions<F> {
  timeout?: number;
  fallback?: F;
  silent?: boolean;
}

export class InvokeTimeoutError extends Error {
  readonly command: string;
  readonly timeoutMs: number;

  constructor(command: string, timeoutMs: number) {
    super(`IPC command "${command}" timed out after ${timeoutMs}ms`);
    this.name = "InvokeTimeoutError";
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}

export async function safeInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
  options?: SafeInvokeOptions<T>,
): Promise<T> {
  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  const invokePromise = invoke<T>(cmd, args);

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    const id = setTimeout(() => {
      reject(new InvokeTimeoutError(cmd, timeoutMs));
    }, timeoutMs);
    invokePromise.then(
      () => clearTimeout(id),
      () => clearTimeout(id),
    );
  });

  try {
    return await Promise.race([invokePromise, timeoutPromise]);
  } catch (error) {
    if (!options?.silent) {
      console.error(`[ipc] ${cmd} failed:`, error);
    }
    if (options && "fallback" in options) {
      return options.fallback as T;
    }
    throw error;
  }
}
