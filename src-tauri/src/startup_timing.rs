//! Startup timing instrumentation
//!
//! Provides a lightweight `StartupTimer` for tracking and logging elapsed time
//! at each phase of the application startup sequence.

use std::time::Instant;
use tracing::info;

/// Tracks elapsed time from application launch and logs startup phase durations.
pub struct StartupTimer {
    start: Instant,
}

impl StartupTimer {
    pub fn new() -> Self {
        Self {
            start: Instant::now(),
        }
    }

    /// Returns milliseconds elapsed since the timer was created.
    pub fn elapsed_ms(&self) -> f64 {
        self.start.elapsed().as_secs_f64() * 1000.0
    }

    /// Returns the underlying `Instant` for use with Tauri setup callbacks.
    pub fn instant(&self) -> Instant {
        self.start
    }

    /// Log a named startup phase with the elapsed time.
    pub fn log_phase(&self, phase: &str) {
        let ms = self.elapsed_ms();
        info!(
            target: "startup",
            phase = phase,
            elapsed_ms = format_args!("{ms:.1}"),
            "⏱ {phase} @ {ms:.1}ms"
        );
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn timer_starts_at_zero() {
        let timer = StartupTimer::new();
        // Should be very close to 0 right after creation
        assert!(timer.elapsed_ms() < 50.0);
    }

    #[test]
    fn timer_elapsed_increases() {
        let timer = StartupTimer::new();
        std::thread::sleep(std::time::Duration::from_millis(10));
        assert!(timer.elapsed_ms() >= 5.0);
    }

    #[test]
    fn log_phase_does_not_panic() {
        let timer = StartupTimer::new();
        timer.log_phase("test_phase");
    }
}
