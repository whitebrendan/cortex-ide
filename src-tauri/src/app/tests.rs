use std::sync::Arc;

fn assert_send_sync<T: Send + Sync>() {}

#[test]
fn state_types_are_send_sync() {
    assert_send_sync::<super::ServerState>();
    assert_send_sync::<super::LogState>();
    assert_send_sync::<super::PortState>();
    assert_send_sync::<super::REPLState>();
    assert_send_sync::<crate::ai::AIState>();
    assert_send_sync::<crate::ai::AIToolsState>();
    assert_send_sync::<crate::ai::AgentState>();
    assert_send_sync::<crate::ai::AgentStoreState>();
    assert_send_sync::<crate::lsp::LspState>();
    assert_send_sync::<crate::dap::DebuggerState>();
    assert_send_sync::<crate::LazyState<crate::dap::DebuggerState>>();
    assert_send_sync::<crate::terminal::TerminalState>();
    assert_send_sync::<crate::settings::SettingsState>();
    assert_send_sync::<crate::collab::CollabState>();
    assert_send_sync::<crate::LazyState<crate::collab::CollabState>>();
    assert_send_sync::<crate::context_server::ContextServerState>();
    assert_send_sync::<crate::LazyState<crate::context_server::ContextServerState>>();
    assert_send_sync::<crate::activity::ActivityState>();
    assert_send_sync::<crate::LazyState<crate::activity::ActivityState>>();
    assert_send_sync::<crate::timeline::TimelineState>();
    assert_send_sync::<crate::LazyState<crate::timeline::TimelineState>>();
    assert_send_sync::<crate::toolchain::ToolchainState>();
    assert_send_sync::<crate::LazyState<crate::toolchain::ToolchainState>>();
    assert_send_sync::<crate::factory::FactoryState>();
    assert_send_sync::<crate::LazyState<crate::factory::FactoryState>>();
    assert_send_sync::<crate::extensions::ExtensionsState>();
    assert_send_sync::<crate::LazyState<crate::extensions::ExtensionsState>>();
    assert_send_sync::<crate::extensions::activation::ActivationState>();
    assert_send_sync::<crate::LazyState<crate::extensions::activation::ActivationState>>();
    assert_send_sync::<crate::extensions::registry::RegistryState>();
    assert_send_sync::<crate::LazyState<crate::extensions::registry::RegistryState>>();
    assert_send_sync::<crate::sandbox::commands::SandboxState>();
    assert_send_sync::<crate::LazyState<crate::sandbox::commands::SandboxState>>();
    assert_send_sync::<crate::testing::TestWatcherState>();
    assert_send_sync::<crate::LazyState<crate::testing::TestWatcherState>>();
    #[cfg(feature = "remote-ssh")]
    assert_send_sync::<crate::ssh_terminal::SSHTerminalState>();
    assert_send_sync::<crate::wsl::WSLState>();
}

#[test]
fn state_initialization_does_not_panic() {
fn state_initialization_does_not_panic() {
    use std::collections::VecDeque;
    use std::sync::Mutex;

    let _ = super::ServerState(Arc::new(Mutex::new(None)));
    let _ = super::LogState(Arc::new(Mutex::new(VecDeque::new())));
    let _ = super::PortState(Arc::new(Mutex::new(0)));
    let _ = super::REPLState(Arc::new(Mutex::new(None)));
    let _ = crate::ai::AIState::new();
    let _ = crate::ai::AIToolsState::new();
    let _ = crate::ai::AgentState::new();
    let _ = crate::ai::AgentStoreState::new();
    let _ = crate::lsp::LspState::new();
    let _ = crate::dap::DebuggerState::new();
    let _ = crate::terminal::TerminalState::new();
    let _ = crate::settings::SettingsState::new();
    let _ = crate::collab::CollabState::new();
    let _ = crate::context_server::ContextServerState::new();
    let _ = crate::activity::ActivityState::new();
    let _ = crate::timeline::TimelineState::new();
    let _ = crate::toolchain::ToolchainState::new();
    let _ = crate::factory::FactoryState::new();
    let _ = crate::extensions::activation::ActivationState::new();
    let _ = crate::extensions::registry::RegistryState::new();
    let _ = crate::extensions::activation::ActivationState::new();
    let _ = crate::extensions::registry::RegistryState::new();
    let _ = crate::testing::TestWatcherState::new();
    #[cfg(feature = "remote-ssh")]
    let _ = crate::ssh_terminal::SSHTerminalState::new();
    let _ = crate::wsl::WSLState::new();
}

#[test]
fn open_in_browser_validation_allows_http_https_and_mailto() {
    assert!(super::validate_open_in_browser_target("https://example.com/path").is_ok());
    assert!(super::validate_open_in_browser_target("http://127.0.0.1:3000").is_ok());
    assert!(super::validate_open_in_browser_target("mailto:support@example.com").is_ok());
}

#[test]
fn open_in_browser_validation_rejects_unsafe_schemes() {
    assert!(super::validate_open_in_browser_target("file:///tmp/test.txt").is_err());
    assert!(super::validate_open_in_browser_target("javascript:alert(1)").is_err());
    assert!(super::validate_open_in_browser_target("cortex://open").is_err());
}
    let _ = crate::wsl::WSLState::new();
}

#[test]
fn lazy_state_deferred_init() {
    let state = crate::LazyState::new(|| 42);
    assert!(!state.is_initialized());
    assert_eq!(*state.get(), 42);
    assert!(state.is_initialized());
}

#[test]
fn lazy_state_clone() {
    let state = crate::LazyState::new(|| String::from("hello"));
    let _ = state.get();
    let cloned = state.clone();
    assert!(cloned.is_initialized());
    assert_eq!(cloned.get(), "hello");
}