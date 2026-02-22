//! Document symbols commands
//!
//! Commands for document symbol operations with regex fallback for
//! when LSP servers don't provide symbol information.

use std::sync::LazyLock;

use regex::Regex;
use tauri::State;
use tracing::info;

use crate::lsp::types::SymbolInformation;

use super::state::LspState;

/// LSP Symbol Kind (matches LSP specification)
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u8)]
enum SymbolKind {
    #[allow(dead_code)]
    File = 1,
    Module = 2,
    Namespace = 3,
    Package = 4,
    Class = 5,
    Method = 6,
    Property = 7,
    #[allow(dead_code)]
    Field = 8,
    #[allow(dead_code)]
    Constructor = 9,
    Enum = 10,
    Interface = 11,
    Function = 12,
    Variable = 13,
    Constant = 14,
    #[allow(dead_code)]
    String = 15,
    #[allow(dead_code)]
    Number = 16,
    #[allow(dead_code)]
    Boolean = 17,
    #[allow(dead_code)]
    Array = 18,
    #[allow(dead_code)]
    Object = 19,
    #[allow(dead_code)]
    Key = 20,
    #[allow(dead_code)]
    Null = 21,
    #[allow(dead_code)]
    EnumMember = 22,
    Struct = 23,
    #[allow(dead_code)]
    Event = 24,
    #[allow(dead_code)]
    Operator = 25,
    TypeParameter = 26,
}

/// Document symbol structure matching LSP DocumentSymbol
#[derive(Debug, Clone, serde::Serialize)]
struct DocumentSymbol {
    name: String,
    detail: Option<String>,
    kind: u8,
    range: LspRange,
    #[serde(rename = "selectionRange")]
    selection_range: LspRange,
    children: Vec<DocumentSymbol>,
}

#[derive(Debug, Clone, serde::Serialize)]
struct LspRange {
    start: LspPosition,
    end: LspPosition,
}

#[derive(Debug, Clone, serde::Serialize)]
struct LspPosition {
    line: u32,
    character: u32,
}

/// Pattern definition for symbol extraction
struct SymbolPattern {
    pattern: &'static Regex,
    kind: SymbolKind,
    name_group: usize,
}

// ============================================================================
// Static regex patterns (compiled once via LazyLock)
// ============================================================================

// TypeScript patterns
static TS_CLASS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:export\s+)?(?:default\s+)?class\s+(\w+)").unwrap());
static TS_INTERFACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:export\s+)?interface\s+(\w+)").unwrap());
static TS_TYPE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:export\s+)?type\s+(\w+)").unwrap());
static TS_ENUM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:export\s+)?enum\s+(\w+)").unwrap());
static TS_FUNCTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)").unwrap());
static TS_ARROW_FN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(").unwrap());
static TS_VARIABLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=").unwrap());
static TS_METHOD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s+(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\(")
        .unwrap()
});
static TS_PROPERTY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s+(?:public|private|protected)?\s*(?:static\s+)?(?:readonly\s+)?(\w+)\s*[=:;]")
        .unwrap()
});

// JavaScript patterns (shares some with TS)
static JS_METHOD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s+(?:async\s+)?(\w+)\s*\(").unwrap());

// Python patterns
static PY_CLASS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^class\s+(\w+)").unwrap());
static PY_FUNCTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?:async\s+)?def\s+(\w+)").unwrap());
static PY_METHOD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s+(?:async\s+)?def\s+(\w+)").unwrap());
static PY_VARIABLE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(\w+)\s*=").unwrap());

// Rust patterns
static RS_STRUCT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:pub\s+)?struct\s+(\w+)").unwrap());
static RS_ENUM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:pub\s+)?enum\s+(\w+)").unwrap());
static RS_TRAIT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:pub\s+)?trait\s+(\w+)").unwrap());
static RS_IMPL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*impl(?:\s+<[^>]+>)?\s+(\w+)").unwrap());
static RS_FN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)").unwrap());
static RS_MOD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:pub\s+)?mod\s+(\w+)").unwrap());
static RS_CONST: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:pub\s+)?const\s+(\w+)").unwrap());
static RS_STATIC: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:pub\s+)?static\s+(\w+)").unwrap());
static RS_TYPE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:pub\s+)?type\s+(\w+)").unwrap());

// Go patterns
static GO_STRUCT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^type\s+(\w+)\s+struct").unwrap());
static GO_INTERFACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^type\s+(\w+)\s+interface").unwrap());
static GO_FUNC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^func\s+(\w+)").unwrap());
static GO_METHOD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^func\s+\([^)]+\)\s+(\w+)").unwrap());
static GO_PACKAGE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^package\s+(\w+)").unwrap());
static GO_CONST: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*const\s+(\w+)").unwrap());
static GO_VAR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*var\s+(\w+)").unwrap());

// Java patterns
static JAVA_CLASS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+(\w+)")
        .unwrap()
});
static JAVA_INTERFACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:public|private|protected)?\s*interface\s+(\w+)").unwrap());
static JAVA_ENUM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:public|private|protected)?\s*enum\s+(\w+)").unwrap());
static JAVA_METHOD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(",
    )
    .unwrap()
});
static JAVA_PACKAGE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^package\s+([\w.]+)").unwrap());

// C/C++ patterns
static CPP_CLASS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:class|struct)\s+(\w+)").unwrap());
static CPP_ENUM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*enum\s+(?:class\s+)?(\w+)").unwrap());
static CPP_NAMESPACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*namespace\s+(\w+)").unwrap());
static CPP_FUNCTION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*(?:virtual\s+)?(?:\w+(?:<[^>]+>)?(?:\s*[*&])?)\s+(\w+)\s*\(").unwrap()
});
static CPP_DEFINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^#define\s+(\w+)").unwrap());

// C# patterns
static CS_CLASS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?(?:partial\s+)?class\s+(\w+)",
    )
    .unwrap()
});
static CS_INTERFACE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*(?:public|private|protected|internal)?\s*interface\s+(\w+)").unwrap()
});
static CS_ENUM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*(?:public|private|protected|internal)?\s*enum\s+(\w+)").unwrap()
});
static CS_STRUCT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*(?:public|private|protected|internal)?\s*struct\s+(\w+)").unwrap()
});
static CS_METHOD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(",
    )
    .unwrap()
});
static CS_NAMESPACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^namespace\s+([\w.]+)").unwrap());

// Ruby patterns
static RB_CLASS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*class\s+(\w+)").unwrap());
static RB_MODULE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*module\s+(\w+)").unwrap());
static RB_DEF: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*def\s+(\w+)").unwrap());
static RB_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*attr_(?:reader|writer|accessor)\s+:(\w+)").unwrap());

// PHP patterns
static PHP_CLASS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:abstract\s+)?class\s+(\w+)").unwrap());
static PHP_INTERFACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*interface\s+(\w+)").unwrap());
static PHP_TRAIT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*trait\s+(\w+)").unwrap());
static PHP_FUNCTION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*(?:public|private|protected)?\s*(?:static\s+)?function\s+(\w+)").unwrap()
});
static PHP_NAMESPACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^namespace\s+([\w\\]+)").unwrap());

// Generic patterns
static GENERIC_CLASS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:class|struct)\s+(\w+)").unwrap());
static GENERIC_FUNCTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:function|func|fn|def)\s+(\w+)").unwrap());
static GENERIC_INTERFACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:interface)\s+(\w+)").unwrap());
static GENERIC_ENUM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:enum)\s+(\w+)").unwrap());

/// Get document symbols - tries real LSP first, falls back to regex parsing
#[tauri::command]
pub async fn lsp_document_symbols(
    state: State<'_, LspState>,
    file_path: Option<String>,
    content: String,
    language: String,
    server_id: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    // Try to use real LSP if we have a server_id and file_path
    if let (Some(sid), Some(fp)) = (&server_id, &file_path) {
        let client = {
            let clients = state.clients.lock();
            clients.get(sid).cloned()
        };

        if let Some(client) = client {
            // Build the file URI
            let uri = format!("file://{}", fp.replace('\\', "/"));

            match client.document_symbols(&uri).await {
                Ok(symbols) if !symbols.is_empty() => {
                    info!("Got {} symbols from LSP for {}", symbols.len(), fp);
                    return Ok(symbols);
                }
                Ok(_) => {
                    // Empty result from LSP, fall back to regex
                    info!(
                        "LSP returned empty symbols for {}, falling back to regex",
                        fp
                    );
                }
                Err(e) => {
                    // LSP failed, fall back to regex
                    info!(
                        "LSP document symbols failed for {}: {}, falling back to regex",
                        fp, e
                    );
                }
            }
        }
    }

    // Fallback to regex-based parsing
    let symbols = parse_document_symbols(&content, &language);

    // Convert to JSON values
    let json_symbols: Vec<serde_json::Value> = symbols
        .into_iter()
        .filter_map(|s| serde_json::to_value(s).ok())
        .collect();

    Ok(json_symbols)
}

/// Parse document symbols from content based on language
fn parse_document_symbols(content: &str, language: &str) -> Vec<DocumentSymbol> {
    let patterns = get_patterns_for_language(language);
    let lines: Vec<&str> = content.lines().collect();
    let mut symbols = Vec::new();

    for (line_idx, line) in lines.iter().enumerate() {
        for pattern_def in &patterns {
            if let Some(captures) = pattern_def.pattern.captures(line) {
                if let Some(name_match) = captures.get(pattern_def.name_group) {
                    let name = name_match.as_str().to_string();
                    let start_col = name_match.start() as u32;
                    let end_col = name_match.end() as u32;

                    let symbol = DocumentSymbol {
                        name,
                        detail: None,
                        kind: pattern_def.kind as u8,
                        range: LspRange {
                            start: LspPosition {
                                line: line_idx as u32,
                                character: 0,
                            },
                            end: LspPosition {
                                line: line_idx as u32,
                                character: line.len() as u32,
                            },
                        },
                        selection_range: LspRange {
                            start: LspPosition {
                                line: line_idx as u32,
                                character: start_col,
                            },
                            end: LspPosition {
                                line: line_idx as u32,
                                character: end_col,
                            },
                        },
                        children: vec![],
                    };
                    symbols.push(symbol);
                    break; // Only match once per line
                }
            }
        }
    }

    symbols
}

/// Get regex patterns for a specific language
fn get_patterns_for_language(language: &str) -> Vec<SymbolPattern> {
    match language {
        "typescript" | "typescriptreact" | "tsx" => get_typescript_patterns(),
        "javascript" | "javascriptreact" | "jsx" => get_javascript_patterns(),
        "python" => get_python_patterns(),
        "rust" => get_rust_patterns(),
        "go" => get_go_patterns(),
        "java" => get_java_patterns(),
        "c" | "cpp" | "c++" => get_cpp_patterns(),
        "csharp" | "cs" => get_csharp_patterns(),
        "ruby" => get_ruby_patterns(),
        "php" => get_php_patterns(),
        _ => get_generic_patterns(),
    }
}

fn get_typescript_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &TS_CLASS,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_INTERFACE,
            kind: SymbolKind::Interface,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_TYPE,
            kind: SymbolKind::TypeParameter,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_ENUM,
            kind: SymbolKind::Enum,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_FUNCTION,
            kind: SymbolKind::Function,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_ARROW_FN,
            kind: SymbolKind::Function,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_VARIABLE,
            kind: SymbolKind::Variable,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_METHOD,
            kind: SymbolKind::Method,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_PROPERTY,
            kind: SymbolKind::Property,
            name_group: 1,
        },
    ]
}

fn get_javascript_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &TS_CLASS,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_FUNCTION,
            kind: SymbolKind::Function,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_ARROW_FN,
            kind: SymbolKind::Function,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &TS_VARIABLE,
            kind: SymbolKind::Variable,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &JS_METHOD,
            kind: SymbolKind::Method,
            name_group: 1,
        },
    ]
}

fn get_python_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &PY_CLASS,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &PY_FUNCTION,
            kind: SymbolKind::Function,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &PY_METHOD,
            kind: SymbolKind::Method,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &PY_VARIABLE,
            kind: SymbolKind::Variable,
            name_group: 1,
        },
    ]
}

fn get_rust_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &RS_STRUCT,
            kind: SymbolKind::Struct,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RS_ENUM,
            kind: SymbolKind::Enum,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RS_TRAIT,
            kind: SymbolKind::Interface,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RS_IMPL,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RS_FN,
            kind: SymbolKind::Function,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RS_MOD,
            kind: SymbolKind::Module,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RS_CONST,
            kind: SymbolKind::Constant,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RS_STATIC,
            kind: SymbolKind::Variable,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RS_TYPE,
            kind: SymbolKind::TypeParameter,
            name_group: 1,
        },
    ]
}

fn get_go_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &GO_STRUCT,
            kind: SymbolKind::Struct,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &GO_INTERFACE,
            kind: SymbolKind::Interface,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &GO_FUNC,
            kind: SymbolKind::Function,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &GO_METHOD,
            kind: SymbolKind::Method,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &GO_PACKAGE,
            kind: SymbolKind::Package,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &GO_CONST,
            kind: SymbolKind::Constant,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &GO_VAR,
            kind: SymbolKind::Variable,
            name_group: 1,
        },
    ]
}

fn get_java_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &JAVA_CLASS,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &JAVA_INTERFACE,
            kind: SymbolKind::Interface,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &JAVA_ENUM,
            kind: SymbolKind::Enum,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &JAVA_METHOD,
            kind: SymbolKind::Method,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &JAVA_PACKAGE,
            kind: SymbolKind::Package,
            name_group: 1,
        },
    ]
}

fn get_cpp_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &CPP_CLASS,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &CPP_ENUM,
            kind: SymbolKind::Enum,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &CPP_NAMESPACE,
            kind: SymbolKind::Namespace,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &CPP_FUNCTION,
            kind: SymbolKind::Function,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &CPP_DEFINE,
            kind: SymbolKind::Constant,
            name_group: 1,
        },
    ]
}

fn get_csharp_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &CS_CLASS,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &CS_INTERFACE,
            kind: SymbolKind::Interface,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &CS_ENUM,
            kind: SymbolKind::Enum,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &CS_STRUCT,
            kind: SymbolKind::Struct,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &CS_METHOD,
            kind: SymbolKind::Method,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &CS_NAMESPACE,
            kind: SymbolKind::Namespace,
            name_group: 1,
        },
    ]
}

fn get_ruby_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &RB_CLASS,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RB_MODULE,
            kind: SymbolKind::Module,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RB_DEF,
            kind: SymbolKind::Method,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &RB_ATTR,
            kind: SymbolKind::Property,
            name_group: 1,
        },
    ]
}

fn get_php_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &PHP_CLASS,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &PHP_INTERFACE,
            kind: SymbolKind::Interface,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &PHP_TRAIT,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &PHP_FUNCTION,
            kind: SymbolKind::Function,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &PHP_NAMESPACE,
            kind: SymbolKind::Namespace,
            name_group: 1,
        },
    ]
}

fn get_generic_patterns() -> Vec<SymbolPattern> {
    vec![
        SymbolPattern {
            pattern: &GENERIC_CLASS,
            kind: SymbolKind::Class,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &GENERIC_FUNCTION,
            kind: SymbolKind::Function,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &GENERIC_INTERFACE,
            kind: SymbolKind::Interface,
            name_group: 1,
        },
        SymbolPattern {
            pattern: &GENERIC_ENUM,
            kind: SymbolKind::Enum,
            name_group: 1,
        },
    ]
}

/// Search workspace symbols across all files
#[tauri::command]
pub async fn lsp_workspace_symbols(
    state: State<'_, LspState>,
    server_id: String,
    query: String,
) -> Result<Vec<SymbolInformation>, String> {
    let client = {
        let clients = state.clients.lock();
        clients.get(&server_id).cloned()
    };

    let client = client.ok_or_else(|| format!("Server not found: {}", server_id))?;

    client
        .workspace_symbol(&query)
        .await
        .map_err(|e| format!("Workspace symbol request failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_typescript_patterns() {
        let patterns = get_typescript_patterns();
        assert!(!patterns.is_empty());
        // Verify all patterns are accessible (LazyLock initializes)
        for p in &patterns {
            let _ = p.pattern.as_str();
        }
    }

    #[test]
    fn test_all_language_patterns() {
        let languages = [
            "typescript",
            "javascript",
            "python",
            "rust",
            "go",
            "java",
            "c",
            "cpp",
            "csharp",
            "ruby",
            "php",
            "unknown",
        ];
        for lang in &languages {
            let patterns = get_patterns_for_language(lang);
            assert!(!patterns.is_empty(), "No patterns for {}", lang);
        }
    }

    #[test]
    fn test_parse_document_symbols_rust() {
        let content = r#"
pub struct MyStruct {
    field: u32,
}

pub fn my_function() {
    let x = 5;
}

impl MyStruct {
    pub fn method(&self) {}
}
"#;
        let symbols = parse_document_symbols(content, "rust");
        assert!(!symbols.is_empty());
        let names: Vec<&str> = symbols.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"MyStruct"));
        assert!(names.contains(&"my_function"));
    }
}
