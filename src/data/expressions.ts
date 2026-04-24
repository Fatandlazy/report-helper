export interface ExpressionSnippet {
  label: string;
  insertText: string;
  detail: string;
  documentation?: string;
}

export const RDL_EXPRESSIONS: ExpressionSnippet[] = [
  {
    label: "IIf (If-Then-Else)",
    insertText: "=IIf(${1:Condition}, ${2:TrueValue}, ${3:FalseValue})",
    detail: "Conditional logic",
  },
  {
    label: "Sum",
    insertText: "=Sum(Fields!${1:FieldName}.Value)",
    detail: "Sum of a field",
  },
  {
    label: "Format Date",
    insertText: "=Format(${1:Fields!Date.Value}, \"dd/MM/yyyy\")",
    detail: "Format date to string",
  },
  {
    label: "CountRows",
    insertText: "=CountRows(\"${1:DataSetName}\")",
    detail: "Count rows in a dataset",
  },
  {
    label: "Lookup",
    insertText: "=Lookup(Fields!${1:Key}.Value, Fields!${2:SourceKey}.Value, Fields!${3:ResultField}.Value, \"${4:DataSetName}\")",
    detail: "Lookup value from another dataset",
  },
  {
    label: "Parameters Reference",
    insertText: "=Parameters!${1:ParamName}.Value",
    detail: "Reference a report parameter",
  },
  {
    label: "Globals Reference",
    insertText: "=Globals!${1:PageNumber}",
    detail: "Reference global variables (PageNumber, TotalPages, etc.)",
  }
];
