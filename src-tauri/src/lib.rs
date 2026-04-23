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
            read_text_file,
            write_text_file,
            get_file_modified_time,
            update_rdl_sql,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}