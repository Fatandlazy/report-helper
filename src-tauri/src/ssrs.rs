use std::collections::HashMap;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose::STANDARD, Engine};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItem {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub item_type: String,
}

#[derive(Deserialize)]
struct ODataPage {
    value: Vec<ODataItem>,
    #[serde(rename = "@odata.nextLink")]
    next_link: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ODataItem {
    id: String,
    name: String,
    path: String,
    #[serde(rename = "Type")]
    item_type: String,
}

fn make_client(username: &str, password: &str) -> Result<Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    if !username.is_empty() {
        let creds = STANDARD.encode(format!("{username}:{password}"));
        let val = format!("Basic {creds}").parse()
            .map_err(|e| format!("Header error: {e}"))?;
        headers.insert(reqwest::header::AUTHORIZATION, val);
    }
    Client::builder()
        .default_headers(headers)
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("Client build error: {e}"))
}

fn api_base(url: &str) -> String {
    let stripped = url.trim_end_matches('/');
    // Remove /browse or /browse/... suffix
    let base = if let Some(i) = stripped.to_lowercase().find("/browse") {
        &stripped[..i]
    } else {
        stripped
    };
    format!("{base}/api/v2.0")
}

fn report_server_base(url: &str) -> String {
    let stripped = url.trim_end_matches('/');
    let base = if let Some(i) = stripped.to_lowercase().find("/browse") {
        &stripped[..i]
    } else {
        stripped
    };
    // Replace /Reports with /ReportServer
    if let Some(i) = base.to_lowercase().rfind("/reports") {
        format!("{}/ReportServer", &base[..i])
    } else {
        format!("{base}/ReportServer")
    }
}

pub async fn get_catalog_items(url: &str, username: &str, password: &str) -> Result<Vec<CatalogItem>, String> {
    let client = make_client(username, password)?;
    let api = api_base(url);

    let mut items: Vec<CatalogItem> = Vec::new();
    // No OData $filter — fetch all, filter client-side to avoid encoding issues across SSRS versions
    let mut next_url = Some(format!("{api}/CatalogItems?$top=1000&$select=Id,Name,Path,Type"));

    while let Some(page_url) = next_url {
        let resp = client.get(&page_url)
            .send().await
            .map_err(|e| format!("Request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("HTTP {status}: {body}"));
        }

        let page: ODataPage = resp.json().await
            .map_err(|e| format!("JSON parse error: {e}"))?;

        for item in page.value {
            if item.item_type == "Report" || item.item_type == "Folder" {
                items.push(CatalogItem {
                    id: item.id,
                    name: item.name,
                    path: item.path,
                    item_type: item.item_type,
                });
            }
        }

        next_url = page.next_link;
    }

    Ok(items)
}

pub async fn download_rdl(
    url: &str,
    username: &str,
    password: &str,
    report_id: &str,
    report_name: &str,
) -> Result<String, String> {
    let client = make_client(username, password)?;
    let api = api_base(url);
    let dl_url = format!("{api}/CatalogItems({report_id})/Content/$value");

    let resp = client.get(&dl_url)
        .send().await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Read failed: {e}"))?;
    let safe_name: String = report_name.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();
    let tmp = std::env::temp_dir().join(format!("ssrs_{safe_name}_{}.rdl", uuid::Uuid::new_v4().simple()));
    std::fs::write(&tmp, &bytes)
        .map_err(|e| format!("Write temp failed: {e}"))?;

    Ok(tmp.to_string_lossy().to_string())
}

pub fn preview_url(server_url: &str, report_path: &str, params: &HashMap<String, Option<String>>) -> String {
    let base = report_server_base(server_url);
    let path = if report_path.starts_with('/') { report_path } else { &format!("/{report_path}") };
    
    // Encode path but preserve slashes (SSRS expects ?/Path/To/Report)
    let encoded_path = urlencoding::encode(path).replace("%2F", "/");
    
    let mut url = format!("{base}?{encoded_path}&rs:Command=Render");
    
    for (k, v) in params {
        match v {
            Some(s) => {
                url.push_str(&format!("&{}={}", 
                    urlencoding::encode(k), 
                    urlencoding::encode(s)
                ));
            }
            None => {
                url.push_str(&format!("&{}:IsNull=true", urlencoding::encode(k)));
            }
        }
    }
    
    println!("[SSRS PREVIEW] Generated URL: {}", url);
    url
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TempReportResult {
    pub report_id: String,
    pub report_path: String,
    pub preview_url: String,
}

pub async fn upload_temp_report(
    url: &str,
    username: &str,
    password: &str,
    rdl_path: &str,
) -> Result<TempReportResult, String> {
    let client = make_client(username, password)?;
    let api = api_base(url);

    let rdl_bytes = std::fs::read(rdl_path)
        .map_err(|e| format!("Failed to read RDL: {e}"))?;
    let content_b64 = STANDARD.encode(&rdl_bytes);

    let temp_name = format!("_preview_{}", uuid::Uuid::new_v4().simple());
    let body = serde_json::json!({
        "@odata.type": "#Model.Report",
        "Content": content_b64,
        "ContentType": "application/octet-stream",
        "Description": "",
        "Hidden": true,
        "Name": temp_name,
        "Path": "/"
    });

    let resp = client
        .post(format!("{api}/Reports"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Upload failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let msg = resp.text().await.unwrap_or_default();
        return Err(format!("Upload HTTP {status}: {msg}"));
    }

    let created: serde_json::Value = resp.json().await
        .map_err(|e| format!("Parse upload response: {e}"))?;

    let report_id = created["Id"]
        .as_str()
        .ok_or_else(|| "Missing Id in upload response".to_string())?
        .to_string();

    let report_path = format!("/{temp_name}");
    let preview_url = preview_url(url, &report_path, &HashMap::new());

    Ok(TempReportResult { report_id, report_path, preview_url })
}

pub async fn render_format(
    url: &str,
    username: &str,
    password: &str,
    report_path: &str,
    format: &str,
    params: &HashMap<String, Option<String>>,
) -> Result<Vec<u8>, String> {
    let client = make_client(username, password)?;
    let base = report_server_base(url);
    let path = if report_path.starts_with('/') { report_path.to_string() } else { format!("/{report_path}") };
    let mut render_url = format!("{base}?{path}&rs:Command=Render&rs:Format={format}");

    for (k, v) in params {
        match v {
            Some(s) => {
                render_url.push_str(&format!("&{}={}", 
                    urlencoding::encode(k), 
                    urlencoding::encode(s)
                ));
            }
            None => {
                render_url.push_str(&format!("&{}:IsNull=true", urlencoding::encode(k)));
            }
        }
    }

    let resp = client
        .get(&render_url)
        .send()
        .await
        .map_err(|e| format!("Render failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let msg = resp.text().await.unwrap_or_default();
        return Err(format!("Render HTTP {status}: {msg}"));
    }

    let bytes = resp.bytes().await
        .map_err(|e| format!("Read bytes: {e}"))?;
    Ok(bytes.to_vec())
}

pub async fn delete_report(
    url: &str,
    username: &str,
    password: &str,
    report_id: &str,
) -> Result<(), String> {
    let client = make_client(username, password)?;
    let api = api_base(url);
    client
        .delete(format!("{api}/Reports({report_id})"))
        .send()
        .await
        .map_err(|e| format!("Delete failed: {e}"))?;
    Ok(())
}
