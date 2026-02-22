//! SSH connection wrapper and utilities.

#[cfg(feature = "remote-ssh")]
use ssh2::{Session, Sftp};
#[cfg(feature = "remote-ssh")]
use std::io::Read;
use std::path::PathBuf;

use super::error::RemoteError;
#[cfg(feature = "remote-ssh")]
use super::types::{CommandResult, ConnectionProfile};

#[cfg(feature = "remote-ssh")]
pub struct SshConnection {
    pub session: Session,
    pub profile: ConnectionProfile,
    pub home_directory: String,
    pub platform: String,
}

#[cfg(feature = "remote-ssh")]
impl SshConnection {
    pub fn new(
        session: Session,
        profile: ConnectionProfile,
        home_directory: String,
        platform: String,
    ) -> Self {
        Self {
            session,
            profile,
            home_directory,
            platform,
        }
    }

    pub fn sftp(&self) -> Result<Sftp, RemoteError> {
        self.session.sftp().map_err(RemoteError::SshError)
    }

    pub fn exec_command(&self, command: &str) -> Result<CommandResult, RemoteError> {
        let mut channel = self
            .session
            .channel_session()
            .map_err(|e| RemoteError::ChannelError(format!("Failed to open channel: {}", e)))?;
        channel.exec(command).map_err(|e| {
            let _ = channel.close();
            RemoteError::ChannelError(format!("Failed to exec command: {}", e))
        })?;

        let mut stdout = String::new();
        let mut stderr = String::new();

        channel.read_to_string(&mut stdout)?;
        channel.stderr().read_to_string(&mut stderr)?;

        channel
            .wait_close()
            .map_err(|e| RemoteError::ChannelError(format!("Channel wait_close failed: {}", e)))?;
        let exit_code = channel
            .exit_status()
            .map_err(|e| RemoteError::ChannelError(format!("Failed to get exit status: {}", e)))?;

        Ok(CommandResult {
            stdout,
            stderr,
            exit_code,
        })
    }

    pub fn is_alive(&self) -> bool {
        self.session.authenticated()
            && self
                .session
                .channel_session()
                .map(|mut ch| {
                    let _ = ch.close();
                    true
                })
                .unwrap_or(false)
    }

    pub fn close(&self) {
        let _ = self.session.disconnect(None, "closing connection", None);
    }
}

#[cfg(feature = "remote-ssh")]
impl Drop for SshConnection {
    fn drop(&mut self) {
        let _ = self.session.disconnect(None, "closing connection", None);
    }
}

/// Set restrictive file permissions (0600 on Unix)
pub fn set_file_permissions(path: &PathBuf) -> Result<(), RemoteError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(path, perms).map_err(|e| {
            RemoteError::IoError(std::io::Error::new(std::io::ErrorKind::PermissionDenied, e))
        })?;
    }

    #[cfg(not(unix))]
    {
        let _ = path; // Suppress unused warning on Windows
    }

    Ok(())
}
