use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tiberius::{AuthMethod, Client, ColumnData, Config, EncryptionLevel, Query};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<HashMap<String, serde_json::Value>>,
    pub row_count: usize,
    pub elapsed_ms: u64,
}

pub async fn run_sql(
    sql: &str,
    connection_string: &str,
    params: HashMap<String, Option<String>>,
    _is_stored_proc: bool,
    database_override: Option<String>,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();

    let mut config = parse_connection_string(connection_string)?;
    if let Some(db) = database_override {
        if !db.is_empty() {
            config.database(&db);
        }
    }
    config.trust_cert();

    let tcp = TcpStream::connect(config.get_addr())
        .await
        .map_err(|e| format!("TCP connect failed: {e}"))?;
    tcp.set_nodelay(true).ok();

    let mut client = Client::connect(config, tcp.compat_write())
        .await
        .map_err(|e| format!("SQL connect failed: {e}"))?;

    let bound_params: Vec<(String, Option<String>)> = params
        .iter()
        .filter(|(k, _)| {
            let param_ref = format!("@{k}");
            sql.to_lowercase().contains(&param_ref.to_lowercase())
        })
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    let mut declarations = String::new();
    for (i, (k, _)) in bound_params.iter().enumerate() {
        declarations.push_str(&format!("DECLARE @{} NVARCHAR(MAX) = @p{};\n", k, i + 1));
    }

    let final_sql = if _is_stored_proc {
        // If it's a stored procedure, we might just want to construct an EXEC statement
        // but currently UI filters params by text, so bound_params is likely empty anyway.
        // We will just do EXEC sql @p1, @p2...
        let mut exec_stmt = format!("EXEC {} ", sql);
        let args: Vec<String> = (0..bound_params.len()).map(|i| format!("@p{}", i + 1)).collect();
        exec_stmt.push_str(&args.join(", "));
        exec_stmt
    } else {
        format!("{}\n{}", declarations, sql)
    };

    let mut query = Query::new(final_sql);
    for (_, v) in &bound_params {
        match v {
            Some(s) => query.bind(s.as_str()),
            None => query.bind(Option::<&str>::None),
        }
    }

    let stream = query
        .query(&mut client)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;

    let rows_raw = stream
        .into_results()
        .await
        .map_err(|e| format!("Failed to read results: {e}"))?;

    let mut columns: Vec<String> = Vec::new();
    let mut rows: Vec<HashMap<String, serde_json::Value>> = Vec::new();

    for set in rows_raw {
        for row in set {
            if columns.is_empty() {
                columns = row.columns().iter().map(|c| c.name().to_string()).collect();
            }
            let cells: Vec<ColumnData<'static>> = row.into_iter().collect();
            let mut map = HashMap::new();
            for (col_name, cell) in columns.iter().zip(cells) {
                map.insert(col_name.clone(), col_data_to_json(cell));
            }
            rows.push(map);
        }
        if !rows.is_empty() {
            break;
        }
    }

    let row_count = rows.len();
    let elapsed_ms = start.elapsed().as_millis() as u64;

    Ok(QueryResult { columns, rows, row_count, elapsed_ms })
}

fn col_data_to_json(data: ColumnData<'_>) -> serde_json::Value {
    match data {
        ColumnData::Bit(Some(v))    => serde_json::Value::Bool(v),
        ColumnData::I16(Some(v))    => (v as i64).into(),
        ColumnData::I32(Some(v))    => (v as i64).into(),
        ColumnData::I64(Some(v))    => v.into(),
        ColumnData::F32(Some(v))    => serde_json::json!(v),
        ColumnData::F64(Some(v))    => serde_json::json!(v),
        ColumnData::String(Some(v)) => serde_json::Value::String(v.into_owned()),
        ColumnData::Numeric(Some(v)) => serde_json::Value::String(v.to_string()),
        _ => serde_json::Value::Null,
    }
}

fn parse_connection_string(cs: &str) -> Result<Config, String> {
    let mut config = Config::new();
    let mut server = String::new();
    let mut port: Option<u16> = None;
    let mut db = String::new();
    let mut user = String::new();
    let mut pass = String::new();
    let mut encrypt = true;
    let mut trust_cert = false;

    for part in cs.split(';') {
        let part = part.trim();
        if part.is_empty() { continue; }
        let (k, v) = match part.find('=') {
            Some(i) => (part[..i].trim().to_lowercase(), part[i+1..].trim().to_lowercase()),
            None => continue,
        };
        match k.as_str() {
            "server" | "data source" => {
                let s = v.trim_start_matches("tcp:");
                if let Some((h, p)) = s.rsplit_once(',') {
                    server = h.trim().to_string();
                    port = p.trim().parse().ok();
                } else if let Some((h, _)) = s.split_once('\\') {
                    server = h.trim().to_string();
                } else {
                    server = s.trim().to_string();
                }
            }
            "database" | "initial catalog" => { db = v; }
            "user id" | "uid" => { user = v; }
            "password" | "pwd" => { pass = part[k.len()+1..].trim().to_string(); } // preserve case
            "encrypt" => { encrypt = !matches!(v.as_str(), "false" | "no" | "0"); }
            "trustservercertificate" => { trust_cert = matches!(v.as_str(), "true" | "yes" | "1"); }
            _ => {}
        }
    }

    config.host(&server);
    config.port(port.unwrap_or(1433));
    if !db.is_empty() { config.database(&db); }
    config.authentication(AuthMethod::sql_server(&user, &pass));

    if !encrypt {
        config.encryption(EncryptionLevel::NotSupported);
    } else if trust_cert {
        config.trust_cert();
    } else {
        config.trust_cert(); // default: trust cert for dev convenience
    }

    Ok(config)
}

pub async fn get_databases(connection_string: &str) -> Result<Vec<String>, String> {
    let mut config = parse_connection_string(connection_string)?;
    config.trust_cert();

    let tcp = TcpStream::connect(config.get_addr())
        .await
        .map_err(|e| format!("TCP connect failed: {e}"))?;
    tcp.set_nodelay(true).ok();

    let mut client = Client::connect(config, tcp.compat_write())
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    let query = "SELECT name FROM sys.databases WHERE database_id > 4 OR name = 'master' ORDER BY name";
    let stream = client.query(query, &[]).await.map_err(|e| e.to_string())?;
    let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;

    let mut dbs = Vec::new();
    for row in rows {
        if let Some(name) = row.get::<&str, _>(0) {
            dbs.push(name.to_string());
        }
    }

    Ok(dbs)
}
