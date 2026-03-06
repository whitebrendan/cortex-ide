//! Git merge editor operations for conflict resolution.

use std::path::Path;
use tracing::{info, warn};

use super::command::git_command_with_timeout;
use super::helpers::{find_repo, get_repo_root};
use super::types::{MergeConflictFile, MergeConflictRegion, ThreeWayDiffResult};

// ============================================================================
// Conflict Marker Parsing
// ============================================================================

const OURS_MARKER: &str = "<<<<<<<";
const BASE_MARKER: &str = "|||||||";
const SEPARATOR_MARKER: &str = "=======";
const THEIRS_MARKER: &str = ">>>>>>>";

#[derive(Debug, PartialEq)]
enum ConflictParseState {
    Outside,
    InOurs,
    InBase,
    InTheirs,
}

struct ConflictParseResult {
    regions: Vec<MergeConflictRegion>,
    has_base_content: bool,
    ours_label: String,
    theirs_label: String,
}

fn extract_label(line: &str, marker: &str) -> String {
    let rest = line[marker.len()..].trim();
    rest.to_string()
}

fn parse_conflict_markers(content: &str) -> ConflictParseResult {
    let lines: Vec<&str> = content.lines().collect();
    let mut regions = Vec::new();
    let mut state = ConflictParseState::Outside;
    let mut has_base_content = false;

    let mut conflict_index: u32 = 0;
    let mut start_line: u32 = 0;
    let mut separator_line: u32 = 0;
    let mut base_marker_line: Option<u32> = None;
    let mut ours_content: Vec<String> = Vec::new();
    let mut theirs_content: Vec<String> = Vec::new();
    let mut base_content: Option<Vec<String>> = None;
    let mut ours_label = String::new();
    #[allow(unused_assignments)]
    let mut theirs_label = String::new();
    let mut first_ours_label = String::new();
    let mut first_theirs_label = String::new();

    for (i, line) in lines.iter().enumerate() {
        let line_no = i as u32;

        match state {
            ConflictParseState::Outside => {
                if line.starts_with(OURS_MARKER) {
                    state = ConflictParseState::InOurs;
                    start_line = line_no;
                    ours_label = extract_label(line, OURS_MARKER);
                    ours_content = Vec::new();
                    theirs_content = Vec::new();
                    base_content = None;
                    base_marker_line = None;
                    separator_line = 0;
                }
            }
            ConflictParseState::InOurs => {
                if line.starts_with(BASE_MARKER) {
                    state = ConflictParseState::InBase;
                    base_marker_line = Some(line_no);
                    base_content = Some(Vec::new());
                    has_base_content = true;
                } else if line.starts_with(SEPARATOR_MARKER) {
                    state = ConflictParseState::InTheirs;
                    separator_line = line_no;
                } else {
                    ours_content.push(line.to_string());
                }
            }
            ConflictParseState::InBase => {
                if line.starts_with(SEPARATOR_MARKER) {
                    state = ConflictParseState::InTheirs;
                    separator_line = line_no;
                } else if let Some(ref mut base) = base_content {
                    base.push(line.to_string());
                }
            }
            ConflictParseState::InTheirs => {
                if line.starts_with(THEIRS_MARKER) {
                    theirs_label = extract_label(line, THEIRS_MARKER);

                    if first_ours_label.is_empty() {
                        first_ours_label = ours_label.clone();
                    }
                    if first_theirs_label.is_empty() {
                        first_theirs_label = theirs_label.clone();
                    }

                    regions.push(MergeConflictRegion {
                        id: format!("conflict-{}", conflict_index),
                        index: conflict_index,
                        start_line,
                        end_line: line_no,
                        separator_line,
                        base_marker_line,
                        ours_content: ours_content.clone(),
                        theirs_content: theirs_content.clone(),
                        base_content: base_content.clone(),
                        ours_label: ours_label.clone(),
                        theirs_label: theirs_label.clone(),
                    });

                    conflict_index += 1;
                    state = ConflictParseState::Outside;
                } else {
                    theirs_content.push(line.to_string());
                }
            }
        }
    }

    ConflictParseResult {
        regions,
        has_base_content,
        ours_label: first_ours_label,
        theirs_label: first_theirs_label,
    }
}

fn reconstruct_content(content: &str, side: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let mut result = Vec::new();
    let mut state = ConflictParseState::Outside;

    for line in &lines {
        match state {
            ConflictParseState::Outside => {
                if line.starts_with(OURS_MARKER) {
                    state = ConflictParseState::InOurs;
                } else {
                    result.push(*line);
                }
            }
            ConflictParseState::InOurs => {
                if line.starts_with(BASE_MARKER) {
                    state = ConflictParseState::InBase;
                } else if line.starts_with(SEPARATOR_MARKER) {
                    state = ConflictParseState::InTheirs;
                } else if side == "ours" {
                    result.push(*line);
                }
            }
            ConflictParseState::InBase => {
                if line.starts_with(SEPARATOR_MARKER) {
                    state = ConflictParseState::InTheirs;
                } else if side == "base" {
                    result.push(*line);
                }
            }
            ConflictParseState::InTheirs => {
                if line.starts_with(THEIRS_MARKER) {
                    state = ConflictParseState::Outside;
                } else if side == "theirs" {
                    result.push(*line);
                }
            }
        }
    }

    result.join("\n")
}

fn content_has_conflict_markers(content: &str) -> bool {
    !parse_conflict_markers(content).regions.is_empty()
}

// ============================================================================
// Merge Editor Commands
// ============================================================================

/// List conflicted files during a merge
#[tauri::command]
pub async fn git_get_merge_conflicts(path: String) -> Result<Vec<MergeConflictFile>, String> {
    tokio::task::spawn_blocking(move || {
        let repo_root = get_repo_root(&path)?;
        let repo_root_path = Path::new(&repo_root);

        let output =
            git_command_with_timeout(&["diff", "--name-only", "--diff-filter=U"], repo_root_path)?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to list conflicted files: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let conflict_paths: Vec<&str> = stdout.lines().filter(|l| !l.is_empty()).collect();

        info!("Found {} conflicted files", conflict_paths.len());

        let mut results = Vec::new();

        for file_path in conflict_paths {
            let full_path = repo_root_path.join(file_path);
            let content = match std::fs::read_to_string(&full_path) {
                Ok(c) => c,
                Err(e) => {
                    warn!("Failed to read conflicted file {}: {}", file_path, e);
                    continue;
                }
            };

            let parsed = parse_conflict_markers(&content);

            results.push(MergeConflictFile {
                path: file_path.to_string(),
                conflict_count: parsed.regions.len() as u32,
                has_base_content: parsed.has_base_content,
                ours_label: parsed.ours_label,
                theirs_label: parsed.theirs_label,
            });
        }

        Ok(results)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Get three-way diff data for a specific conflicted file
#[tauri::command]
pub async fn git_get_three_way_diff(
    path: String,
    file_path: String,
) -> Result<ThreeWayDiffResult, String> {
    tokio::task::spawn_blocking(move || {
        let repo_root = get_repo_root(&path)?;
        let repo_root_path = Path::new(&repo_root);

        let full_path = repo_root_path.join(&file_path);
        let raw_content = std::fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read file {}: {}", file_path, e))?;

        let parsed = parse_conflict_markers(&raw_content);

        let ours_full_content = reconstruct_content(&raw_content, "ours");
        let theirs_full_content = reconstruct_content(&raw_content, "theirs");
        let base_full_content = if parsed.has_base_content {
            Some(reconstruct_content(&raw_content, "base"))
        } else {
            None
        };

        info!(
            "Parsed {} conflict regions in {}",
            parsed.regions.len(),
            file_path
        );

        Ok(ThreeWayDiffResult {
            file_path,
            conflicts: parsed.regions,
            ours_full_content,
            theirs_full_content,
            base_full_content,
            has_base_content: parsed.has_base_content,
            raw_content,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Resolve a conflict by writing resolved content and staging the file
#[tauri::command]
pub async fn git_resolve_conflict(
    path: String,
    file_path: String,
    resolved_content: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        if content_has_conflict_markers(&resolved_content) {
            return Err(
                "Resolved content still contains conflict markers. Resolve every conflict before saving."
                    .to_string(),
            );
        }

        let repo = find_repo(&path)?;
        let repo_root = repo
            .workdir()
            .ok_or_else(|| "Could not determine repository root".to_string())?;

        let full_path = repo_root.join(&file_path);

        std::fs::write(&full_path, &resolved_content)
            .map_err(|e| format!("Failed to write resolved content: {}", e))?;

        let mut index = repo
            .index()
            .map_err(|e| format!("Failed to get index: {}", e))?;

        index
            .add_path(Path::new(&file_path))
            .map_err(|e| format!("Failed to stage resolved file: {}", e))?;

        index
            .write()
            .map_err(|e| format!("Failed to write index: {}", e))?;

        info!("Resolved and staged conflict for: {}", file_path);
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Abort the current merge operation
#[tauri::command]
pub async fn git_abort_merge(path: String) -> Result<(), String> {
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

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use git2::build::CheckoutBuilder;

    const CONFLICT_CONTENT: &str = "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n";

    fn create_repo_with_file() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();

        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "initial\n").unwrap();

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

    fn block_on<T>(future: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(future)
    }

    #[test]
    fn git_resolve_conflict_rejects_unresolved_markers() {
        let dir = create_repo_with_file();
        std::fs::write(dir.path().join("test.txt"), CONFLICT_CONTENT).unwrap();

        let error = block_on(git_resolve_conflict(
            dir.path().to_string_lossy().to_string(),
            "test.txt".to_string(),
            CONFLICT_CONTENT.to_string(),
        ))
        .expect_err("expected unresolved merge markers to be rejected");

        assert!(error.contains("still contains conflict markers"));

        let contents = std::fs::read_to_string(dir.path().join("test.txt")).unwrap();
        assert_eq!(contents, CONFLICT_CONTENT);
    }

    #[test]
    fn git_resolve_conflict_stages_file_and_clears_merge_conflict_listing() {
        let dir = create_repo_with_merge_conflict();

        block_on(git_resolve_conflict(
            dir.path().to_string_lossy().to_string(),
            "test.txt".to_string(),
            "resolved\ncontent\n".to_string(),
        ))
        .expect("resolved content should be written successfully");

        let contents = std::fs::read_to_string(dir.path().join("test.txt")).unwrap();
        assert_eq!(contents, "resolved\ncontent\n");

        let status = git_command_with_timeout(&["status", "--short"], dir.path()).unwrap();
        let stdout = String::from_utf8_lossy(&status.stdout);
        assert!(
            stdout.lines().any(|line| line == "M  test.txt"),
            "expected the resolved file to be staged after resolution, got: {stdout}"
        );

        let conflicts = block_on(git_get_merge_conflicts(
            dir.path().to_string_lossy().to_string(),
        ))
        .expect("expected merge conflict listing to refresh");

        assert!(
            conflicts.is_empty(),
            "expected resolved file to disappear from merge conflicts, got: {conflicts:?}"
        );
    }
}
