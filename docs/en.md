# Kanboard

Bring the tasks of your [Kanboard](https://kanboard.org) into Gladys: what is
left to do today, what is overdue, the next task of each project. A scene
reacts when a task falls due or is still open at midnight, another one adds
"buy bread, tomorrow" from a button, a tap on the dashboard closes a task, and
Gladys can read out the tasks of the day every morning.

> **Feedback welcome.** This integration was tested against a real Kanboard
> server (Docker image `kanboard/kanboard` v1.2.56, October 2026), not yet in
> everyday use. If something does not work as described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-kanboard/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A **self-hosted Kanboard** (1.2 or later), reachable from Gladys (the Docker
  image listens on port 80).
- Credentials for its API, one of the two:
  - the **application API token**: in Kanboard, **Settings** → **API**, copy
    the **API token**, with the username `jsonrpc`. It sees **every project**
    of the instance (private ones included) and needs an administrator to
    read it;
  - a **user account**: its username, and its password or a personal access
    token (**My profile** → **API**; required when two-factor authentication
    is on). It sees **the projects this user is a member of**, and acts as
    this user.

## Set up

1. In Gladys, **Integrations** → install **Kanboard**.
2. In the **Configuration** screen, fill in:
   - **Address**: the address of Kanboard, for example
     `http://192.168.1.20:8080`, or `https://kanboard.example.org/kanboard`
     when it lives in a sub-folder (the address copied from a board works too);
   - **Username**: `jsonrpc` (the default) for the application API token, or
     your Kanboard username;
   - **API token or password**: the matching secret.
3. Options:
   - **Followed projects**: names or numbers separated by commas (`Home, 3`).
     Empty: every project. Inactive (closed) projects are never followed;
   - **Accept self-signed certificates**: for an `https://` address with a
     self-signed certificate, on your own server only;
   - **Refresh interval**: 1 to 10 minutes (5 by default). Due times and
     midnight are always followed on time, whatever the interval;
   - **Language of the feature names**: the names given to the features when
     a device is added (French by default), and the texts sent to scenes.
4. Save, then **Test the connection**: it reads Kanboard and gives its
   version, the number of open tasks and of followed projects.
5. In the **Discovery** tab, add the devices you want.

## Devices

**Kanboard** (every followed project together) and **Kanboard _project_** for
each followed project. Each one has four features:

| Feature             | What it says                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `Open tasks`        | open tasks, with or without a due date                                           |
| `Tasks to do today` | open tasks due before midnight, overdue ones included: what is left by tonight   |
| `Overdue tasks`     | open tasks whose due date and time have passed                                   |
| `Next task`         | the title of the open task with the earliest due time still ahead; `None` if not |

"Today" is the day in the time zone of Gladys. In Kanboard a due date always
has a time: a date picked without one gets the time of the moment you saved it.

## Dashboard

The **Today's tasks** widget shows two tiles (to do today, overdue), the list
of the tasks of the day, overdue first, with their time (in orange for the
highest priority of the project) and their project, and a button for each of
the four most urgent: a tap closes the task. Choose a project device in the
widget settings to see only its tasks; leave it empty for every followed
project. When nothing is left, the widget says so and gives the next task.

The counters can also go on the dashboard as any device feature.

## Scenes

### Triggers

- **Kanboard task due**: an open task reached its due time.
- **Kanboard task overdue**: at midnight, a task due that day is still open.
  Once per task and due date.

Filters, for both: the project (a project device: the **Kanboard** device
filters nothing, leave the field empty for every project), the task title.
Information passed on to the actions: the task, its number, its project, its
priority (0 to 3 by default, set per project in Kanboard), its due date.

A task closed before its due time fires nothing. A due date moved by hand to
a moment before the previous reading fires nothing either: only the moments
that pass while the integration runs count. A restart does not fire anything
twice; a moment that passed while the integration was stopped fires when it
starts again, if it is less than an hour old.

### Actions

- **Close a Kanboard task**: give the exact **title** (case and accents
  ignored) or the **number** of the task (`#12`, shown on the card in
  Kanboard). Any open task the credentials see, followed project or not. A
  task that repeats "when the task is closed" leaves its next occurrence, as
  in Kanboard. Results: the task, its number, its project, the due date of
  the next occurrence.
- **Create a Kanboard task**: a title, the project by name or number (empty:
  the first followed project, by name), and an optional due date:
  `2026-10-25 18:00`, `25/10/2026`, `today`, `tomorrow 9:00`, `+3` (in three
  days), or a time alone for today; without a time, 18:00. The words also work
  in French, German and Spanish (`demain`, `morgen`, `mañana`). The date is
  read in the time zone of Gladys, whatever the one of Kanboard. Results: the
  task, its number, its project, its due date.
- **Read today's Kanboard tasks**: the tasks of the day as a sentence
  (`5 task(s) to do today: …. 2 overdue.`), for every followed project or one
  of them. Results: the sentence, the number of tasks to do today, of overdue
  tasks. Send the sentence in a message, or have Gladys say it.

The fields accept scene variables: `{{triggerEvent.data.task_id}}` closes the
task that triggered the scene.

### Scene ideas

- At 7:30, **Read today's Kanboard tasks**, then send the sentence on
  Telegram.
- **Kanboard task due** on the `Home` project: flash the hallway light.
- A button by the door runs **Create a Kanboard task** with `Buy bread` in
  `Shopping`, due `tomorrow 9:00`.
- An NFC tag on the bins runs **Close a Kanboard task** with
  `Take out the bins`.

## Troubleshooting

- **"Kanboard does not answer"**: check the address and the port from the
  Gladys machine (the address opens Kanboard in a browser).
- **"Username, token or password refused"**: with `jsonrpc`, copy the token
  of **Settings** → **API** again (it changes when regenerated); with a user,
  check the password, or use a personal access token if two-factor
  authentication is on. Kanboard locks an account after several failures.
- **"Access forbidden to this user"**: the user may not read a project, or
  the username is not `jsonrpc` for an application token.
- **"No Kanboard API at this address"**: the address answers, but not with
  the Kanboard API: check the port and the sub-folder.
- **"The address redirects"**: enter the `https://` address.
- **A project is missing**: inactive projects are not followed; with a user
  account, only its projects are seen; a name typed in **Followed projects**
  that matches no project is ignored, and **Test the connection** lists it.
- **"Several open tasks have this title"**: give the number (`#12`) instead.
- Logs: `LOG_LEVEL=debug` on the container shows every reading.

## Limits

- Kanboard is read every 1 to 10 minutes (and at each due time and at
  midnight): a task closed in Kanboard shows up in Gladys within that delay.
  Kanboard webhooks are not used.
- Two requests per reading: the projects, then the open tasks of every
  followed project in one JSON-RPC batch.
- The integration closes tasks and creates tasks; it does not edit, move,
  assign or delete them. Subtasks are not counted.
- Tested with Kanboard v1.2.56, with the application token and with a user
  account.
- Gladys keeps no Kanboard data beyond `/data/kanboard-state.json` (the time
  of the last reading, so that no event fires twice).
- Not affiliated with Kanboard.
