import type { Config } from "../config.js";
import type { JiraClient } from "./client.js";
import { ToolInputError } from "./errors.js";
import { discoverField, missingFieldHint, type FieldKind, type ResolvedField } from "./fields.js";
import type { Field, JiraUser, NamedValue } from "./types.js";

export type FieldOverrides = Pick<Config, "storyPointsField" | "sprintField">;

/**
 * Instance data that does not change during an MCP client session (the container lives as long as the
 * session). Fetched the first time it is needed; restarting the MCP server refreshes it.
 */
export class Session {
  private readonly cache = new Map<string, Promise<unknown>>();

  constructor(
    private readonly jira: JiraClient,
    private readonly overrides: FieldOverrides = {},
  ) {}

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    let value = this.cache.get(key) as Promise<T> | undefined;
    if (!value) {
      value = load();
      // Failures (e.g. network) are not cached.
      value.catch(() => this.cache.delete(key));
      this.cache.set(key, value);
    }
    return value;
  }

  myself(): Promise<JiraUser> {
    return this.cached("myself", () => this.jira.myself());
  }

  fields(): Promise<Field[]> {
    return this.cached("fields", () => this.jira.fields());
  }

  priorities(): Promise<NamedValue[]> {
    return this.cached("priorities", () => this.jira.priorities());
  }

  /** The env override wins and skips querying /field. */
  async field(kind: FieldKind): Promise<ResolvedField | undefined> {
    const override = kind === "storyPoints" ? this.overrides.storyPointsField : this.overrides.sprintField;
    if (override) return { id: override, source: "override" };
    return discoverField(kind, await this.fields());
  }

  async requireField(kind: FieldKind): Promise<ResolvedField> {
    const field = await this.field(kind);
    if (!field) throw new ToolInputError(missingFieldHint(kind));
    return field;
  }

  /** For reads: a missing field does not break the search, it is just left empty in the summary. */
  async optionalFieldIds(): Promise<{ storyPoints?: string; sprint?: string }> {
    const [storyPoints, sprint] = await Promise.all([this.field("storyPoints"), this.field("sprint")]);
    return { storyPoints: storyPoints?.id, sprint: sprint?.id };
  }
}
