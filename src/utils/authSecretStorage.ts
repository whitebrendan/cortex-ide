import { invoke } from "@tauri-apps/api/core";
import { safeGetItem, safeRemoveItem } from "./safeStorage";

interface SecureJsonOptions<T> {
  keyName: string;
  legacyKey?: string;
  loggerScope: string;
  validate?: (value: unknown) => value is T;
}

interface SaveSecureJsonOptions<T> extends SecureJsonOptions<T> {
  value: T;
}

function logError(scope: string, message: string, error: unknown): void {
  console.warn(`[${scope}] ${message}`, error);
}

function parseStoredJson<T>(
  raw: string,
  { loggerScope, validate }: SecureJsonOptions<T>
): T | null {
  try {
    const parsed = JSON.parse(raw);
    if (validate && !validate(parsed)) {
      console.warn(`[${loggerScope}] Ignoring invalid secure auth payload`);
      return null;
    }
    return parsed as T;
  } catch (error) {
    logError(loggerScope, "Failed to parse secure auth payload", error);
    return null;
  }
}

async function setSecureSecret(
  keyName: string,
  value: string,
  loggerScope: string
): Promise<boolean> {
  try {
    await invoke("settings_set_auth_secret", { keyName, value });
    return true;
  } catch (error) {
    logError(loggerScope, `Failed to store secure auth secret for ${keyName}`, error);
    return false;
  }
}

export async function loadSecureJson<T>(options: SecureJsonOptions<T>): Promise<T | null> {
  const { keyName, legacyKey, loggerScope } = options;

  try {
    const stored = await invoke<string | null>("settings_get_auth_secret", { keyName });
    if (typeof stored === "string") {
      const parsed = parseStoredJson(stored, options);
      if (parsed === null) {
        await deleteSecureSecret({ keyName, loggerScope });
      }
      if (legacyKey) {
        safeRemoveItem(legacyKey);
      }
      return parsed;
    }
  } catch (error) {
    logError(loggerScope, `Failed to load secure auth secret for ${keyName}`, error);
  }

  if (!legacyKey) {
    return null;
  }

  const legacyValue = safeGetItem(legacyKey);
  if (!legacyValue) {
    return null;
  }

  const parsed = parseStoredJson(legacyValue, options);
  safeRemoveItem(legacyKey);

  if (parsed !== null) {
    await setSecureSecret(keyName, JSON.stringify(parsed), loggerScope);
  }

  return parsed;
}

export async function saveSecureJson<T>(options: SaveSecureJsonOptions<T>): Promise<void> {
  const { keyName, legacyKey, loggerScope, value } = options;

  if (legacyKey) {
    safeRemoveItem(legacyKey);
  }

  const serialized = JSON.stringify(value);
  await setSecureSecret(keyName, serialized, loggerScope);
}

export async function deleteSecureSecret(
  options: Pick<SecureJsonOptions<unknown>, "keyName" | "legacyKey" | "loggerScope">
): Promise<void> {
  const { keyName, legacyKey, loggerScope } = options;

  if (legacyKey) {
    safeRemoveItem(legacyKey);
  }

  try {
    await invoke("settings_delete_auth_secret", { keyName });
  } catch (error) {
    logError(loggerScope, `Failed to delete secure auth secret for ${keyName}`, error);
  }
}
