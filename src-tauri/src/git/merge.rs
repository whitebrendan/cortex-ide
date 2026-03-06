//! Git merge operations.

use std::path::Path;
use tracing::{info, warn};

use super::command::git_command_with_timeout;
use super::helpers::get_repo_root;
use super::types::MergeResult;

// ============================================================================
// Merge Commands
// ============================================================================

/// Merge a branch into the current branch
#[tauri::command]
pub async fn git_merge(
    path: String,
    branch: String,
    no_ff: Option<bool>,
    message: Option<String>,
) -> Result<MergeResult, String> {
    tokio::task::spawn_blocking(move || {
        let repo_root = get_repo_root(&path)?;
        let repo_root_path = Path::new(&repo_root);

        let mut args = vec!["merge".to_string()];

        if no_ff.unwrap_or(false) {
            args.push("--no-ff".to_string());
        }

        if let Some(ref msg) = message {
            args.push("-m".to_string());
            args.push(msg.clone());
        }

        args.push(branch.clone());

        let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

        info!("Merging branch '{}' into current branch", branch);

        let output = git_command_with_timeout(&args_refs, repo_root_path)?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success() {
            let fast_forward = stdout.contains("Fast-forward") || stderr.contains("Fast-forward");

            info!(
                "Merge completed successfully (fast_forward: {})",
                fast_forward
            );

            Ok(MergeResult {
                success: true,
                fast_forward,
                conflicts: vec![],
                message: Some(stdout.to_string()),
            })
        } else {
            // Check if there are conflicts
            let combined = format!("{}\n{}", stdout, stderr);

            if combined.contains("CONFLICT") || combined.contains("Automatic merge failed") {
                // Get list of conflicting files
                let conflicts = get_conflict_files(&repo_root)?;

                warn!("Merge resulted in conflicts: {:?}", conflicts);

                Ok(MergeResult {
                    success: false,
                    fast_forward: false,
                    conflicts,
                    message: Some(
                        "Merge conflicts detected. Please resolve conflicts and commit."
                            .to_string(),
                    ),
                })
            } else {
                Err(format!("Merge failed: {}", stderr))
            }
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Get list of files with merge conflicts
fn get_conflict_files(repo_root: &str) -> Result<Vec<String>, String> {
    let output = git_command_with_timeout(
        &["diff", "--name-only", "--diff-filter=U"],
        Path::new(repo_root),
    )?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let conflicts: Vec<String> = stdout
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();

    Ok(conflicts)
}

/// Abort an in-progress merge
#[tauri::command]
pub async fn git_merge_abort(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let repo_root = get_repo_root(&path)?;
        let repo_root_path = Path::new(&repo_root);

        let output = git_command_with_timeout(&["merge", "--abort"], repo_root_path)?;

        if output.status.success() {
            info!("Merge aborted successfully");
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Failed to abort merge: {}", stderr))
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Continue a merge after resolving conflicts
#[tauri::command]
pub async fn git_merge_continue(path: String) -> Result<MergeResult, String> {
    tokio::task::spawn_blocking(move || {
        let repo_root = get_repo_root(&path)?;
        let repo_root_path = Path::new(&repo_root);

        // Check if there are still unresolved conflicts
        let conflicts = get_conflict_files(&repo_root)?;
        if !conflicts.is_empty() {
            return Ok(MergeResult {
                success: false,
                fast_forward: false,
                conflicts,
                message: Some("There are still unresolved conflicts".to_string()),
            });
        }

        // Continue merge by committing
        let output = git_command_with_timeout(&["commit", "--no-edit"], repo_root_path)?;

        if output.status.success() {
            info!("Merge continued and committed successfully");
            Ok(MergeResult {
                success: true,
                fast_forward: false,
                conflicts: vec![],
                message: Some("Merge completed".to_string()),
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Failed to continue merge: {}", stderr))
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use crate::git::merge_editor::git_resolve_conflict;
    use git2::build::CheckoutBuilder;

    fn block_on<T>(future: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(future)
    }

    fn create_repo_with_file() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();

        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "base\n").unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(Path::new("test.txt")).unwrap();
        index.write().unwrap();

        let sig = git2::Signature::now("Test User", "test@example.com").unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
            .unwrap();

        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        dir
    }

    fn checkout_branch(repo: &git2::Repository, branch: &str) {
        let reference = format!("refs/heads/{branch}");
        repo.set_head(&reference).unwrap();

        let object = repo.revparse_single(&reference).unwrap();
        repo.checkout_tree(&object, Some(CheckoutBuilder::new().force()))
            .unwrap();
    }

    fn commit_file(repo: &git2::Repository, path: &Path, contents: &str, message: &str) {
        std::fs::write(path, contents).unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(Path::new("test.txt")).unwrap();
        index.write().unwrap();

        let sig = git2::Signature::now("Test User", "test@example.com").unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();

        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
            .unwrap();
    }

    fn create_repo_with_merge_conflict() -> tempfile::TempDir {
        let dir = create_repo_with_file();
        let repo = git2::Repository::open(dir.path()).unwrap();
        let base_branch = repo.head().unwrap().shorthand().unwrap().to_string();
        let base_commit = repo.head().unwrap().peel_to_commit().unwrap();

        repo.branch("feature", &base_commit, false).unwrap();

        checkout_branch(&repo, "feature");
        commit_file(
            &repo,
            &dir.path().join("test.txt"),
            "feature change\n",
            "Feature change",
        );

        checkout_branch(&repo, &base_branch);
        commit_file(
            &repo,
            &dir.path().join("test.txt"),
            "main change\n",
            "Main change",
        );

        let merge_output = git_command_with_timeout(&["merge", "feature"], dir.path()).unwrap();
        assert!(
            !merge_output.status.success(),
            "expected merge to conflict, got stdout={} stderr={}",
            String::from_utf8_lossy(&merge_output.stdout),
            String::from_utf8_lossy(&merge_output.stderr)
        );

        dir
    }

    #[test]
    fn git_merge_continue_succeeds_after_resolved_file_is_staged_through_contract() {
        let dir = create_repo_with_merge_conflict();

        block_on(git_resolve_conflict(
            dir.path().to_string_lossy().to_string(),
            "test.txt".to_string(),
            "resolved\ncontent\n".to_string(),
        ))
        .expect("expected conflict resolution to succeed");

        let result = block_on(git_merge_continue(dir.path().to_string_lossy().to_string()))
            .expect("expected merge continue to return a result");

        assert!(
            result.success,
            "expected merge continue to succeed: {result:?}"
        );
        assert!(result.conflicts.is_empty());

        let unresolved =
            git_command_with_timeout(&["diff", "--name-only", "--diff-filter=U"], dir.path())
                .unwrap();
        assert!(
            String::from_utf8_lossy(&unresolved.stdout)
                .trim()
                .is_empty(),
            "expected no unmerged entries after merge continue"
        );
    }

    #[test]
    fn git_merge_continue_reports_unmerged_entries_when_file_was_only_saved() {
        let dir = create_repo_with_merge_conflict();
        std::fs::write(dir.path().join("test.txt"), "resolved\ncontent\n").unwrap();

        let result = block_on(git_merge_continue(dir.path().to_string_lossy().to_string()))
            .expect("expected merge continue to return unresolved conflicts");

        assert!(!result.success);
        assert_eq!(result.conflicts, vec!["test.txt".to_string()]);
        assert_eq!(
            result.message.as_deref(),
            Some("There are still unresolved conflicts")
        );
    }
}
