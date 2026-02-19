# @crisvond/openclaw-towns-plugin

Towns channel plugin for OpenClaw.

## What it does

- Registers `channels.towns`
- Starts one Towns agent runtime per configured account
- Receives inbound webhook events and forwards to OpenClaw routing/reply pipeline
- Sends outbound text via Towns SDK (`agent.sendMessage`)
- Supports account-scoped webhook paths (`/towns/<accountId>/webhook`)

## Security posture

- Webhook registration is **separate** from local config writes
- No auto remote admin/config mutation
- Webhook handler is POST-only
- Duplicate webhook path registration is rejected
- `/towns-health` provides secret-safe diagnostics

## Config example

```json
{
  "channels": {
    "towns": {
      "enabled": true,
      "accounts": {
        "default": {
          "enabled": true,
          "appPrivateData": "...",
          "jwtSecret": "...",
          "webhookPath": "/towns/default/webhook",
          "allowFrom": ["<optional-default-stream-id>"]
        }
      }
    }
  },
  "plugins": {
    "entries": {
      "openclaw-towns-plugin": {
        "enabled": true
      }
    }
  }
}
```

## Commands

### `/connect-towns` (local config helper)

Writes local OpenClaw config for Towns account setup.

```text
/connect-towns --app-address <0x...> --app-private-data <...> --jwt-secret <...> --public-url <https://host> --account default
```

Notes:
- This writes local config only.
- It does **not** register webhooks remotely.

### `/towns-health`

Shows secret-safe diagnostics:
- account IDs
- enabled/configured status
- webhook paths
- allowFrom counts

### `/capabilities`

Shows runtime capability snapshot (wallet context, policy mode, integration readiness).

### `/policy-status`

Shows owner/policy status (mode, owner count, limits, integration toggles).

### `/policy-set`

Owner-gated policy mutation helper.

```text
/policy-set --actor-user-id <towns:user:...> [--account default] [--mode READ_ONLY|CONFIRM_ALWAYS|BOUNDED_AUTO] [--max-per-tx-usd N] [--max-per-day-usd N]
```

### `/approval` (M1 scaffold)

Creates/lists approval requests for nonce-based execution flow scaffolding.

```text
/approval --op create --account default --action executeTx --requested-by towns:user:abc --payload-hash sha256:...
/approval --op list
```

## Install

From a local checkout:

```bash
openclaw plugins install -l ./towns-openclaw-plugin
openclaw plugins enable openclaw-towns-plugin
openclaw gateway restart
```

## Recommended onboarding flow (ClawBot + OpenClaw split-host)

1. Use **ClawBot** to create app + credentials.
2. Apply generated script on the OpenClaw host (local config + restart).
3. Ensure public HTTPS reachability to `/towns/<accountId>/webhook`.
4. In ClawBot, enter webhook URL and run registration.
5. Run verify + DM self-test.

## Troubleshooting quick map

- No webhook hit: URL/reachability/tunnel/proxy issue
- Webhook `401`: app credential mismatch or wrong app identity vs registered webhook app
- Webhook `200` but no reply: policy/routing/session issue
