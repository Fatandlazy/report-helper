export interface SqlSnippet {
  label: string;
  insertText: string;
  detail: string;
  documentation?: string;
}

export const SQL_SNIPPETS: SqlSnippet[] = [
  {
    label: "SELECT TOP 100",
    insertText: "SELECT TOP 100 * FROM ${1:TableName}",
    detail: "Select first 100 rows",
  },
  {
    label: "JOIN",
    insertText: "INNER JOIN ${1:TableName} ON ${2:Table1.Id} = ${1:TableName}.${3:Id}",
    detail: "Inner join template",
  },
  {
    label: "SSRS Parameter Date Range",
    insertText: "WHERE ${1:DateField} BETWEEN @StartDate AND @EndDate",
    detail: "Standard SSRS date range filter",
  },
  {
    label: "SSRS Multi-value Parameter",
    insertText: "WHERE ${1:Field} IN (@${2:ParameterName})",
    detail: "Filter by multi-value parameter",
  },
  {
    label: "Stored Proc Template",
    insertText: "CREATE PROCEDURE ${1:usp_ReportName}\n    @${2:Param1} NVARCHAR(50),\n    @${3:Param2} INT\nAS\nBEGIN\n    SET NOCOUNT ON;\n    \n    SELECT * FROM ${4:TableName} WHERE ...\nEND",
    detail: "Create stored procedure template",
  },
  {
    label: "Safe Transaction",
    insertText: "BEGIN TRANSACTION;\n\n${1:-- Your SQL here}\n\n-- ROLLBACK; -- Uncomment to revert\n-- COMMIT;   -- Uncomment to save",
    detail: "Transaction wrapper for safe execution",
  }
];
