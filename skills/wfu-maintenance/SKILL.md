---
name: wfu-maintenance
description: Turn the wfu.edu down/maintenance page on or off for an environment using the `wfuwp maintenance` CLI. Use when the user asks to put a WFU WordPress environment (dev/uat/pprd/prod) into maintenance mode, show a down/outage page, take a site offline for planned work, bring it back online, check whether the maintenance page is on, or let themselves bypass it while it is up. Examples - "/wfu-maintenance status prod", "put prod in maintenance mode", "turn on the down page for uat", "is the maintenance page on for prod", "bring wfu.edu back online", "take pprd down for the deploy".
---

# WFU Maintenance Page Skill

This skill operates the wfu.edu down/maintenance page through the
`wfuwp maintenance` command. The switch is an AWS Application Load
Balancer listener rule (a tagged fixed-response rule), not a WordPress
plugin. When ON, every visitor sees the page except the application
loopback and any explicit bypass IPs.

There are exactly **two pages**, identical across every environment:

- **maintenance** (default) — calm planned-work message.
- **down** — full unplanned-outage page (emergency info, resources).

## CRITICAL: run the preflight gate first, every time

Before running ANY `wfuwp maintenance` subcommand, run these checks in
order. If any gate fails, STOP and report it to the user. Do not attempt
maintenance actions until all gates pass.

### Gate 1 — `wfuwp` installed and at the required version

The maintenance command requires **wfuwp >= 0.30.0**.

```bash
need=0.30.0
have=$(wfuwp --version 2>/dev/null | tr -d '[:space:]')
if [ -z "$have" ] || [ "$(printf '%s\n%s\n' "$need" "$have" | sort -V | head -n1)" != "$need" ]; then
  echo "wfuwp missing or older than $need (found '${have:-none}') - updating..."
  npm i -g wfuwp@latest
fi
wfuwp --version
```

- If `npm i -g` fails with `EACCES`/permission errors, STOP and tell the
  user to install/update it themselves (`npm i -g wfuwp@latest`, possibly
  with their node version manager) — do not use `sudo` automatically.
- After updating, re-verify `wfuwp --version` is >= 0.30.0 before
  continuing.

### Gate 2 — AWS CLI installed

```bash
aws --version
```

If this fails, STOP. Tell the user to install the AWS CLI
(`brew install awscli` on macOS) and re-run.

### Gate 3 — AWS authenticated for the WFU account

```bash
aws sts get-caller-identity --query Account --output text
```

- Must succeed and return the WFU account id **`841310976649`**.
- If it errors or times out, the session is not authenticated. STOP and
  tell the user to run `aws sso login` (or their org's equivalent)
  themselves, then retry. Do NOT attempt the login for them.
- If it returns a different account id, STOP and tell the user they are
  authenticated to the wrong AWS account.

Only after Gates 1-3 pass may you run maintenance subcommands.

## Operating the maintenance page

All subcommands require `--env <dev|uat|pprd|prod>`. There is no default
environment — always pass `--env` explicitly and confirm which one the
user means.

### status (read-only, safe)

```bash
wfuwp maintenance status --env <env>
```

Reports ON/OFF, which page, any bypass IPs, and verifies the live URL.
Always safe to run; use it to confirm state before and after changes.

### on — take the environment offline

```bash
wfuwp maintenance on --env <env> [--page maintenance|down] [--allow-me]
```

- `--page` defaults to `maintenance` (planned work). Use `--page down`
  for an unplanned outage page.
- `--allow-me` adds your current public IP to the bypass rule so you can
  still reach the real site. Unavailable on prod.
- **prod safety:** turning prod ON takes all of wfu.edu offline for the
  public. Never run `on --env prod` without explicit user confirmation in
  the chat for that specific action. The CLI itself also requires typing
  `prod` to confirm — let that prompt through; do not auto-bypass it with
  `--yes` on prod unless the user explicitly asked for an unattended run.

### off — bring the environment back online

```bash
wfuwp maintenance off --env <env>
```

Restores the exact pre-maintenance state and clears any bypass, so what
you see is what the public sees. Run `status` afterward to confirm the
site is live and bypass is cleared.

### allow-me / revoke-me (non-prod only)

```bash
wfuwp maintenance allow-me --env <env>
wfuwp maintenance revoke-me --env <env>
```

Add or clear your current public IP on the bypass rule. Disabled on prod
by design.

### init (dev/uat only)

```bash
wfuwp maintenance init --env <dev|uat>
```

Provisions the standardized ALB rules. Only needed once per env; refuses
pprd and prod. dev, uat, and pprd are already standardized — you should
not normally need this.

## Safety rules

- prod and pprd are production-grade. Treat every prod action as
  destructive (it takes the whole university site offline). Confirm the
  exact environment and action with the user before running `on`/`off`
  against prod or pprd.
- Always `status` before and after a change and report the verified
  result, including the propagation note the CLI prints.
- If verification reports your IP is allowlisted by a higher-priority
  forward rule, relay that note verbatim — it means you cannot self-verify
  from that network, not that the change failed.
- Never modify ALB rules by hand as part of this skill; only use
  `wfuwp maintenance`. The manual ELB procedure is a documented fallback
  for humans when the CLI is unavailable, not for this skill.

## When something is wrong

- `wfuwp maintenance` reports "not standardized" for an env → that env is
  missing its tagged rules. For dev/uat run `init`; for pprd/prod stop and
  escalate (do not attempt to fix prod/pprd rules from this skill).
- AWS session expired mid-task → re-run Gate 3; have the user
  `aws sso login` again.
- Unsure which page or environment the user wants → ask before acting.
  Defaulting wrong here takes a site offline.
