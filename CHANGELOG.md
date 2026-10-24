# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-24

### Added

- A **Kanboard** device for every followed project together and one per
  followed project, with the open tasks, the tasks to do today (overdue ones
  included), the overdue tasks and the next task.
- Works with the application API token (user `jsonrpc`, every project) or a
  user account (password or personal token, its projects).
- The **Today's tasks** dashboard widget: tasks of the day, overdue first,
  with a button to close each of the four most urgent.
- Scene triggers **Kanboard task due** and **Kanboard task overdue** (at
  midnight), filtered by project and title, fired once each, also across
  restarts.
- Scene actions **Close a Kanboard task**, **Create a Kanboard task** (with an
  optional due date such as `tomorrow 9:00`, read in the time zone of Gladys)
  and **Read today's Kanboard tasks** (a sentence for a message or a voice
  announcement).
- Due times and local midnight followed on time, whatever the refresh
  interval (1 to 10 minutes).
- Documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-kanboard/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-kanboard/releases/tag/v1.0.0
