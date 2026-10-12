import { describe, expect, it } from "vitest";
import { createIssue } from "../../src/tools/create-issue.js";
import { baseRoutes, BASE_URL, data, fakeJira, fixture, jiraError, text, type Reply } from "../helpers.js";

function setup(extra: Record<string, Reply> = {}) {
  return fakeJira({
    ...baseRoutes(),
    "GET /issue/createmeta/PROJ/issuetypes": () => fixture("createmeta-issuetypes"),
    "GET /issue/createmeta/PROJ/issuetypes/10002": () => fixture("createmeta-fields"),
    "GET /issue/createmeta/PROJ/issuetypes/10001": () => fixture("createmeta-fields"),
    "GET /issue/createmeta/PROJ/issuetypes/10003": () => fixture("createmeta-fields"),
    "GET /issue/createmeta/PROJ/issuetypes/10200": () => fixture("createmeta-fields"),
    "GET /user": () => fixture("user-jperez"),
    "POST /issue": () => fixture("created-issue"),
    ...extra,
  });
}

describe("create_issue", () => {
  it("creación mínima de una Task", async () => {
    const jira = setup();

    const result = data(await jira.run(createIssue, { project: "proj", issue_type: "task", summary: "Agregar filtro por fecha" }));

    expect(jira.call("POST", "/issue")!.body).toEqual({
      fields: { project: { key: "PROJ" }, issuetype: { id: "10002" }, summary: "Agregar filtro por fecha" },
    });
    expect(result).toEqual({
      key: "PROJ-200",
      url: `${BASE_URL}/browse/PROJ-200`,
      issue_type: "Task",
      summary: "Agregar filtro por fecha",
    });
  });

  it("Story con todos los campos opcionales y la descripción idéntica a la enviada", async () => {
    const jira = setup();
    const description = "h2. Contexto\n*Importante*: no tocar `legacy`\n\n# paso uno\n# paso dos";

    await jira.run(createIssue, {
      project: "PROJ",
      issue_type: "Story",
      summary: "Filtro",
      description,
      priority: "high",
      labels: ["backend", "reports"],
      due_date: "2026-10-16",
      story_points: 5,
      assignee: "jperez",
    });

    expect(jira.call("GET", "/user")!.query.get("username")).toBe("jperez");
    expect(jira.call("POST", "/issue")!.body.fields).toEqual({
      project: { key: "PROJ" },
      issuetype: { id: "10001" },
      summary: "Filtro",
      description,
      priority: { id: "2" },
      labels: ["backend", "reports"],
      duedate: "2026-10-16",
      customfield_10106: 5,
      assignee: { name: "jperez" },
    });
  });

  it('asignado "yo" usa el usuario actual sin consultar /user', async () => {
    const jira = setup();

    await jira.run(createIssue, { project: "PROJ", issue_type: "Spike", summary: "Investigar", assignee: "yo" });
    expect(jira.call("POST", "/issue")!.body.fields).toMatchObject({ issuetype: { id: "10200" }, assignee: { name: "avanzato" } });
    expect(jira.call("GET", "/user")).toBeUndefined();
  });

  it("Sub-task con padre", async () => {
    const jira = setup();

    await jira.run(createIssue, { project: "PROJ", issue_type: "Sub-task", parent: "PROJ-100", summary: "Tests" });
    expect(jira.call("POST", "/issue")!.body.fields).toMatchObject({ issuetype: { id: "10003" }, parent: { key: "PROJ-100" } });
  });

  it("Sub-task sin padre → error sin escribir", async () => {
    const jira = setup();

    const result = await jira.run(createIssue, { project: "PROJ", issue_type: "subtask", summary: "Tests" });
    expect(text(result)).toMatch(/Una Sub-task requiere issue padre/);
    expect(jira.writes()).toHaveLength(0);
  });

  it("tipo inexistente en el proyecto → tipos disponibles, sin crear", async () => {
    const jira = setup({
      "GET /issue/createmeta/PROJ/issuetypes": () => ({
        ...fixture("createmeta-issuetypes"),
        values: fixture("createmeta-issuetypes").values.filter((t: { name: string }) => t.name !== "Spike"),
      }),
    });

    const result = await jira.run(createIssue, { project: "PROJ", issue_type: "Spike", summary: "x" });
    expect(text(result)).toBe('No existe tipo de issue en PROJ "Spike". Opciones válidas: "Task", "Bug", "Story", "Sub-task".');
    expect(jira.writes()).toHaveLength(0);
  });

  it("campo obligatorio faltante → lo nombra con sus valores, sin crear", async () => {
    const meta = fixture("createmeta-fields");
    meta.values.push({
      required: true,
      name: "Component/s",
      fieldId: "components",
      hasDefaultValue: false,
      allowedValues: [{ id: "1", name: "API" }, { id: "2", name: "Web" }],
    });
    const jira = setup({ "GET /issue/createmeta/PROJ/issuetypes/10004": () => meta });

    const result = await jira.run(createIssue, { project: "PROJ", issue_type: "Bug", summary: "x" });
    expect(text(result)).toMatch(/Faltan campos obligatorios para crear una Bug en PROJ: Component\/s \(valores posibles: API, Web\)/);
    expect(jira.writes()).toHaveLength(0);
  });

  it("story points fuera de la pantalla de creación → error accionable, sin crear", async () => {
    const meta = fixture("createmeta-fields");
    meta.values = meta.values.filter((f: { fieldId: string }) => f.fieldId !== "customfield_10106");
    const jira = setup({ "GET /issue/createmeta/PROJ/issuetypes/10002": () => meta });

    const result = await jira.run(createIssue, { project: "PROJ", issue_type: "Task", summary: "x", story_points: 3 });
    expect(text(result)).toMatch(/no permite cargar story_points al crear una Task.*update_issue/);
    expect(jira.writes()).toHaveLength(0);
  });

  it("usuario inexistente → error sin crear", async () => {
    const jira = setup({ "GET /user": () => jiraError(404, { errorMessages: ["User does not exist"], errors: {} }) });

    const result = await jira.run(createIssue, { project: "PROJ", issue_type: "Task", summary: "x", assignee: "jperezz" });
    expect(text(result)).toMatch(/El usuario "jperezz" no existe en Jira/);
    expect(jira.writes()).toHaveLength(0);
  });

  it("proyecto inexistente → error claro", async () => {
    const jira = setup({ "GET /issue/createmeta/NOPE/issuetypes": () => jiraError(404) });

    expect(text(await jira.run(createIssue, { project: "NOPE", issue_type: "Task", summary: "x" }))).toMatch(
      /El proyecto "NOPE" no existe o no tenés permiso para crear issues/,
    );
  });

  it("falta el summary → error sin requests", async () => {
    const jira = setup();
    expect(text(await jira.run(createIssue, { project: "PROJ", issue_type: "Task", summary: "  " }))).toMatch(/El summary es obligatorio/);
    expect(jira.calls).toHaveLength(0);
  });

  it("error de Jira al crear → se devuelve como error de la tool", async () => {
    const jira = setup({ "POST /issue": () => jiraError(400, { errorMessages: [], errors: { summary: "Summary is too long" } }) });

    const result = await jira.run(createIssue, { project: "PROJ", issue_type: "Task", summary: "x" });
    expect(text(result)).toBe("Jira rechazó la operación (400): summary: Summary is too long");
  });
});
