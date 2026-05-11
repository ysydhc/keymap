export interface ParamOption {
  title: string;
  value: string;
}

export interface ParamCondition {
  paramId: string;
  includes?: string[];
  excludes?: string[];
}

export interface Param {
  id: string;
  type: string;
  description: string;
  optional?: boolean;
  values?: string[];
  options?: ParamOption[];
  examples?: string[];
  dynamic?: string;
  showIf?: ParamCondition;
  requiredIf?: ParamCondition;
}

export interface WorkflowStep {
  id: string;
  name: string;
  cmd: string;
  originalToolId?: string;
  originalToolIds?: string[];
}

export interface Tool {
  id: string;
  title: string;
  action: string;
  keys?: string;
  mac?: string;
  win?: string;
  mode?: string;
  keyword?: string;
  aliases?: string[];
  tags?: string[];
  cmd: string;
  weight?: number;
  fixedOrder?: boolean;
  params?: Param[];
  description?: string;
  doc?: string;
  platform?: string[];
  category?: string;
  steps?: WorkflowStep[];
}

export interface ToolFile {
  aliases?: string[];
  tools: Tool[];
}

export interface Book {
  title: string;
  subtitle?: string;
  target: string;
  tags?: string[];
  baseDir?: string;
}

export interface BookFile {
  books: Book[];
}
