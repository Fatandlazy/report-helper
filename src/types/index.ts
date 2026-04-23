export type Section = "explorer" | "server" | "sqleditor" | "settings";
export type TabView = "overview" | "sqltester" | "preview";

export interface ReportTab {
  id: string;
  title: string;
  path: string;          // local fs path or temp path for server reports
  source: "local" | "server";
  serverPath?: string;   // original SSRS path for preview URL
  activeView: TabView;
}

export interface WorkspaceFolder {
  path: string;
  name: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: FileTreeNode[];
  isCreating?: boolean;
}

export interface DbConnection {
  id: string;
  name: string;
  connectionString: string;
}

export interface AppSettings {
  workspaceFolders: WorkspaceFolder[];
  connections: DbConnection[];
  ssrsUrl: string;
  ssrsUsername: string;
  ssrsPassword: string;
  lastSection: Section;
  activeConnectionId: string;
  hiddenSsrsPaths: string[];
}

export interface QueryParameter {
  name: string;
  value: string;
}

export interface DataSetInfo {
  name: string;
  commandText: string;
  commandType: string;
  dataSourceName: string;
  queryParameters?: QueryParameter[];
}

export interface DataSourceInfo {
  name: string;
  connectionString: string;
}

export interface ReportMetadata {
  dataSets: DataSetInfo[];
  parameters: ReportParameter[];
  dataSources: DataSourceInfo[];
}

export interface ParameterValue {
  label: string;
  value: string;
}

export interface DataSetReference {
  dataSetName: string;
  valueField: string;
  labelField: string;
}

export interface AvailableValues {
  staticValues: ParameterValue[];
  dataSetReference?: DataSetReference;
}

export interface ReportParameter {
  name: string;
  prompt: string;
  dataType: "String" | "Integer" | "Float" | "DateTime" | "Boolean";
  defaultValue: string;
  availableValues?: AvailableValues;
  multiValue?: boolean;
  nullable?: boolean;
  allowBlank?: boolean;
  hidden?: boolean;
  defaultValueQuery?: DataSetReference;
}

export interface CatalogItem {
  id: string;
  name: string;
  path: string;
  type: "Report" | "Folder" | "DataSource" | "DataSet" | "LinkedReport";
}

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  elapsedMs: number;
}

export const SAMPLE_SQL = `SELECT
    DB_NAME()        AS current_database,
    SUSER_SNAME()    AS current_login,
    @@VERSION        AS sql_server_version,
    GETDATE()        AS server_time;`;
