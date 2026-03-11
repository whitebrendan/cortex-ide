//! Secure API key storage using OS keyring
//!
//! This module provides secure storage for sensitive data like API keys
//! using the operating system's native keyring (Keychain on macOS,
//! Credential Manager on Windows, Secret Service on Linux).

use secrecy::SecretString;

use super::KEYRING_SERVICE;

/// Secure API key storage manager
pub struct SecureApiKeyStore;

impl SecureApiKeyStore {
    /// Get keyring entry for a secure secret
    fn get_entry(key_name: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYRING_SERVICE, key_name)
            .map_err(|e| format!("Failed to access keyring: {e}"))
    }

    /// Store a secret securely in the keyring
    pub fn set_secret(key_name: &str, secret: &str) -> Result<(), String> {
        let entry = Self::get_entry(key_name)?;
        entry
            .set_password(secret)
            .map_err(|e| format!("Failed to store secret: {e}"))
    }

    /// Retrieve a secret from the keyring
    pub fn get_secret(key_name: &str) -> Result<Option<SecretString>, String> {
        let entry = Self::get_entry(key_name)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(SecretString::from(secret))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Failed to retrieve secret: {e}")),
        }
    }

    /// Delete a secret from the keyring
    pub fn delete_secret(key_name: &str) -> Result<bool, String> {
        let entry = Self::get_entry(key_name)?;
        match entry.delete_credential() {
            Ok(()) => Ok(true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(e) => Err(format!("Failed to delete secret: {e}")),
        }
    }

    /// Check if a secret exists
    pub fn has_secret(key_name: &str) -> Result<bool, String> {
        let entry = Self::get_entry(key_name)?;
        match entry.get_password() {
            Ok(_) => Ok(true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(e) => Err(format!("Failed to check secret: {e}")),
        }
    }

    /// Store an API key securely in the keyring
    pub fn set_api_key(key_name: &str, api_key: &str) -> Result<(), String> {
        Self::set_secret(key_name, api_key)
    }

    /// Retrieve an API key from the keyring
    pub fn get_api_key(key_name: &str) -> Result<Option<SecretString>, String> {
        Self::get_secret(key_name)
    }

    /// Delete an API key from the keyring
    pub fn delete_api_key(key_name: &str) -> Result<bool, String> {
        Self::delete_secret(key_name)
    }

    /// Check if an API key exists
    pub fn has_api_key(key_name: &str) -> Result<bool, String> {
        Self::has_secret(key_name)
    }
}

/// Get API key for internal use (returns actual value as SecretString)
pub fn get_api_key_internal(key_name: &str) -> Option<SecretString> {
    SecureApiKeyStore::get_api_key(key_name).ok().flatten()
}
