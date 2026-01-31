# E2E QA Flows for app.nubabel.com

## Overview

This document defines 10 critical E2E user flows for Nubabel - a multi-tenant AI Agent Orchestration SaaS platform. Each flow tests the dual-interface requirement (WebUI + Slack Agent) and includes copy-paste prompts for autonomous QA execution.

**Testing Infrastructure:**
- WebUI: `app.nubabel.com` (Claude in Chrome)
- Slack Agent: `@Nubabel` in `#it-test` channel
- Backend: Railway PaaS deployment
- Auth: Google Workspace OAuth

---

## Slack Command Reference

Understanding the three command interfaces:

| Format | Description | Example |
|--------|-------------|---------|
| `/nubabel <cmd>` | General slash commands for platform features | `/nubabel help`, `/nubabel status`, `/nubabel mcp list` |
| `/ar <cmd>` | AR-specific slash commands for Agent Resource management | `/ar status`, `/ar workload`, `/ar approve 123` |
| `@Nubabel <message>` | Natural language mentions that invoke the AI agent | `@Nubabel summarize this channel`, `@Nubabel what time is it?` |

**Key Differences:**
- Slash commands (`/nubabel`, `/ar`) return structured, ephemeral responses
- Mentions (`@Nubabel`) invoke the AI agent for conversational/complex tasks

---

## Build Command Reference

When fixing issues, use the correct build command based on file location:

| File Location | Build Command |
|---------------|---------------|
| `/Users/sean/Documents/Kyndof/tools/nubabel/src/**` | `cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build` |
| `/Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/**` | `cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build` |
| Both backend and frontend changes | Run BOTH build commands |

---

## Flow Definitions

### Flow 1: Google OAuth Login and Dashboard Access

| Attribute | Value |
|-----------|-------|
| **Purpose** | Verify users can authenticate via Google OAuth and land on a functional dashboard |
| **Entry Point** | `https://app.nubabel.com/login` |
| **Success Criteria** | User sees Dashboard with stats cards (Total Runs, Active Users, Total Cost, Errors), Quick Actions, and Activity Feed components rendered |
| **Priority** | HIGH |
| **Risk** | OAuth redirect failures, session cookie issues, protected route bypass |
| **Prerequisites** | None (entry point flow) |

**WebUI Steps:**
1. Navigate to `/login`
2. Click "Sign in with Google" button
3. Complete Google OAuth flow
4. Verify redirect to `/dashboard`
5. Confirm all 4 stat cards render
6. Confirm Quick Actions panel visible
7. Confirm Activity Feed visible

**Slack Verification:**
- N/A (login is WebUI-only)

---

### Flow 2: Slack Agent Basic Interaction

| Attribute | Value |
|-----------|-------|
| **Purpose** | Verify @Nubabel responds to mentions and slash commands in Slack |
| **Entry Point** | Slack `#it-test` channel, `/nubabel help` |
| **Success Criteria** | Bot responds with help message listing all available commands |
| **Priority** | HIGH |
| **Risk** | Slack signature verification failure, workspace not connected, user identity resolution failure |
| **Prerequisites** | None (independent entry point) |

**Slack Steps:**
1. In `#it-test`, type `/nubabel help`
2. Verify ephemeral response with command list
3. Type `/nubabel status`
4. Verify response shows "Bot is online", organization name, session count
5. Type `/nubabel whoami`
6. Verify response shows user name, email, role, Slack ID

**WebUI Verification:**
- Check Settings > Slack integration shows "Connected" status

---

### Flow 3: Approval Workflow (Human-in-the-Loop)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Verify approvals can be created, viewed in WebUI, and responded to via Slack |
| **Entry Point** | `https://app.nubabel.com/approvals` + Slack reactions |
| **Success Criteria** | Pending approval visible in WebUI, Slack notification received, approval/rejection updates status in real-time |
| **Priority** | HIGH |
| **Risk** | SSE connection failure, approval expiration race condition, multi-approver conflict |
| **Prerequisites** | Flow 1 (Login) must pass; Flow 2 (Slack) should pass for Slack approvals |

**WebUI Steps:**
1. Navigate to `/approvals`
2. Verify filter controls (status, type) work
3. If pending approvals exist, click Approve/Reject button
4. Verify status badge updates immediately
5. Check pagination works if >20 approvals

**Slack Steps:**
1. When approval notification arrives, click "Approve" or "Reject" button
2. Verify in-channel confirmation message
3. Check WebUI reflects the updated status

---

### Flow 4: AR System (Agent Resource Management)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Verify AR dashboard displays departments, positions, assignments, and workload metrics |
| **Entry Point** | `https://app.nubabel.com/ar` + `/ar status` in Slack |
| **Success Criteria** | AR Dashboard shows 4 stat cards with counts; Slack `/ar status` returns same data |
| **Priority** | MEDIUM |
| **Risk** | Empty state handling, workload calculation errors |
| **Prerequisites** | Flow 1 (Login) must pass; Flow 2 (Slack) should pass for Slack commands |

**WebUI Steps:**
1. Navigate to `/ar`
2. Verify 4 stat cards (Departments, Positions, Assignments, Pending Approvals)
3. Click each card to verify navigation to detail pages
4. Navigate to `/ar/workload` and verify workload bars render
5. Navigate to `/ar/approvals` and test approve/reject flow

**Slack Steps (using `/ar` slash command):**
1. Type `/ar status` (Korean alias: `/ar 상태`)
2. Verify response shows department count, position count, assignment count
3. Type `/ar workload` (Korean alias: `/ar 워크로드`)
4. Verify ASCII workload bars with percentages
5. Type `/ar help` (Korean alias: `/ar 도움말`) and verify bilingual command list

**Supported Korean Aliases:**
| Korean | English |
|--------|---------|
| `상태` | `status` |
| `워크로드` | `workload` |
| `이슈` | `issues` |
| `승인` | `approve` |
| `반려` | `reject` |
| `도움말` | `help` |

---

### Flow 5: Marketplace Extension Discovery

| Attribute | Value |
|-----------|-------|
| **Purpose** | Verify users can browse, search, and view extension details in the marketplace |
| **Entry Point** | `https://app.nubabel.com/marketplace` |
| **Success Criteria** | Extensions load with cards, search filters work, category navigation functional, extension detail page accessible |
| **Priority** | MEDIUM |
| **Risk** | Empty search results, infinite scroll bugs, extension installation failures |
| **Prerequisites** | Flow 1 (Login) must pass |

**WebUI Steps:**
1. Navigate to `/marketplace`
2. Verify featured extensions carousel (if present)
3. Verify extension cards render with name, description, stats
4. Use search box to filter extensions
5. Click a category to filter
6. Click an extension card to view detail page
7. Verify pricing, install button, and reviews section

**Slack Steps (using `/nubabel` slash command):**
1. Type `/nubabel mcp list`
2. Verify recommended MCP servers list
3. Type `/nubabel mcp search database`
4. Verify search results with server names and descriptions
5. Type `/nubabel mcp info @anthropic/mcp-server-git`
6. Verify installation instructions and config displayed

---

### Flow 6: Claude Connect Token Setup

| Attribute | Value |
|-----------|-------|
| **Purpose** | Verify users can connect Claude Max accounts via the token capture flow |
| **Entry Point** | `https://app.nubabel.com/claude-connect` |
| **Success Criteria** | Session initialized, bookmarklet/console script generated, token poll works, account naming and priority setting successful |
| **Priority** | MEDIUM |
| **Risk** | Session timeout, token validation failure, polling race condition |
| **Prerequisites** | Flow 1 (Login) must pass |

**WebUI Steps:**
1. Navigate to `/claude-connect`
2. Verify "Quick Connect" tab is default
3. Switch to "Manual" tab
4. Verify session code generated
5. Verify bookmarklet code displayed
6. Verify console script displayed
7. Test "Copy" buttons work
8. If token received, verify naming step appears
9. Set nickname and priority, submit
10. Verify success confirmation

**Token Testing Note:**
- Steps 8-10 require a valid Claude token from claude.ai
- In automated runs, verify steps 1-7 (UI rendering, copy functionality)
- For full token validation, manual testing with actual token is required

---

### Flow 7: Agent Activity Real-time Monitoring

| Attribute | Value |
|-----------|-------|
| **Purpose** | Verify SSE-based real-time agent activity feed works |
| **Entry Point** | `https://app.nubabel.com/activity` |
| **Success Criteria** | SSE connection established, agent events stream in real-time, tree view renders agent hierarchy, account pool status visible |
| **Priority** | MEDIUM |
| **Risk** | SSE connection drops, event parsing errors, memory leak from unbounded event list |
| **Prerequisites** | Flow 1 (Login) must pass; Flow 2 (Slack) should pass for event triggering |

**WebUI Steps:**
1. Navigate to `/activity`
2. Verify event filter dropdown works
3. Verify agent tree component renders
4. Verify account pool status component renders
5. Trigger an agent action (via Slack or another tab)
6. Verify event appears in real-time without refresh
7. Verify events list limited to 100 items

**Slack Steps (using `@Nubabel` mention):**
1. Type `@Nubabel summarize this channel`
2. Check Activity page shows agent:started event
3. Wait for completion, verify agent:completed event

**SSE Verification Methods:**
1. **Primary (DevTools):** Open DevTools > Network tab, filter by "eventsource" or look for `/api/events`
2. **Alternative (Console):** Run `console.log(window.performance.getEntriesByType('resource').filter(r => r.name.includes('events')))`
3. **Alternative (Visual):** Trigger Slack agent, observe real-time event appearance on page

---

### Flow 8: Settings and Integration Configuration

| Attribute | Value |
|-----------|-------|
| **Purpose** | Verify users can view/update profile, organization settings, and integrations |
| **Entry Point** | `https://app.nubabel.com/settings` |
| **Success Criteria** | Profile name editable, organization info displayed, Slack/Notion/Calendar integration pages accessible |
| **Priority** | LOW |
| **Risk** | Profile save failure, logout-all session invalidation, OAuth reconnection issues |
| **Prerequisites** | Flow 1 (Login) must pass |

**WebUI Steps:**
1. Navigate to `/settings`
2. Edit profile name and save
3. Verify success alert
4. Navigate to `/settings/slack`
5. Verify Slack workspace connection status
6. Navigate to `/settings/notion`
7. Verify Notion integration status
8. Navigate to `/settings/google-calendar`
9. Verify Google Calendar connection status
10. Return to `/settings`, click "Logout from all devices"
11. Verify redirect to login page

---

### Flow 9: OKR Management

| Attribute | Value |
|-----------|-------|
| **Purpose** | Verify OKR page renders without errors and displays objectives |
| **Entry Point** | `https://app.nubabel.com/okr` |
| **Success Criteria** | Page loads without console errors, OKR list/empty state visible |
| **Priority** | LOW |
| **Risk** | API endpoint errors, empty state not handled, date formatting issues |
| **Prerequisites** | Flow 1 (Login) must pass |

**WebUI Steps:**
1. Navigate to `/okr`
2. Verify page loads without JavaScript errors
3. Check for OKR list or empty state message
4. If OKRs exist, verify progress indicators
5. Test any CRUD operations available

---

### Flow 10: Admin Dashboard and Organization Management

| Attribute | Value |
|-----------|-------|
| **Purpose** | Verify admin users can access admin-only pages and manage organizations |
| **Entry Point** | `https://app.nubabel.com/admin` |
| **Success Criteria** | Admin dashboard accessible (if admin), organizations list visible, agent management functional |
| **Priority** | LOW |
| **Risk** | Non-admin access bypass, pagination issues, bulk operations timeout |
| **Prerequisites** | Flow 1 (Login) must pass; Test user MUST have admin role |

**Admin Role Prerequisite Check:**
Before running this flow, verify admin access:
1. Navigate to `/settings` and check user role
2. OR check via Slack: `/nubabel whoami` - role should show "admin" or "owner"
3. If not admin, assign admin role via database or existing admin user

**WebUI Steps:**
1. Navigate to `/admin`
2. If not admin, verify redirect or access denied
3. If admin, verify admin dashboard stats
4. Navigate to `/admin/organizations`
5. Verify organization list renders
6. Navigate to `/admin/agents`
7. Verify agent management interface
8. Navigate to `/admin/claude-max-accounts`
9. Verify account pool management

---

## Copy-Paste QA Prompts

### [Flow 1] Google OAuth Login and Dashboard Access

```
ralph ultraqa yolo mode: Test the complete Google OAuth login flow and dashboard rendering for app.nubabel.com

SCOPE: Authentication and Dashboard E2E

PREREQUISITES: None (entry point flow)

TESTING STEPS:

1. WEBUI SETUP (Claude in Chrome):
   - Get tab context first
   - Navigate to https://app.nubabel.com/login
   - Take a screenshot to verify login page renders

2. LOGIN FLOW:
   - Find and click the "Sign in with Google" button
   - Complete Google OAuth if needed (may already be authenticated)
   - Wait for redirect to /dashboard (up to 10 seconds)
   - Take screenshot of dashboard

3. DASHBOARD VERIFICATION:
   - Verify page title contains "Dashboard"
   - Find all 4 stat cards: "Total Runs", "Active Users", "Total Cost", "Errors"
   - Verify Quick Actions section exists
   - Verify Activity Feed section exists
   - Check browser console for any JavaScript errors

4. IF ANY ERRORS FOUND:
   - Read the error details from console
   - Identify the source file location:
     * Backend files (src/**): cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
     * Frontend files (frontend/src/**): cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build
   - Fix the identified issue
   - Run the appropriate build command(s) above
   - Wait for Railway auto-deploy (check with: railway logs)
   - Retry the browser test

5. SUCCESS CRITERIA:
   - Login completes without errors
   - Dashboard renders all components
   - No console errors
   - Page loads in under 3 seconds

LOOP: Continue fixing and retesting until all criteria pass.
```

---

### [Flow 2] Slack Agent Basic Interaction

```
ralph ultraqa yolo mode: Test Slack @Nubabel agent commands and responses

SCOPE: Slack Bot E2E - Commands and Identity Resolution

PREREQUISITES: None (independent entry point)

COMMAND TYPES:
- /nubabel <cmd> = General slash commands
- /ar <cmd> = AR-specific slash commands
- @Nubabel <message> = Natural language AI agent

TESTING STEPS:

1. SLACK SETUP (Claude in Chrome):
   - Get tab context
   - Navigate to Slack web app or use native Slack
   - Go to #it-test channel

2. HELP COMMAND:
   - Type: /nubabel help
   - Wait for ephemeral response (up to 5 seconds)
   - Verify response contains:
     - "General:" section with commands
     - "MCP Servers:" section
     - "Settings:" section
   - Screenshot the response

3. STATUS COMMAND:
   - Type: /nubabel status
   - Verify response shows:
     - "Bot is online" with green checkmark
     - Organization name
     - Active sessions count
     - Enabled workflows count

4. WHOAMI COMMAND:
   - Type: /nubabel whoami
   - Verify response shows:
     - User name
     - Email
     - Organization
     - Role
     - User ID
     - Slack ID

5. MCP COMMANDS:
   - Type: /nubabel mcp list
   - Verify recommended servers displayed
   - Type: /nubabel mcp search git
   - Verify search results

6. IF ERRORS (e.g., "workspace not connected"):
   - Check backend files:
     - /Users/sean/Documents/Kyndof/tools/nubabel/src/api/slack-commands.ts
     - /Users/sean/Documents/Kyndof/tools/nubabel/src/services/slack-service.ts
   - Fix identity resolution or workspace lookup issues
   - Run: cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
   - Wait for deploy (railway logs), retry

7. WEBUI CROSS-CHECK:
   - Navigate to https://app.nubabel.com/settings/slack
   - Verify Slack integration shows "Connected"

SUCCESS CRITERIA:
- All 5 commands return valid responses
- No "workspace not connected" errors
- No "user not linked" errors
```

---

### [Flow 3] Approval Workflow (Human-in-the-Loop)

```
ralph ultraqa yolo mode: Test the approvals workflow across WebUI and Slack

SCOPE: Human-in-the-Loop Approvals E2E

PREREQUISITES:
- Flow 1 (Login) MUST have passed
- Flow 2 (Slack) SHOULD have passed for Slack approval testing

TESTING STEPS:

1. WEBUI APPROVALS PAGE:
   - Navigate to https://app.nubabel.com/approvals
   - Screenshot the page
   - Verify filter controls render (status dropdown, type dropdown)
   - Test status filter: change to "all", verify list updates
   - Test type filter: change to "budget", verify filtering works

2. APPROVAL RESPONSE (WebUI):
   - If pending approvals exist:
     - Click on an approval to expand
     - Click "Approve" button
     - Verify status badge changes to green "approved"
   - If no pending approvals:
     - Verify empty state message displayed

3. SLACK APPROVAL:
   - In Slack #it-test, check for any approval notification messages
   - If present, click "Approve" or "Reject" button
   - Verify confirmation message appears
   - Return to WebUI /approvals
   - Verify the approval status updated

4. SSE REAL-TIME CHECK:
   - Keep /approvals page open
   - Have another user/agent trigger an approval
   - Verify new approval appears without page refresh

5. IF ERRORS FOUND:
   - Frontend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/pages/ApprovalsPage.tsx
   - Backend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/api/approvals.ts
   - Wait for Railway deploy (railway logs), retry

SUCCESS CRITERIA:
- Approvals page loads without errors
- Filters work correctly
- Approve/Reject updates status immediately
- Slack and WebUI stay in sync
```

---

### [Flow 4] AR System (Agent Resource Management)

```
ralph ultraqa yolo mode: Test AR (Agent Resource) Management across WebUI and Slack

SCOPE: AR Dashboard, Workload, Approvals E2E

PREREQUISITES:
- Flow 1 (Login) MUST have passed
- Flow 2 (Slack) SHOULD have passed for Slack command testing

COMMAND FORMAT: /ar <command> (AR-specific slash command)

KOREAN ALIASES SUPPORTED:
- 상태 = status
- 워크로드 = workload
- 이슈 = issues
- 승인 = approve
- 반려 = reject
- 도움말 = help

TESTING STEPS:

1. WEBUI AR DASHBOARD:
   - Navigate to https://app.nubabel.com/ar
   - Screenshot the dashboard
   - Verify 4 stat cards:
     - Departments (with count)
     - Positions (with count)
     - Assignments (with count)
     - Pending Approvals (with count)
   - Click "Departments" card, verify /ar/departments loads
   - Click "Positions" card, verify /ar/positions loads
   - Click "Assignments" card, verify /ar/assignments loads
   - Click "Pending Approvals" card, verify /ar/approvals loads

2. AR WORKLOAD PAGE:
   - Navigate to /ar/workload
   - Verify workload bars render with percentages
   - Verify color coding (green/yellow/red) based on load

3. SLACK AR COMMANDS (using /ar slash command):
   - In #it-test: /ar status
   - Verify response matches WebUI counts
   - Type: /ar workload
   - Verify ASCII workload bars displayed
   - Type: /ar 상태 (Korean for status)
   - Verify same response as /ar status
   - Type: /ar 워크로드 (Korean for workload)
   - Verify workload response

4. AR APPROVAL VIA SLACK:
   - If pending AR approvals exist:
     - Type: /ar approve <request_id>
     - Verify success message
   - Test rejection: /ar reject <request_id> -r "Testing rejection"

5. IF ERRORS FOUND:
   - Frontend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/pages/ar/ARDashboardPage.tsx
   - Backend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/api/slack-ar-commands.ts
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/ar/api/
   - Wait for Railway deploy (railway logs), retry

SUCCESS CRITERIA:
- All AR pages render without errors
- WebUI and Slack report same data
- Korean aliases work (상태, 워크로드, 도움말)
- Approve/reject via Slack works
```

---

### [Flow 5] Marketplace Extension Discovery

```
ralph ultraqa yolo mode: Test Marketplace browsing, search, and MCP server discovery

SCOPE: Marketplace E2E

PREREQUISITES:
- Flow 1 (Login) MUST have passed

COMMAND FORMAT: /nubabel mcp <subcommand> (General slash command)

TESTING STEPS:

1. MARKETPLACE PAGE:
   - Navigate to https://app.nubabel.com/marketplace
   - Screenshot the page
   - Verify extension cards render with:
     - Name
     - Description
     - Publisher name
     - Stats (downloads, rating)
     - Pricing badge

2. SEARCH FUNCTIONALITY:
   - Find search input
   - Type "slack" and wait for results
   - Verify filtered extensions shown
   - Clear search, verify all extensions return

3. CATEGORY FILTER:
   - Find category filter/sidebar
   - Click a category
   - Verify URL updates with ?category=
   - Verify extensions filtered

4. EXTENSION DETAIL:
   - Click an extension card
   - Verify navigation to /marketplace/:extensionId
   - Verify detail page shows:
     - Full description
     - Install button
     - Publisher info
     - Version info

5. SLACK MCP DISCOVERY (using /nubabel slash command):
   - In #it-test: /nubabel mcp list
   - Verify categorized server list
   - Type: /nubabel mcp search database
   - Verify search results
   - Type: /nubabel mcp info @anthropic/mcp-server-git
   - Verify installation instructions displayed

6. IF ERRORS FOUND:
   - Frontend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/pages/MarketplacePage.tsx
   - Backend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/api/marketplace.ts
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/api/slack-commands.ts (handleMCPCommand)
   - Wait for Railway deploy (railway logs), retry

SUCCESS CRITERIA:
- Extensions load and display correctly
- Search and filters work
- Detail pages accessible
- Slack MCP commands return valid data
```

---

### [Flow 6] Claude Connect Token Setup

```
ralph ultraqa yolo mode: Test Claude Connect token capture workflow

SCOPE: Claude Connect E2E

PREREQUISITES:
- Flow 1 (Login) MUST have passed

TOKEN TESTING NOTE:
- Steps 8-10 require a valid Claude token from claude.ai
- In automated QA runs, verify UI functionality (steps 1-7) is sufficient
- Full token flow requires manual testing with actual token

TESTING STEPS:

1. CLAUDE CONNECT PAGE:
   - Navigate to https://app.nubabel.com/claude-connect
   - Screenshot the page
   - Verify page renders without layout wrapper (standalone page)

2. QUICK CONNECT TAB:
   - Verify "Quick Connect" tab is active by default
   - Find token input field
   - Verify input accepts text
   - Verify validation states work

3. MANUAL CONNECT TAB:
   - Click "Manual" tab
   - Verify session initialization (loading state)
   - Verify session code displayed
   - Verify bookmarklet code area rendered
   - Verify console script area rendered

4. COPY FUNCTIONALITY:
   - Click "Copy" button for bookmarklet
   - Verify clipboard contains bookmarklet code
   - Click "Copy" button for console script
   - Verify clipboard contains script

5. TOKEN SUBMISSION (if applicable - skip in automated runs):
   - If you have a valid Claude token:
     - Paste into Quick Connect input
     - Verify validation runs
     - If valid, verify naming step appears
     - Enter nickname, set priority
     - Submit
     - Verify success confirmation

6. IF ERRORS FOUND:
   - Frontend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/pages/ClaudeConnectPage.tsx
   - Backend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/api/claude-connect.ts
   - Wait for Railway deploy (railway logs), retry

SUCCESS CRITERIA:
- Both tabs render correctly
- Session code generated
- Copy buttons work
- Token validation provides feedback (if tested)
```

---

### [Flow 7] Agent Activity Real-time Monitoring

```
ralph ultraqa yolo mode: Test Agent Activity page with SSE real-time updates

SCOPE: Agent Activity SSE E2E

PREREQUISITES:
- Flow 1 (Login) MUST have passed
- Flow 2 (Slack) SHOULD have passed for event triggering via @Nubabel

COMMAND FORMAT: @Nubabel <message> (Natural language AI agent mention)

TESTING STEPS:

1. ACTIVITY PAGE SETUP:
   - Navigate to https://app.nubabel.com/activity
   - Screenshot the page
   - Verify components:
     - Event filter dropdown
     - Agent tree section
     - Account pool status section
     - Event list

2. FILTER FUNCTIONALITY:
   - Open filter dropdown
   - Verify event types listed:
     - all, agent:started, agent:progress, agent:completed, agent:failed, etc.
   - Select "agent:completed"
   - Verify list filters (if events exist)

3. SSE CONNECTION CHECK (multiple methods):
   - PRIMARY: Open browser DevTools > Network tab, look for SSE connection to /api/events
   - ALTERNATIVE 1: Check console for SSE connection logs
   - ALTERNATIVE 2: Trigger agent action and observe real-time update on page

4. TRIGGER REAL-TIME EVENT (using @Nubabel mention):
   - Keep Activity page open in one tab
   - In Slack #it-test, type: @Nubabel what time is it?
   - Wait for agent to start
   - Return to Activity page
   - Verify agent:started event appeared without refresh
   - Wait for completion
   - Verify agent:completed event appeared

5. MEMORY CHECK:
   - Trigger 10+ agent requests
   - Verify event list stays at max 100 items
   - No memory warnings in console

6. IF ERRORS FOUND:
   - Frontend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/pages/AgentActivityPage.tsx
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/hooks/useSSE.ts
   - Backend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/api/sse.ts
   - Wait for Railway deploy (railway logs), retry

SUCCESS CRITERIA:
- Activity page loads without errors
- SSE connection established (verified via any method)
- Real-time events appear
- Event list bounded to 100 items
```

---

### [Flow 8] Settings and Integration Configuration

```
ralph ultraqa yolo mode: Test Settings pages and integration configuration

SCOPE: Settings E2E

PREREQUISITES:
- Flow 1 (Login) MUST have passed

TESTING STEPS:

1. MAIN SETTINGS PAGE:
   - Navigate to https://app.nubabel.com/settings
   - Screenshot the page
   - Verify sections:
     - Profile (with name, email)
     - Organization (with org name)
     - Security section

2. PROFILE UPDATE:
   - Find name input field
   - Change name to "QA Test User"
   - Click "Save Changes"
   - Verify success alert appears
   - Refresh page
   - Verify name persisted

3. SLACK INTEGRATION:
   - Navigate to /settings/slack
   - Verify Slack workspace connection status displayed
   - If "Connect" button visible, test OAuth flow
   - If connected, verify workspace name shown

4. NOTION INTEGRATION:
   - Navigate to /settings/notion
   - Verify Notion connection status
   - Test connect/disconnect if available

5. GOOGLE CALENDAR INTEGRATION:
   - Navigate to /settings/google-calendar
   - Verify calendar connection status
   - Verify calendar list if connected

6. LINKED IDENTITIES:
   - Navigate to /settings/identities
   - Verify linked accounts display

7. LOGOUT ALL TEST (CAREFUL):
   - In Settings security section, find "Logout from all devices"
   - Click and confirm
   - Verify redirect to /login

8. IF ERRORS FOUND:
   - Frontend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/pages/SettingsPage.tsx
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/pages/*SettingsPage.tsx
   - Backend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/api/
   - Wait for Railway deploy (railway logs), retry

SUCCESS CRITERIA:
- All settings pages load
- Profile save works
- Integration status displays
- Logout-all redirects correctly
```

---

### [Flow 9] OKR Management

```
ralph ultraqa yolo mode: Test OKR page rendering and functionality

SCOPE: OKR E2E

PREREQUISITES:
- Flow 1 (Login) MUST have passed

TESTING STEPS:

1. OKR PAGE:
   - Navigate to https://app.nubabel.com/okr
   - Screenshot the page
   - Check browser console for JavaScript errors

2. PAGE CONTENT CHECK:
   - Verify page title "OKR" or similar
   - If OKRs exist:
     - Verify objective list displays
     - Verify key results under objectives
     - Verify progress indicators
   - If no OKRs:
     - Verify empty state message
     - Verify "Create OKR" button if applicable

3. OKR INTERACTION (if available):
   - Try creating a new objective
   - Try adding key results
   - Test progress update

4. ERROR INVESTIGATION:
   - Open DevTools > Console
   - Check for any red errors
   - Check Network tab for failed API calls

5. IF ERRORS FOUND:
   - Frontend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/pages/OKRPage.tsx
   - Backend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/api/okr.ts
   - Check for undefined data handling
   - Wait for Railway deploy (railway logs), retry

SUCCESS CRITERIA:
- OKR page loads without console errors
- Either OKR list or empty state displays
- No unhandled exceptions
```

---

### [Flow 10] Admin Dashboard and Organization Management

```
ralph ultraqa yolo mode: Test Admin pages and organization management (requires admin role)

SCOPE: Admin E2E

PREREQUISITES:
- Flow 1 (Login) MUST have passed
- Test user MUST have admin role

ADMIN ROLE VERIFICATION (run first):
1. Navigate to /settings OR type /nubabel whoami in Slack
2. Confirm role shows "admin" or "owner"
3. If not admin: assign role via database OR use an admin account
4. Without admin role, only step 1-2 (access denial) can be tested

TESTING STEPS:

1. ADMIN ACCESS CHECK:
   - Navigate to https://app.nubabel.com/admin
   - If not admin: verify redirect or "Access Denied" message
   - If admin: verify admin dashboard loads

2. ADMIN DASHBOARD (admin only):
   - Verify admin stats displayed
   - Screenshot the page
   - Check for any errors

3. ORGANIZATIONS PAGE:
   - Navigate to /admin/organizations
   - Verify organization list renders
   - Test search/filter if available
   - Click an org to view details

4. AGENTS MANAGEMENT:
   - Navigate to /admin/agents
   - Verify agent list renders
   - Test agent CRUD if available

5. SKILLS MANAGEMENT:
   - Navigate to /admin/skills
   - Verify skills list
   - Test skill configuration

6. CLAUDE MAX ACCOUNTS:
   - Navigate to /admin/claude-max-accounts
   - Verify account pool list
   - Check priority ordering
   - Verify account status indicators

7. IDENTITY MANAGEMENT:
   - Navigate to /admin/identities
   - Verify identity list
   - Test identity linking if available

8. N8N INSTANCES:
   - Navigate to /admin/n8n-instances
   - Verify instance list
   - Check instance status

9. IF ERRORS FOUND:
   - Frontend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/frontend/src/pages/admin/
   - Backend issue: cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/api/admin/
     - Check: /Users/sean/Documents/Kyndof/tools/nubabel/src/admin/api/admin.ts
   - Wait for Railway deploy (railway logs), retry

SUCCESS CRITERIA:
- Non-admins cannot access admin pages
- Admin pages load without errors
- Organization management works
- Agent/skills management works
```

---

## Execution Strategy

### High Priority (Execute First)

1. **Flow 1: Google OAuth Login and Dashboard Access**
   - Foundation for all other tests
   - Must pass before any authenticated flow can work
   - Catches auth, routing, and basic rendering issues

2. **Flow 2: Slack Agent Basic Interaction**
   - Core dual-interface requirement
   - Validates Slack integration working
   - Identity resolution critical for all Slack features

3. **Flow 3: Approval Workflow (Human-in-the-Loop)**
   - Core enterprise feature
   - Tests real-time SSE
   - Validates WebUI + Slack synchronization

### Execution Dependencies

```
Flow 1 (Login) MUST PASS before:
  ├── Flow 3 (Approvals)
  ├── Flow 4 (AR System)
  ├── Flow 5 (Marketplace)
  ├── Flow 6 (Claude Connect)
  ├── Flow 7 (Agent Activity)
  ├── Flow 8 (Settings)
  ├── Flow 9 (OKR)
  └── Flow 10 (Admin)

Flow 2 (Slack) SHOULD PASS for:
  ├── Flow 3 (Slack approvals)
  ├── Flow 4 (AR Slack commands)
  ├── Flow 5 (MCP Slack commands)
  └── Flow 7 (Slack-triggered events)
```

### Verification Checkpoints

**After Flow 1 + 2 Complete:**
- [ ] User can log in via Google OAuth
- [ ] Dashboard renders without errors
- [ ] Slack bot responds to commands
- [ ] User identity resolves correctly

**After Flow 3 + 4 Complete:**
- [ ] Approvals work in both interfaces
- [ ] AR data consistent between WebUI and Slack
- [ ] Real-time updates functioning

**After All Flows Complete:**
- [ ] No console errors on any page
- [ ] All Slack commands return valid responses
- [ ] No 500 errors in Railway logs
- [ ] All navigation routes accessible

---

## Railway Deployment Verification

Before each test run, verify Railway deployment status:

```bash
# Check recent deployment logs
railway logs

# Follow logs in real-time (useful while waiting for deploy)
railway logs -f

# Filter for errors
railway logs | grep -i error

# Verify service is running via health endpoint
curl -s https://auth.nubabel.com/api/health | jq
```

**Note:** Railway CLI v4.x does not support the `--latest` flag. Use `railway logs` for recent logs.

---

## Bug Report Template

When issues are found, document:

```markdown
## Bug: [Short Description]

**Flow:** [Flow Number and Name]
**Priority:** [HIGH/MEDIUM/LOW]
**Interface:** [WebUI/Slack/Both]

**Steps to Reproduce:**
1. ...
2. ...

**Expected Behavior:**
...

**Actual Behavior:**
...

**Screenshots:**
[Attach if available]

**Console Errors:**
```
[Paste relevant errors]
```

**Files to Investigate:**
- /path/to/file1.ts (backend)
- /path/to/file2.tsx (frontend)

**Build Commands:**
- Backend: cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run build
- Frontend: cd /Users/sean/Documents/Kyndof/tools/nubabel/frontend && npm run build

**Fix Applied:**
[After fixing, document the change]
```
