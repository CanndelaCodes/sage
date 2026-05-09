---
summary: "Install Sage, onboard the Gateway, and pair your first channel."
read_when:
  - You want the fastest path from install to a working Gateway
title: "Quick start"
---

<Note>
Sage requires Node 22 or newer.
</Note>

## Install

<Tabs>
  <Tab title="npm">
    ```bash
    npm install -g sage@latest
    ```
  </Tab>
  <Tab title="pnpm">
    ```bash
    pnpm add -g sage@latest
    ```
  </Tab>
</Tabs>

## Onboard and run the Gateway

<Steps>
  <Step title="Onboard and install the service">
    ```bash
    sage onboard --install-daemon
    ```
  </Step>
  <Step title="Pair WhatsApp">
    ```bash
    sage channels login
    ```
  </Step>
  <Step title="Start the Gateway">
    ```bash
    sage gateway --port 18789
    ```
  </Step>
</Steps>

After onboarding, the Gateway runs via the user service. You can still run it manually with `sage gateway`.

<Info>
Switching between npm and git installs later is easy. Install the other flavor and run
`sage doctor` to update the gateway service entrypoint.
</Info>

## From source (development)

```bash
git clone https://github.com/sage/sage.git
cd sage
pnpm install
pnpm ui:build # auto-installs UI deps on first run
pnpm build
sage onboard --install-daemon
```

If you do not have a global install yet, run onboarding via `pnpm sage ...` from the repo.

## Multi instance quickstart (optional)

```bash
SAGE_CONFIG_PATH=~/.sage/a.json \
SAGE_STATE_DIR=~/.sage-a \
sage gateway --port 19001
```

## Send a test message

Requires a running Gateway.

```bash
sage message send --target +15555550123 --message "Hello from Sage"
```
