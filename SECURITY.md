# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- the **Kanboard credentials** (the application API token, or a user's
  password or personal access token), stored by Gladys in the integration
  configuration (a `secret` field), sent only to the configured Kanboard
  address in the HTTP Basic `Authorization` header, and never logged. Prefer
  a personal access token of a dedicated user to the application token, which
  sees every project;
- under `/data`, only `kanboard-state.json`: the configured address and the
  time of the last reading (no credentials, no task);
- network: outgoing HTTP(S) requests to the configured Kanboard address only.
  With "Accept self-signed certificates" ticked, the certificate of that
  address is not verified.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Kanboard itself.
