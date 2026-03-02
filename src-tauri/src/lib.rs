#![allow(dead_code)]
//! Cortex Desktop - Tauri application backend
//!
//! This module provides the Rust backend for the Cortex Desktop application.
//! Command registration is split into feature-grouped modules under `app/`.

mod acp;
mod action_log;
mod activity;
mod ai;
mod app;
mod auto_update;
mod batch;
mod batch_ipc;
mod browser;
mod collab;
mod commands;
mod context_server;
mod cortex_engine;
mod cortex_protocol;
mod cortex_storage;
mod dap;
mod deep_link;
mod diagnostics;
mod editor;
pub mod error;
mod extensions;
mod factory;
mod formatter;
mod fs;
mod fs_commands;
mod git;
mod i18n;
mod keybindings;
mod language_selector;
mod lsp;
mod mcp;
mod models;
mod notebook;
mod process;
mod process_utils;
mod project;
mod prompt_store;
mod remote;
mod repl;
mod rules_library;
mod sandbox;
mod search;
mod settings;
mod settings_sync;
mod startup_timing;
#[cfg(feature = "remote-ssh")]
mod ssh_terminal;
mod system_specs;
mod tasks;
mod terminal;
mod testing;
mod themes;
mod timeline;
mod toolchain;
mod window;
mod workspace;
mod workspace_settings;
mod wsl;

use std::sync::{Arc, OnceLock};

use tracing::{error, info};

pub use error::CortexError;

/// Lazy initialization wrapper for heavy state managers.
/// Uses `OnceLock` to defer initialization until first access.
pub struct LazyState<T> {
    inner: OnceLock<T>,
    init: fn() -> T,
}

impl<T> LazyState<T> {
    pub const fn new(init: fn() -> T) -> Self {
        Self {
            inner: OnceLock::new(),
            init,
        }
    }

    pub fn get(&self) -> &T {
        self.inner.get_or_init(self.init)
    }

    pub fn is_initialized(&self) -> bool {
        self.inner.get().is_some()
    }
}

impl<T: Clone> Clone for LazyState<T> {
    fn clone(&self) -> Self {
        let new_state = Self::new(self.init);
        if let Some(value) = self.inner.get() {
            let _ = new_state.inner.set(value.clone());
        }
        new_state
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::{Manager, WindowEvent};

    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .try_init();

    let _startup_span = tracing::info_span!("startup").entered();
    let startup_timer = startup_timing::StartupTimer::new();
    startup_timer.log_phase("process_start");
    info!("Starting Cortex Desktop with optimized startup...");
    let startup_time = startup_timer.instant();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(debug_assertions)]
    let builder = builder.plugin(
        tauri_plugin_mcp_bridge::Builder::new()
            .bind_address("127.0.0.1")
            .build(),
    );

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init());

    startup_timer.log_phase("plugins_registered");

    let remote_manager = Arc::new(remote::RemoteManager::new());

    let builder = app::register_state(builder, remote_manager);
    startup_timer.log_phase("state_registered");

    startup_timer.log_phase("invoke_handler_building");
    let app = match builder
        .invoke_handler(app::cortex_commands!())
        .setup(move |tauri_app| app::setup_app(tauri_app, startup_time))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let label = window.label();
                let app_handle = window.app_handle();
                crate::window::remove_window_session(app_handle, label);
            }
        })
        .build(tauri::generate_context!())
    {
        Ok(app) => {
            startup_timer.log_phase("app_built");
            app
        }
        Err(e) => {
            error!("Failed to build Tauri application: {}", e);
            std::process::exit(1);
        }
    };

    startup_timer.log_phase("entering_run_loop");
    app.run(|app, event| {
        app::handle_run_event(app, event);
    });
}
