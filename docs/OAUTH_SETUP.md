# OAuth Integration Setup Guide

This guide covers setting up Slack and Notion OAuth for Nubabel's one-click integration buttons.

## Prerequisites

- Access to Railway dashboard (production environment)
- Admin access to create Slack/Notion apps

---

## 1. Slack OAuth Setup

### Step 1: Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"**
3. Select **"From scratch"**
4. Enter:
   - **App Name**: `Nubabel`
   - **Workspace**: Select your development workspace
5. Click **"Create App"**

### Step 2: Configure OAuth Scopes

1. In the left sidebar, go to **OAuth & Permissions**
2. Under **Redirect URLs**, add:
   ```
   https://app.nubabel.com/api/slack/oauth/callback
   ```
3. Under **Bot Token Scopes**, add these scopes:
   ```
   app_mentions:read    - Respond to @mentions
   chat:write           - Send messages
   channels:history     - Read channel messages
   channels:read        - View channel info
   users:read           - Get user info
   users:read.email     - Get user emails
   im:history           - Read DMs
   im:write             - Send DMs
   ```

### Step 3: Enable Socket Mode (Optional, for events)

1. Go to **Socket Mode** in sidebar
2. Enable Socket Mode
3. Create an **App-Level Token** with `connections:write` scope
4. Save the token (starts with `xapp-`)

### Step 4: Get Credentials

1. Go to **Basic Information**
2. Copy:
   - **Client ID**
   - **Client Secret**
   - **Signing Secret**

### Step 5: Set Railway Environment Variables

In Railway dashboard, add these variables:

```bash
NUBABEL_SLACK_CLIENT_ID=<your-client-id>
NUBABEL_SLACK_CLIENT_SECRET=<your-client-secret>
SLACK_SIGNING_SECRET=<your-signing-secret>
SLACK_REDIRECT_URI=https://app.nubabel.com/api/slack/oauth/callback

# Optional: For Socket Mode (bot events)
SLACK_APP_TOKEN=xapp-<your-app-token>
```

### Step 6: Distribute the App

1. Go to **Manage Distribution**
2. Under **Share Your App with Other Workspaces**:
   - Complete all checklist items
   - Click **"Activate Public Distribution"** (if you want other workspaces to install)

---

## 2. Notion OAuth Setup

### Step 1: Create Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"+ New integration"**
3. Fill in:
   - **Name**: `Nubabel`
   - **Logo**: Upload Nubabel logo (optional)
   - **Associated workspace**: Select your workspace
4. Click **"Submit"**

### Step 2: Configure OAuth (Public Integration)

1. In the integration settings, go to **Distribution**
2. Enable **"Public integration"**
3. Under **OAuth Domain & URIs**:
   - **Redirect URI**: `https://app.nubabel.com/api/notion/oauth/callback`
4. Under **Capabilities**, enable:
   - Read content
   - Update content
   - Insert content
   - Read user information

### Step 3: Get Credentials

1. Go to **Secrets** tab
2. Copy:
   - **OAuth client ID**
   - **OAuth client secret**
   - **Internal Integration Secret** (for internal use)

### Step 4: Set Railway Environment Variables

In Railway dashboard, add these variables:

```bash
NOTION_OAUTH_CLIENT_ID=<your-oauth-client-id>
NOTION_OAUTH_CLIENT_SECRET=<your-oauth-client-secret>
NOTION_OAUTH_REDIRECT_URI=https://app.nubabel.com/api/notion/oauth/callback
```

---

## 3. Verify Setup

After setting environment variables:

1. **Redeploy** the Railway service (or wait for auto-deploy)
2. Go to `https://app.nubabel.com/settings/slack`
3. Click **"Connect to Slack"** - should redirect to Slack OAuth
4. Go to `https://app.nubabel.com/settings/notion`
5. Click **"Connect to Notion"** - should redirect to Notion OAuth

### Troubleshooting

| Error                   | Cause                   | Fix                                                             |
| ----------------------- | ----------------------- | --------------------------------------------------------------- |
| `slack_not_configured`  | Missing Slack env vars  | Add `NUBABEL_SLACK_CLIENT_ID` and `NUBABEL_SLACK_CLIENT_SECRET` |
| `notion_not_configured` | Missing Notion env vars | Add `NOTION_OAUTH_CLIENT_ID` and `NOTION_OAUTH_CLIENT_SECRET`   |
| `invalid_redirect_uri`  | Redirect URI mismatch   | Ensure Railway `*_REDIRECT_URI` matches app settings exactly    |
| `access_denied`         | User cancelled OAuth    | Normal behavior, user chose not to authorize                    |

---

## Environment Variable Reference

### Slack (Required)

| Variable                      | Description                                        |
| ----------------------------- | -------------------------------------------------- |
| `NUBABEL_SLACK_CLIENT_ID`     | From Slack App Basic Info                          |
| `NUBABEL_SLACK_CLIENT_SECRET` | From Slack App Basic Info                          |
| `SLACK_SIGNING_SECRET`        | For verifying Slack requests                       |
| `SLACK_REDIRECT_URI`          | `https://app.nubabel.com/api/slack/oauth/callback` |

### Slack (Optional - Socket Mode)

| Variable          | Description                           |
| ----------------- | ------------------------------------- |
| `SLACK_APP_TOKEN` | For Socket Mode (starts with `xapp-`) |
| `SLACK_BOT_TOKEN` | Auto-obtained via OAuth               |

### Notion (Required)

| Variable                     | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| `NOTION_OAUTH_CLIENT_ID`     | From Notion Integration                             |
| `NOTION_OAUTH_CLIENT_SECRET` | From Notion Integration                             |
| `NOTION_OAUTH_REDIRECT_URI`  | `https://app.nubabel.com/api/notion/oauth/callback` |

---

## Quick Commands

```bash
# Set Slack variables via Railway CLI
railway variables set NUBABEL_SLACK_CLIENT_ID=xxx
railway variables set NUBABEL_SLACK_CLIENT_SECRET=xxx
railway variables set SLACK_REDIRECT_URI=https://app.nubabel.com/api/slack/oauth/callback

# Set Notion variables via Railway CLI
railway variables set NOTION_OAUTH_CLIENT_ID=xxx
railway variables set NOTION_OAUTH_CLIENT_SECRET=xxx
railway variables set NOTION_OAUTH_REDIRECT_URI=https://app.nubabel.com/api/notion/oauth/callback

# Verify variables are set
railway variables | grep -E "SLACK|NOTION"
```

---

Last updated: 2026-01-30
