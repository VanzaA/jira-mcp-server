// Subset of the Jira Server REST API v2 responses used by the server.

export interface ServerInfo {
  baseUrl?: string;
  version: string;
  deploymentType?: string;
  serverTitle?: string;
}

export interface JiraUser {
  name: string;
  key?: string;
  displayName: string;
  emailAddress?: string;
  active?: boolean;
  timeZone?: string;
}

export interface FieldSchema {
  type?: string;
  items?: string;
  system?: string;
  custom?: string;
  customId?: number;
}

export interface Field {
  id: string;
  name: string;
  custom: boolean;
  schema?: FieldSchema;
}

export interface NamedValue {
  id: string;
  name: string;
}

export interface Status extends NamedValue {
  statusCategory?: { key: string; name: string };
}

export interface IssueType extends NamedValue {
  subtask: boolean;
}

export interface IssueRef {
  id?: string;
  key: string;
  fields?: {
    summary?: string;
    status?: Status;
    issuetype?: IssueType;
  };
}

export interface IssueFields {
  summary?: string;
  description?: string | null;
  issuetype?: IssueType;
  status?: Status;
  priority?: NamedValue | null;
  assignee?: JiraUser | null;
  reporter?: JiraUser | null;
  duedate?: string | null;
  labels?: string[];
  parent?: IssueRef;
  subtasks?: IssueRef[];
  created?: string;
  updated?: string;
  timetracking?: { timeSpent?: string; timeSpentSeconds?: number };
  [customField: string]: unknown;
}

export interface Issue {
  id: string;
  key: string;
  fields: IssueFields;
}

export interface SearchResult {
  startAt: number;
  maxResults: number;
  total: number;
  issues: Issue[];
}

export interface TransitionField {
  required: boolean;
  name: string;
  allowedValues?: Array<{ id: string; name?: string; value?: string }>;
}

export interface Transition {
  id: string;
  name: string;
  to: Status;
  fields?: Record<string, TransitionField>;
}

/** Page of the Jira 9+ createmeta APIs (/issue/createmeta/{project}/issuetypes[/{id}]). */
export interface MetaPage<T> {
  startAt?: number;
  maxResults?: number;
  total?: number;
  isLast?: boolean;
  values: T[];
}

export interface CreateMetaField {
  fieldId: string;
  name: string;
  required: boolean;
  hasDefaultValue?: boolean;
  allowedValues?: Array<{ id: string; name?: string; value?: string }>;
}

export interface CreatedIssue {
  id: string;
  key: string;
}

export interface Worklog {
  id: string;
  started: string;
  timeSpent: string;
  timeSpentSeconds?: number;
  comment?: string;
}

export interface IssueUpdatePayload {
  fields?: Record<string, unknown>;
  update?: Record<string, Array<Record<string, unknown>>>;
}

export interface TransitionPayload {
  transition: { id: string };
  fields?: Record<string, unknown>;
}

export interface WorklogPayload {
  timeSpent: string;
  started: string;
  comment?: string;
}
