mod rdl;
mod sql;
mod ssrs;

use std::collections::HashMap;
use std::path::Path;
use rdl::ReportMetadata;
use sql::QueryResult;
use ssrs::{CatalogItem, TempReportResult};

#[tauri::command]
async fn parse_rdl(path: String) -> Result<ReportMetadata, String> {
    tokio::task::spawn_blocking(move || rdl::parse_rdl(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_rdl_sql(path: String, dataset_name: String, new_sql: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || rdl::update_rdl_sql(&path, &dataset_name, &new_sql))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_rdl_parameter(path: String, param_name: String, updated: rdl::ReportParameter) -> Result<(), String> {
    tokio::task::spawn_blocking(move || rdl::update_rdl_parameter(&path, &param_name, updated))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_rdl_dataset(path: String, dataset_name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || rdl::remove_rdl_dataset(&path, &dataset_name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_rdl_parameter(path: String, param: rdl::ReportParameter) -> Result<(), String> {
    tokio::task::spawn_blocking(move || rdl::add_rdl_parameter(&path, param))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_rdl_dataset(path: String, ds: rdl::DataSetInfo) -> Result<(), String> {
    tokio::task::spawn_blocking(move || rdl::add_rdl_dataset(&path, ds))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub path: String,
    pub line: usize,
    pub content: String,
}

#[tauri::command]
async fn search_in_files(base_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        let query_lower = query.to_lowercase();
        
        fn walk_search(dir: &Path, query: &str, results: &mut Vec<SearchResult>) -> std::io::Result<()> {
            if dir.is_dir() {
                for entry in std::fs::read_dir(dir)? {
                    let entry = entry?;
                    let path = entry.path();
                    if path.is_dir() {
                        let name = path.file_name().unwrap_or_default().to_string_lossy();
                        if name != "node_modules" && !name.starts_with('.') && name != "bin" && name != "obj" {
                            walk_search(&path, query, results)?;
                        }
                    } else {
                        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                        if ext == "sql" || ext == "rdl" {
                            if let Ok(content) = std::fs::read_to_string(&path) {
                                for (i, line) in content.lines().enumerate() {
                                    if line.to_lowercase().contains(query) {
                                        results.push(SearchResult {
                                            path: path.to_string_lossy().to_string(),
                                            line: i + 1,
                                            content: line.trim().to_string(),
                                        });
                                    }
                                    if results.len() > 1000 { return Ok(()); } // Limit results
                                }
                            }
                        }
                    }
                }
            }
            Ok(())
        }

        let _ = walk_search(Path::new(&base_path), &query_lower, &mut results);
        Ok(results)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn run_sql(
    sql: String,
    connection_string: String,
    params: HashMap<String, Option<String>>,
    is_stored_proc: bool,
    database: Option<String>,
) -> Result<QueryResult, String> {
    sql::run_sql(&sql, &connection_string, params, is_stored_proc, database).await
}

#[tauri::command]
async fn get_databases(connection_string: String) -> Result<Vec<String>, String> {
    sql::get_databases(&connection_string).await
}

#[tauri::command]
async fn ssrs_get_items(url: String, username: String, password: String) -> Result<Vec<CatalogItem>, String> {
    ssrs::get_catalog_items(&url, &username, &password).await
}

#[tauri::command]
async fn ssrs_download_rdl(
    url: String, username: String, password: String,
    report_id: String, report_name: String,
) -> Result<String, String> {
    ssrs::download_rdl(&url, &username, &password, &report_id, &report_name).await
}

#[tauri::command]
fn ssrs_preview_url(url: String, report_path: String, params: HashMap<String, Option<String>>) -> String {
    ssrs::preview_url(&url, &report_path, &params)
}

#[tauri::command]
async fn ssrs_upload_temp_report(
    url: String, username: String, password: String, rdl_path: String,
) -> Result<TempReportResult, String> {
    ssrs::upload_temp_report(&url, &username, &password, &rdl_path).await
}

#[tauri::command]
async fn ssrs_delete_report(
    url: String, username: String, password: String, report_id: String,
) -> Result<(), String> {
    ssrs::delete_report(&url, &username, &password, &report_id).await
}

/// Render report to a format, save to temp file, open with system default app.
/// format: WORDOPENXML | EXCELOPENXML | PPTX | PDF | CSV
#[tauri::command]
async fn ssrs_export(
    app: tauri::AppHandle,
    url: String,
    username: String,
    password: String,
    report_path: String,
    format: String,
    params: HashMap<String, Option<String>>,
) -> Result<(), String> {
    let bytes = ssrs::render_format(&url, &username, &password, &report_path, &format, &params).await?;

    let ext = match format.to_uppercase().as_str() {
        "WORDOPENXML" => "docx",
        "EXCELOPENXML" => "xlsx",
        "PPTX" => "pptx",
        "PDF" => "pdf",
        "CSV" => "csv",
        _ => "bin",
    };

    let report_name: String = report_path
        .split('/')
        .last()
        .unwrap_or("report")
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();

    let tmp = std::env::temp_dir().join(format!(
        "{report_name}_{}.{ext}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::write(&tmp, &bytes).map_err(|e| format!("Save failed: {e}"))?;

    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(tmp.to_str().unwrap_or(""), None::<&str>)
        .map_err(|e| format!("Open failed: {e}"))?;

    Ok(())
}

/// Open the SSRS report preview URL in the system default browser.
#[tauri::command]
fn ssrs_open_browser(app: tauri::AppHandle, preview_url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(&preview_url, None::<&str>)
        .map_err(|e| format!("Open failed: {e}"))
}

#[tauri::command]
fn scan_folder(path: String) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    scan_dir(Path::new(&path), &mut results)
        .map_err(|e| format!("Failed to scan folder: {e}"))?;
    results.sort();
    Ok(results)
}

fn scan_dir(dir: &Path, results: &mut Vec<String>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if !name.starts_with('.') && name != "node_modules" && name != "bin" && name != "obj" {
                // Add the directory path with a trailing slash to indicate it's a folder
                results.push(path.to_string_lossy().to_string() + "/");
                scan_dir(&path, results)?;
            }
        } else {
            results.push(path.to_string_lossy().to_string());
        }
    }
    Ok(())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_modified_time(path: String) -> Result<u64, String> {
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    Ok(modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_rename(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_remove(path: String) -> Result<(), String> {
    trash::delete(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_move(old_path: String, new_path: String) -> Result<(), String> {
    let p_old = Path::new(&old_path);
    let p_new = Path::new(&new_path);
    
    // Try rename first (fastest)
    match std::fs::rename(p_old, p_new) {
        Ok(_) => Ok(()),
        Err(e) => {
            // If rename fails (e.g. cross-device link on Windows), 
            // fallback to copy + delete for files, or manual copy for dirs.
            // For now, let's handle files. Dirs are more complex.
            if p_old.is_dir() {
                // For directories cross-device, we should ideally use a recursive copy.
                // Simple workaround for now: try to copy_dir if possible.
                return Err(format!("Cross-device directory move not supported via rename: {}", e));
            }
            
            std::fs::copy(p_old, p_new).map_err(|e| format!("Copy failed: {e}"))?;
            std::fs::remove_file(p_old).map_err(|e| format!("Remove failed: {e}"))?;
            Ok(())
        }
    }
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let path = path.replace("/", "\\");
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        // Linux is tricky, dbus is preferred but xdg-open is backup
        // For simplicity, just open the parent dir
        use std::process::Command;
        let parent = Path::new(&path).parent().unwrap_or(Path::new("/"));
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
}

#[derive(serde::Deserialize)]
struct ModelsApiResponse {
    data: Vec<ModelApiEntry>,
}

#[derive(serde::Deserialize)]
struct ModelApiEntry {
    id: String,
    display_name: String,
}

#[tauri::command]
async fn list_anthropic_models(api_key: String) -> Result<Vec<ModelInfo>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.anthropic.com/v1/models")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API error {status}: {body}"));
    }

    let parsed: ModelsApiResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.data.into_iter().map(|m| ModelInfo { id: m.id, display_name: m.display_name }).collect())
}

#[derive(serde::Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(serde::Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(serde::Serialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
}

#[derive(serde::Deserialize)]
struct AnthropicResponseContent {
    text: String,
}

#[derive(serde::Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicResponseContent>,
}

#[tauri::command]
async fn save_temp_image(data_url: String) -> Result<String, String> {
    use base64::Engine;

    let comma = data_url.find(',').ok_or("Invalid data URL: no comma")?;
    let header = &data_url[..comma];
    let b64 = &data_url[comma + 1..];

    let ext = if header.contains("image/png") { "png" }
        else if header.contains("image/jpeg") || header.contains("image/jpg") { "jpg" }
        else if header.contains("image/gif") { "gif" }
        else if header.contains("image/webp") { "webp" }
        else { "png" };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("Base64 decode failed: {e}"))?;

    let file_name = format!("claude-img-{}.{}", uuid::Uuid::new_v4(), ext);
    let file_path = std::env::temp_dir().join(&file_name);

    std::fs::write(&file_path, bytes)
        .map_err(|e| format!("Failed to write temp image: {e}"))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn call_claude_api(
    _api_key: String,
    _model: String,
    messages: Vec<ChatMessage>,
    system: Option<String>,
    permission_mode: String,
    effort_level: String,
    cwd: Option<String>,
    extra_dirs: Option<Vec<String>>,
    skip_permissions: Option<bool>,
) -> Result<String, String> {
    use std::process::{Command, Stdio};

    // Format the conversation history
    let mut prompt = String::new();
    for msg in &messages {
        let role_label = if msg.role == "user" { "User" } else { "Assistant" };
        prompt.push_str(&format!("[{}]: {}\n", role_label, msg.content));
    }
    prompt.push_str("\nPlease respond to the last User message above.");

    // Execute local `claude -p` CLI command.
    // On Windows, we run `claude.cmd` directly; on other platforms, we run `claude`.
    // We pass the prompt via stdin to avoid command line length limits and newline splitting/truncation issues with cmd /C on Windows.
    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("claude.cmd");
    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new("claude");

    cmd.arg("-p");

    if let Some(ref dir) = cwd {
        if !dir.is_empty() {
            cmd.current_dir(dir);
        }
    }

    if skip_permissions.unwrap_or(false) {
        cmd.arg("--dangerously-skip-permissions");
    }

    // Add temp dir so Claude can read saved images
    cmd.arg("--add-dir").arg(std::env::temp_dir());

    if let Some(dirs) = extra_dirs {
        for dir in dirs {
            if !dir.is_empty() {
                cmd.arg("--add-dir").arg(&dir);
            }
        }
    }

    if !permission_mode.is_empty() {
        cmd.arg("--permission-mode");
        cmd.arg(&permission_mode);
    }

    if !effort_level.is_empty() {
        cmd.arg("--effort");
        cmd.arg(&effort_level);
    }

    if let Some(sys) = system {
        cmd.arg("--system-prompt");
        cmd.arg(sys);
    }

    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = tokio::task::spawn_blocking(move || -> Result<std::process::Output, String> {
        use std::io::Write;
        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn Claude CLI: {e}"))?;
        
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(prompt.as_bytes()).map_err(|e| format!("Failed to write to stdin: {e}"))?;
        }
        
        child.wait_with_output().map_err(|e| format!("Failed to wait for output: {e}"))
    })
    .await
    .map_err(|e| format!("Task join failed: {e}"))??;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("Claude CLI exited with error: {}\n{}", stdout, stderr));
    }

    // Clean up warning messages from stdout if any
    let clean_response = stdout
        .replace("Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.", "")
        .trim()
        .to_string();

    Ok(clean_response)
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
fn snapshot_files(paths: Vec<String>) -> HashMap<String, String> {
    let mut result = HashMap::new();
    for path in paths {
        // Skip files larger than 1500 KB to avoid memory/storage issues
        if let Ok(meta) = std::fs::metadata(&path) {
            if meta.len() > 1_536_000 { continue; }
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            result.insert(path, content);
        }
    }
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            parse_rdl,
            run_sql,
            get_databases,
            ssrs_get_items,
            ssrs_download_rdl,
            ssrs_preview_url,
            ssrs_upload_temp_report,
            ssrs_delete_report,
            ssrs_export,
            ssrs_open_browser,
            scan_folder,
            fs_create_dir,
            fs_rename,
            fs_remove,
            fs_move,
            reveal_in_explorer,
            write_text_file,
            get_file_modified_time,
            update_rdl_sql,
            update_rdl_parameter,
            remove_rdl_dataset,
            add_rdl_parameter,
            add_rdl_dataset,
            search_in_files,
            read_text_file,
            snapshot_files,
            read_file_base64,
            call_claude_api,
            save_temp_image,
            list_anthropic_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}