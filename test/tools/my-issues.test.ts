import { describe, expect, it } from "vitest";
import { myIssues } from "../../src/tools/my-issues.js";
import { baseRoutes, data, fakeJira, fixture } from "../helpers.js";

describe("my_issues", () => {
  it("pendientes por defecto", async () => {
    const jira = fakeJira({ ...baseRoutes(), "POST /search": () => fixture("search") });

    const result = data(await jira.run(myIssues, {}));
    expect(jira.call("POST", "/search")!.body.jql).toBe(
      "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
    );
    expect(result.issues).toHaveLength(2);
  });

  it("incluyendo terminadas", async () => {
    const jira = fakeJira({ ...baseRoutes(), "POST /search": () => fixture("search") });

    await jira.run(myIssues, { include_done: true, limit: 100 });
    const body = jira.call("POST", "/search")!.body;
    expect(body.jql).toBe("assignee = currentUser() ORDER BY updated DESC");
    expect(body.maxResults).toBe(100);
  });
});
