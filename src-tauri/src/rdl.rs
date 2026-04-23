use quick_xml::events::Event;
use quick_xml::reader::Reader;
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
