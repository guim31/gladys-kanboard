# Kanboard for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the tasks of a self-hosted [Kanboard](https://kanboard.org) into
Gladys, over the local network: what is left to do today, what is overdue,
due tasks as scene triggers, and tasks closed or created from a scene or the
dashboard.

> **Feedback welcome.** The integration was checked against a real Kanboard
> server (Docker image `kanboard/kanboard` v1.2.56, October 2026), but not yet
> in everyday use with a real Gladys. Please report what works and what does
> not in the [issues](https://github.com/guim31/gladys-kanboard/issues).

## Features

- **A "Kanboard" device** for every followed project together, and **one
  device per followed project** (all active projects by default, or a list of
  names or numbers), each with four features: _open tasks_, _tasks to do
  today_ (overdue ones included), _overdue tasks_ and the _next task_ (text).
- **Dashboard widget** "Today's tasks": two tiles, the list of the tasks of the
  day (overdue first, time, project, highest priority in orange) and a button
  to close each of the four most urgent; for every project or one.
- **Scene triggers**: _Kanboard task due_ and _Kanboard task overdue_ (at
  midnight, the task of the day still open); filters on the project and the
  title; the task, its number, project, priority and due date as variables.
  Once each, across restarts.
- **Scene actions**: _Close a Kanboard task_ (title or number; a task
  repeating on close gives its next due date), _Create a Kanboard task_ (in a
  project by name or number, with an optional due date such as
  `tomorrow 9:00`) and _Read today's Kanboard tasks_ (a sentence for a message
  or a voice announcement).
- On time: besides the refresh interval (1 to 10 minutes, 5 by default), the
  integration reads Kanboard at each due time and at local midnight (the time
  zone of Gladys).
- Either credentials: the **application API token** (user `jsonrpc`, every
  project) or a **user account** (password or personal token, its projects).
- A **Test the connection** button, a connection status that names the
  problem (credentials refused, access forbidden, no Kanboard at this
  address, certificate…), and a transport badge per device.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions).
- A **self-hosted Kanboard** (1.2 or later), reachable from Gladys, and either
  its application API token (Settings → API) or a user's credentials.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-kanboard`
   (or install **Kanboard** from the catalog once it is listed).
2. In **Configuration**, enter the address of Kanboard
   (`http://192.168.1.20:8080`, `https://example.org/kanboard`…), the username
   (`jsonrpc` for the application token) and the token or password. Save,
   then click **Test the connection**.
3. Open the **Discover** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The integration uses the JSON-RPC API of Kanboard, `POST /jsonrpc.php`, with
HTTP Basic credentials:

| Procedure                               | Use                                                |
| --------------------------------------- | -------------------------------------------------- |
| `getVersion`                            | version, "is this Kanboard"                        |
| `getAllProjects` / `getMyProjects`      | projects (application token / user account)        |
| `getAllTasks(project_id, 1)`            | open tasks, one call per project in a single batch |
| `getTask`, `closeTask`                  | close a task, find the next occurrence of a repeat |
| `createTask`, `updateTask` (`date_due`) | create a task, correct its due date once if needed |

Kanboard reads a due date written as text in its own time zone, which Gladys
does not know: the integration sends it in the time zone of Gladys, reads the
task back and corrects the date once when the two differ. Kanboard is read on
a timer of the container; the devices are published with `should_poll: false`.
States are published only when they change, and every 12 hours otherwise.
The scene events are the moments (due time, end of the due day) crossed since
the previous reading; the time of the last reading is kept in
`/data/kanboard-state.json`. Kanboard webhooks are not used.

## Checked on a real Kanboard, and what was not

Checked against `kanboard/kanboard` v1.2.56 (SQLite) in a Docker network:
three projects (one inactive), an ordinary user member of one of them, tasks
due in the past, today and later, undated, a high priority one, a closed one,
tasks repeating on close and on the last column, all created through the API,
with Kanboard in UTC and Gladys in Paris time. The real answers are in
`test/fixtures/kanboard/` and drive the tests; the client ran in the
integration's own container under the Gladys sandbox limits (read-only root,
no capabilities, 256 MB) against that server, with the application token and
with the user account, then the whole integration against the SDK's fake
Gladys.

Not checked: a real Gladys instance, Kanboard behind a reverse proxy in a
sub-folder, a PostgreSQL or MySQL Kanboard, versions older than 1.2.56.

## Limitations

- Closes tasks and creates tasks; does not edit, move, assign or delete.
- A change made in Kanboard shows up within the refresh interval.
- Subtasks are not counted.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Kanboard (`test/helpers/fakeKanboard.js`) built from real
answers. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Kanboard](https://kanboard.org) by Frédéric Guillot and contributors (MIT):
  the integration only talks to its API; no code was copied. The cover uses
  the Kanboard logo from its
  [repository](https://github.com/kanboard/kanboard)
  (`assets/img/inkscape-optimized-icon.svg`), to name
  the service.
- The features, the architecture and the tests follow
  [gladys-vikunja](https://github.com/guim31/gladys-vikunja) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Kanboard. The
Kanboard name and logo belong to their owners.

## License

Apache-2.0
