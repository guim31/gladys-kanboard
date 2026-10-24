// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+). The fields
// are strings, so a scene variable fits too (`{{triggerEvent.data.task_id}}`).
//
//   - `complete_task`: close a task, by its number or its exact title, as the
//     user of the credentials (an NFC tag by the bins, a voice command);
//   - `create_task`: add a task to a project, with an optional due date
//     ("buy bread, tomorrow" from a button);
//   - `read_today`: today's tasks as a sentence, for a message or a voice
//     announcement in the morning.
// -----------------------------------------------------------------------------

const iso = (ms) => (ms === null ? '' : new Date(ms).toISOString());

export const SCENE_ACTIONS = {
  async complete_task(hub, { fields = {} }) {
    const { task, projectName, nextDue } = await hub.complete(fields.task);
    return {
      task: task.title,
      task_id: task.id,
      project_name: projectName,
      next_due_date: iso(nextDue),
    };
  },

  async create_task(hub, { fields = {} }) {
    const { id, title, project, dueAt } = await hub.create(
      fields.title,
      fields.project,
      fields.due_date,
    );
    return { task: title, task_id: id, project_name: project.title, due_date: iso(dueAt) };
  },

  async read_today(hub, { fields = {} }) {
    return hub.today(fields.project);
  },
};
