use quick_xml::events::{BytesCData, BytesText, Event};
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct QueryParameter {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DataSetInfo {
    pub name: String,
    pub command_text: String,
    pub command_type: String,
    pub data_source_name: String,
    pub query_parameters: Vec<QueryParameter>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParameterValue {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DataSetReference {
    pub data_set_name: String,
    pub value_field: String,
    pub label_field: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AvailableValues {
    pub static_values: Vec<ParameterValue>,
    pub data_set_reference: Option<DataSetReference>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReportParameter {
    pub name: String,
    pub prompt: String,
    pub data_type: String,
    pub default_value: String,
    pub available_values: Option<AvailableValues>,
    pub multi_value: bool,
    pub nullable: bool,
    pub allow_blank: bool,
    pub hidden: bool,
    pub default_value_query: Option<DataSetReference>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DataSourceInfo {
    pub name: String,
    pub connection_string: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReportMetadata {
    pub data_sets: Vec<DataSetInfo>,
    pub parameters: Vec<ReportParameter>,
    pub data_sources: Vec<DataSourceInfo>,
}

pub fn parse_rdl(path: &str) -> Result<ReportMetadata, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(true);

    let mut metadata = ReportMetadata::default();
    let mut path_stack: Vec<String> = Vec::new();

    // Current item being built
    let mut cur_dataset: Option<DataSetInfo> = None;
    let mut cur_param: Option<ReportParameter> = None;
    let mut cur_datasource: Option<DataSourceInfo> = None;
    let mut cur_param_value: Option<ParameterValue> = None;
    let mut cur_ds_ref: Option<DataSetReference> = None;
    let mut cur_query_param: Option<QueryParameter> = None;
    let mut cur_text = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let local = local_name(&e);
                path_stack.push(local.clone());

                match local.as_str() {
                    "DataSet" => {
                        let mut ds = DataSetInfo::default();
                        ds.name = attr_value(&e, b"Name").unwrap_or_default();
                        cur_dataset = Some(ds);
                    }
                    "ReportParameter" => {
                        let mut p = ReportParameter::default();
                        p.name = attr_value(&e, b"Name").unwrap_or_default();
                        cur_param = Some(p);
                    }
                    "DataSource" => {
                        let mut src = DataSourceInfo::default();
                        src.name = attr_value(&e, b"Name").unwrap_or_default();
                        cur_datasource = Some(src);
                    }
                    "ParameterValue" => {
                        cur_param_value = Some(ParameterValue::default());
                    }
                    "DataSetReference" => {
                        cur_ds_ref = Some(DataSetReference::default());
                    }
                    "QueryParameter" => {
                        let mut qp = QueryParameter::default();
                        qp.name = attr_value(&e, b"Name").unwrap_or_default();
                        cur_query_param = Some(qp);
                    }
                    _ => {}
                }
                cur_text.clear();
            }
            Ok(Event::End(e)) => {
                let local = local_name_end(&e);
                let depth_path = path_stack.join("/");

                match local.as_str() {
                    "CommandText" => {
                        if let Some(ds) = &mut cur_dataset {
                            ds.command_text = cur_text.trim().to_string();
                        }
                    }
                    "CommandType" => {
                        if let Some(ds) = &mut cur_dataset {
                            ds.command_type = cur_text.trim().to_string();
                        }
                    }
                    "DataSourceName" => {
                        if let Some(ds) = &mut cur_dataset {
                            ds.data_source_name = cur_text.trim().to_string();
                        }
                    }
                    "DataSet" => {
                        if let Some(mut ds) = cur_dataset.take() {
                            if ds.command_type.is_empty() {
                                ds.command_type = "Text".to_string();
                            }
                            if !ds.command_text.is_empty() {
                                metadata.data_sets.push(ds);
                            }
                        }
                    }
                    "Prompt" => {
                        if let Some(p) = &mut cur_param {
                            p.prompt = cur_text.trim().to_string();
                        }
                    }
                    "DataType" => {
                        if depth_path.contains("ReportParameter") {
                            if let Some(p) = &mut cur_param {
                                p.data_type = cur_text.trim().to_string();
                            }
                        }
                    }
                    "MultiValue" => {
                        if let Some(p) = &mut cur_param {
                            p.multi_value = cur_text.trim().to_lowercase() == "true";
                        }
                    }
                    "Nullable" => {
                        if let Some(p) = &mut cur_param {
                            p.nullable = cur_text.trim().to_lowercase() == "true";
                        }
                    }
                    "AllowBlank" => {
                        if let Some(p) = &mut cur_param {
                            p.allow_blank = cur_text.trim().to_lowercase() == "true";
                        }
                    }
                    "Hidden" => {
                        if let Some(p) = &mut cur_param {
                            p.hidden = cur_text.trim().to_lowercase() == "true";
                        }
                    }
                    "DefaultValue" | "Value" => {
                        if depth_path.contains("ReportParameter/DefaultValue") {
                            if let Some(p) = &mut cur_param {
                                if p.default_value.is_empty() {
                                    p.default_value = cur_text.trim().to_string();
                                }
                            }
                        } else if depth_path.contains("ParameterValue") {
                            if let Some(v) = &mut cur_param_value {
                                v.value = cur_text.trim().to_string();
                            }
                        } else if depth_path.contains("QueryParameter") {
                            if let Some(qp) = &mut cur_query_param {
                                qp.value = cur_text.trim().to_string();
                            }
                        }
                    }
                    "Label" => {
                        if depth_path.contains("ParameterValue") {
                            if let Some(v) = &mut cur_param_value {
                                v.label = cur_text.trim().to_string();
                            }
                        }
                    }
                    "ParameterValue" => {
                        if let Some(v) = cur_param_value.take() {
                            if let Some(p) = &mut cur_param {
                                if depth_path.contains("AvailableValues") || depth_path.contains("ValidValues") {
                                    let av = p.available_values.get_or_insert_with(AvailableValues::default);
                                    av.static_values.push(v);
                                }
                            }
                        }
                    }
                    "DataSetName" => {
                        if let Some(ds_ref) = &mut cur_ds_ref {
                            ds_ref.data_set_name = cur_text.trim().to_string();
                        }
                    }
                    "ValueField" => {
                        if let Some(ds_ref) = &mut cur_ds_ref {
                            ds_ref.value_field = cur_text.trim().to_string();
                        }
                    }
                    "LabelField" => {
                        if let Some(ds_ref) = &mut cur_ds_ref {
                            ds_ref.label_field = cur_text.trim().to_string();
                        }
                    }
                    "DataSetReference" => {
                        if let Some(ds_ref) = cur_ds_ref.take() {
                            if let Some(p) = &mut cur_param {
                                if depth_path.contains("AvailableValues") || depth_path.contains("ValidValues") {
                                    let av = p.available_values.get_or_insert_with(AvailableValues::default);
                                    av.data_set_reference = Some(ds_ref);
                                } else if depth_path.contains("DefaultValue") {
                                    p.default_value_query = Some(ds_ref);
                                }
                            }
                        }
                    }
                    "QueryParameter" => {
                        if let Some(qp) = cur_query_param.take() {
                            if let Some(ds) = &mut cur_dataset {
                                ds.query_parameters.push(qp);
                            }
                        }
                    }
                    "ReportParameter" => {
                        if let Some(mut p) = cur_param.take() {
                            if p.prompt.is_empty() {
                                p.prompt = p.name.clone();
                            }
                            if p.data_type.is_empty() {
                                p.data_type = "String".to_string();
                            }
                            metadata.parameters.push(p);
                        }
                    }
                    "ConnectString" => {
                        if let Some(src) = &mut cur_datasource {
                            src.connection_string = cur_text.trim().to_string();
                        }
                    }
                    "DataSource" => {
                        if let Some(src) = cur_datasource.take() {
                            metadata.data_sources.push(src);
                        }
                    }
                    _ => {}
                }

                path_stack.pop();
                cur_text.clear();
            }
            Ok(Event::Text(e)) => {
                cur_text.push_str(&e.unescape().unwrap_or_default());
            }
            Ok(Event::CData(e)) => {
                cur_text.push_str(&String::from_utf8_lossy(e.into_inner().as_ref()));
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {e}")),
            _ => {}
        }
    }

    Ok(metadata)
}

fn local_name(e: &quick_xml::events::BytesStart) -> String {
    let name = e.local_name();
    String::from_utf8_lossy(name.as_ref()).to_string()
}

fn local_name_end(e: &quick_xml::events::BytesEnd) -> String {
    let name = e.local_name();
    String::from_utf8_lossy(name.as_ref()).to_string()
}

fn attr_value(e: &quick_xml::events::BytesStart, key: &[u8]) -> Option<String> {
    e.attributes().flatten().find(|a| a.key.as_ref() == key)
        .and_then(|a| String::from_utf8(a.value.to_vec()).ok())
}

pub fn update_rdl_sql(path: &str, dataset_name: &str, new_sql: &str) -> Result<(), String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(false); // preserve whitespace for writer

    let mut writer = Writer::new(std::io::Cursor::new(Vec::new()));
    let mut path_stack: Vec<String> = Vec::new();
    let mut in_target_dataset = false;
    let mut in_command_text = false;
    let mut dataset_updated = false;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let local = local_name(&e);
                path_stack.push(local.clone());

                if local == "DataSet" {
                    if let Some(name) = attr_value(&e, b"Name") {
                        if name == dataset_name {
                            in_target_dataset = true;
                        }
                    }
                } else if local == "CommandText" && in_target_dataset {
                    in_command_text = true;
                    writer.write_event(Event::Start(e.clone())).map_err(|e| e.to_string())?;
                    // We will skip the existing text and write our own in Event::Text
                    buf.clear();
                    continue;
                }
                writer.write_event(Event::Start(e)).map_err(|e| e.to_string())?;
            }
            Ok(Event::End(e)) => {
                let local = local_name_end(&e);
                if local == "DataSet" && in_target_dataset {
                    in_target_dataset = false;
                } else if local == "CommandText" && in_command_text {
                    in_command_text = false;
                }
                writer.write_event(Event::End(e)).map_err(|e| e.to_string())?;
                path_stack.pop();
            }
            Ok(Event::Text(e)) => {
                if in_command_text {
                    // Replace the text with new SQL
                    writer.write_event(Event::Text(BytesText::new(new_sql)))
                        .map_err(|e| e.to_string())?;
                    dataset_updated = true;
                } else {
                    writer.write_event(Event::Text(e)).map_err(|e| e.to_string())?;
                }
            }
            Ok(Event::CData(e)) => {
                if in_command_text {
                    writer.write_event(Event::CData(BytesCData::new(new_sql)))
                        .map_err(|e| e.to_string())?;
                    dataset_updated = true;
                } else {
                    writer.write_event(Event::CData(e)).map_err(|e| e.to_string())?;
                }
            }
            Ok(Event::Eof) => break,
            Ok(e) => {
                writer.write_event(e).map_err(|e| e.to_string())?;
            }
            Err(e) => return Err(format!("XML parse error: {e}")),
        }
        buf.clear();
    }

    if !dataset_updated {
        return Err(format!("Dataset '{}' not found or has no CommandText", dataset_name));
    }

    let result = writer.into_inner().into_inner();
    std::fs::write(path, result).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(())
}

pub fn update_rdl_parameter(path: &str, param_name: &str, updated: ReportParameter) -> Result<(), String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(false);

    let mut writer = Writer::new(std::io::Cursor::new(Vec::new()));
    let mut in_target_param = false;
    let mut updated_count = 0;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let local = local_name(&e);
                if local == "ReportParameter" {
                    if let Some(name) = attr_value(&e, b"Name") {
                        if name == param_name {
                            in_target_param = true;
                            // Update the name attribute if it changed (though usually we use the name as ID)
                            let mut new_e = e.clone();
                            new_e.clear_attributes();
                            new_e.push_attribute(("Name", updated.name.as_str()));
                            writer.write_event(Event::Start(new_e)).map_err(|e| e.to_string())?;
                            buf.clear();
                            continue;
                        }
                    }
                }
                
                if in_target_param {
                    // Inside the target parameter, we skip existing simple tags and replace them later or update them
                    match local.as_str() {
                        "Prompt" | "DataType" | "Nullable" | "AllowBlank" | "MultiValue" | "Hidden" => {
                            // Skip these, we will write them in the End event of the specific tag or just before the End of ReportParameter
                            // Actually, it's easier to just write our own values and skip the original ones.
                            reader.read_to_end_into(e.name(), &mut Vec::new()).map_err(|e| e.to_string())?;
                            buf.clear();
                            continue;
                        }
                        _ => {}
                    }
                }

                writer.write_event(Event::Start(e)).map_err(|e| e.to_string())?;
            }
            Ok(Event::End(e)) => {
                let local = local_name_end(&e);
                if local == "ReportParameter" && in_target_param {
                    // Just before closing the parameter, write all our updated values
                    write_tag(&mut writer, "DataType", &updated.data_type)?;
                    write_tag(&mut writer, "Prompt", &updated.prompt)?;
                    if updated.nullable { write_tag(&mut writer, "Nullable", "true")?; }
                    if updated.allow_blank { write_tag(&mut writer, "AllowBlank", "true")?; }
                    if updated.multi_value { write_tag(&mut writer, "MultiValue", "true")?; }
                    if updated.hidden { write_tag(&mut writer, "Hidden", "true")?; }
                    
                    in_target_param = false;
                    updated_count += 1;
                }
                writer.write_event(Event::End(e)).map_err(|e| e.to_string())?;
            }
            Ok(Event::Eof) => break,
            Ok(e) => {
                if !in_target_param {
                    writer.write_event(e).map_err(|e| e.to_string())?;
                } else {
                    // If we are in the target param, we only want to preserve certain things (like DefaultValue or AvailableValues for now)
                    // But for simplicity in this MVP, let's just preserve everything except what we explicitly skip in Start event.
                    writer.write_event(e).map_err(|e| e.to_string())?;
                }
            }
            Err(e) => return Err(format!("XML parse error: {e}")),
        }
        buf.clear();
    }

    if updated_count == 0 {
        return Err(format!("Parameter '{}' not found", param_name));
    }

    let result = writer.into_inner().into_inner();
    std::fs::write(path, result).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(())
}

pub fn remove_rdl_dataset(path: &str, dataset_name: &str) -> Result<(), String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(false);

    let mut writer = Writer::new(std::io::Cursor::new(Vec::new()));
    let mut in_target_dataset = false;
    let mut removed = false;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let local = local_name(&e);
                if local == "DataSet" {
                    if let Some(name) = attr_value(&e, b"Name") {
                        if name == dataset_name {
                            in_target_dataset = true;
                            // Skip the entire DataSet element
                            reader.read_to_end_into(e.name(), &mut Vec::new()).map_err(|e| e.to_string())?;
                            removed = true;
                            buf.clear();
                            continue;
                        }
                    }
                }
                writer.write_event(Event::Start(e)).map_err(|e| e.to_string())?;
            }
            Ok(Event::End(e)) => {
                writer.write_event(Event::End(e)).map_err(|e| e.to_string())?;
            }
            Ok(Event::Eof) => break,
            Ok(e) => {
                if !in_target_dataset {
                    writer.write_event(e).map_err(|e| e.to_string())?;
                }
            }
            Err(e) => return Err(format!("XML parse error: {e}")),
        }
        buf.clear();
    }

    if !removed {
        return Err(format!("Dataset '{}' not found", dataset_name));
    }

    let result = writer.into_inner().into_inner();
    std::fs::write(path, result).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(())
}

pub fn add_rdl_parameter(path: &str, param: ReportParameter) -> Result<(), String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(false);

    let mut writer = Writer::new(std::io::Cursor::new(Vec::new()));
    let mut param_added = false;
    let mut in_params_container = false;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let local = local_name(&e);
                if local == "ReportParameters" {
                    in_params_container = true;
                }
                writer.write_event(Event::Start(e)).map_err(|e| e.to_string())?;
            }
            Ok(Event::End(e)) => {
                let local = local_name_end(&e);
                if local == "ReportParameters" && in_params_container {
                    // Add our new parameter at the end of the container
                    write_parameter_node(&mut writer, &param)?;
                    param_added = true;
                    in_params_container = false;
                } else if local == "Report" && !param_added {
                    // If we reach the end of the report and haven't added the param (container didn't exist)
                    writer.write_event(Event::Start(quick_xml::events::BytesStart::new("ReportParameters")))
                        .map_err(|e| e.to_string())?;
                    write_parameter_node(&mut writer, &param)?;
                    writer.write_event(Event::End(quick_xml::events::BytesEnd::new("ReportParameters")))
                        .map_err(|e| e.to_string())?;
                    param_added = true;
                }
                writer.write_event(Event::End(e)).map_err(|e| e.to_string())?;
            }
            Ok(Event::Eof) => break,
            Ok(e) => {
                writer.write_event(e).map_err(|e| e.to_string())?;
            }
            Err(e) => return Err(format!("XML parse error: {e}")),
        }
        buf.clear();
    }

    let result = writer.into_inner().into_inner();
    std::fs::write(path, result).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(())
}

fn write_parameter_node<W: std::io::Write>(writer: &mut Writer<W>, p: &ReportParameter) -> Result<(), String> {
    let mut start = quick_xml::events::BytesStart::new("ReportParameter");
    start.push_attribute(("Name", p.name.as_str()));
    writer.write_event(Event::Start(start)).map_err(|e| e.to_string())?;
    
    write_tag(writer, "DataType", &p.data_type)?;
    write_tag(writer, "Prompt", &p.prompt)?;
    if p.nullable { write_tag(writer, "Nullable", "true")?; }
    if p.allow_blank { write_tag(writer, "AllowBlank", "true")?; }
    if p.multi_value { write_tag(writer, "MultiValue", "true")?; }
    if p.hidden { write_tag(writer, "Hidden", "true")?; }
    
    writer.write_event(Event::End(quick_xml::events::BytesEnd::new("ReportParameter")))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn add_rdl_dataset(path: &str, ds: DataSetInfo) -> Result<(), String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(false);

    let mut writer = Writer::new(std::io::Cursor::new(Vec::new()));
    let mut ds_added = false;
    let mut in_datasets_container = false;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let local = local_name(&e);
                if local == "DataSets" {
                    in_datasets_container = true;
                }
                writer.write_event(Event::Start(e)).map_err(|e| e.to_string())?;
            }
            Ok(Event::End(e)) => {
                let local = local_name_end(&e);
                if local == "DataSets" && in_datasets_container {
                    write_dataset_node(&mut writer, &ds)?;
                    ds_added = true;
                    in_datasets_container = false;
                } else if local == "Report" && !ds_added {
                    writer.write_event(Event::Start(quick_xml::events::BytesStart::new("DataSets")))
                        .map_err(|e| e.to_string())?;
                    write_dataset_node(&mut writer, &ds)?;
                    writer.write_event(Event::End(quick_xml::events::BytesEnd::new("DataSets")))
                        .map_err(|e| e.to_string())?;
                    ds_added = true;
                }
                writer.write_event(Event::End(e)).map_err(|e| e.to_string())?;
            }
            Ok(Event::Eof) => break,
            Ok(e) => {
                writer.write_event(e).map_err(|e| e.to_string())?;
            }
            Err(e) => return Err(format!("XML parse error: {e}")),
        }
        buf.clear();
    }

    let result = writer.into_inner().into_inner();
    std::fs::write(path, result).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(())
}

fn write_dataset_node<W: std::io::Write>(writer: &mut Writer<W>, ds: &DataSetInfo) -> Result<(), String> {
    let mut start = quick_xml::events::BytesStart::new("DataSet");
    start.push_attribute(("Name", ds.name.as_str()));
    writer.write_event(Event::Start(start)).map_err(|e| e.to_string())?;
    
    writer.write_event(Event::Start(quick_xml::events::BytesStart::new("Query")))
        .map_err(|e| e.to_string())?;
    write_tag(writer, "DataSourceName", &ds.data_source_name)?;
    write_tag(writer, "CommandText", &ds.command_text)?;
    write_tag(writer, "CommandType", &ds.command_type)?;
    writer.write_event(Event::End(quick_xml::events::BytesEnd::new("Query")))
        .map_err(|e| e.to_string())?;

    // Fields are required for a dataset to be valid, but adding them automatically from SQL is hard.
    // For now, let's add a placeholder Field if none exist.
    writer.write_event(Event::Start(quick_xml::events::BytesStart::new("Fields")))
        .map_err(|e| e.to_string())?;
    
    let mut field = quick_xml::events::BytesStart::new("Field");
    field.push_attribute(("Name", "ID"));
    writer.write_event(Event::Start(field)).map_err(|e| e.to_string())?;
    write_tag(writer, "DataField", "ID")?;
    write_tag(writer, "TypeName", "System.Int32")?;
    writer.write_event(Event::End(quick_xml::events::BytesEnd::new("Field")))
        .map_err(|e| e.to_string())?;

    writer.write_event(Event::End(quick_xml::events::BytesEnd::new("Fields")))
        .map_err(|e| e.to_string())?;
    
    writer.write_event(Event::End(quick_xml::events::BytesEnd::new("DataSet")))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn write_tag<W: std::io::Write>(writer: &mut Writer<W>, tag: &str, value: &str) -> Result<(), String> {
    writer.write_event(Event::Start(quick_xml::events::BytesStart::new(tag)))
        .map_err(|e| e.to_string())?;
    writer.write_event(Event::Text(BytesText::new(value)))
        .map_err(|e| e.to_string())?;
    writer.write_event(Event::End(quick_xml::events::BytesEnd::new(tag)))
        .map_err(|e| e.to_string())?;
    Ok(())
}
