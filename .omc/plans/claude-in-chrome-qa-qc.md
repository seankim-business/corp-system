# Nubabel Platform QA/QC - Claude in Chrome Automation Plan

## Context

### Original Request
Claude in Chrome browser automation tools to perform comprehensive QA/QC testing on the Nubabel platform.

### Research Findings

**Platform Overview:**
- Multi-tenant B2B SaaS for AI-powered workflow automation
- Backend: Express.js + TypeScript (port 3000)
- Frontend: React 18 + Vite (port 3001)
- Database: PostgreSQL + Redis

**Existing Test Infrastructure:**
- Jest + ts-jest for unit tests (`jest.config.js`)
- Playwright for E2E tests (`playwright.config.ts`)
- ~40-60% coverage, target >80%
- 11 tests passing, 4 failing
- Existing specs: `agents-page.spec.ts`, `chrome-profile.spec.ts`

**Frontend Routes (from App.tsx):**
| Route | Component | Auth |
|-------|-----------|------|
| `/login` | LoginPage | Public |
| `/onboarding` | OnboardingPage | Protected (skip check) |
| `/dashboard` | DashboardPage | Protected |
| `/okr` | OKRPage | Protected |
| `/workflows` | WorkflowsPage | Protected |
| `/workflows/:id` | WorkflowDetailPage | Protected |
| `/executions` | ExecutionsPage | Protected |
| `/executions/:id` | ExecutionDetailPage | Protected |
| `/settings` | SettingsPage | Protected |
| `/settings/notion` | NotionSettingsPage | Protected |
| `/settings/slack` | SlackSettingsPage | Protected |
| `/settings/google-calendar` | GoogleCalendarSettingsPage | Protected |
| `/settings/members` | MembersPage | Protected |
| `/approvals` | ApprovalsPage | Protected |
| `/activity` | AgentActivityPage | Protected |
| `/metrics/agents` | AgentMetricsPage | Protected |
| `/org-changes` | OrgChangesPage | Protected |
| `/admin/agents` | AgentsPage | Admin |
| `/admin/skills` | SkillsPage | Admin |
| `/admin/sops` | SOPLibraryPage | Admin |
| `/admin` | AdminDashboardPage | Admin |
| `/admin/organizations` | AdminOrganizationsPage | Admin |
| `/admin/system` | MetaAgentDashboardPage | Protected |
| `/conversations` | ConversationsPage | Protected |
| `/search` | SearchPage | Protected |

**Backend API Endpoints (Workflow API):**
- `GET /api/workflows` - List workflows
- `POST /api/workflows` - Create workflow
- `GET /api/workflows/:id` - Get workflow
- `PUT /api/workflows/:id` - Update workflow
- `DELETE /api/workflows/:id` - Delete workflow
- `POST /api/workflows/:id/execute` - Execute workflow
- `GET /api/workflows/:id/executions` - Get executions
- `GET /api/executions` - List all executions
- `GET /api/executions/:id` - Get execution detail

**Claude in Chrome Tools Available:**
- `mcp__claude-in-chrome__computer` - Mouse/keyboard actions, screenshots
- `mcp__claude-in-chrome__read_page` - Get accessibility tree
- `mcp__claude-in-chrome__find` - Natural language element search
- `mcp__claude-in-chrome__form_input` - Form interaction
- `mcp__claude-in-chrome__javascript_tool` - Execute JS in page context
- `mcp__claude-in-chrome__navigate` - URL navigation
- `mcp__claude-in-chrome__tabs_context_mcp` - Get current tabs
- `mcp__claude-in-chrome__tabs_create_mcp` - Create new tabs
- `mcp__claude-in-chrome__gif_creator` - Record interactions as GIF
- `mcp__claude-in-chrome__read_console_messages` - Monitor console output
- `mcp__claude-in-chrome__read_network_requests` - Monitor network traffic

---

## Work Objectives

### Core Objective
Perform comprehensive QA/QC testing of all Nubabel platform features using Claude in Chrome browser automation, documenting all issues found and creating reproducible test cases.

### Deliverables
1. **Test Execution Report** - Document all test scenarios executed with pass/fail status
2. **Bug Report** - List of all issues found with severity, reproduction steps, screenshots/GIFs
3. **Visual Regression Baseline** - Screenshots of all pages in known-good state
4. **Console Error Log** - All JavaScript errors captured during testing
5. **Network Health Report** - API response times, failed requests, error codes
6. **Accessibility Audit** - WCAG compliance issues found
7. **Test Case Documentation** - Reusable test scenarios for future regression testing

### Definition of Done
- [ ] All 26 frontend routes tested
- [ ] All workflow CRUD operations tested
- [ ] Authentication flows tested (login, logout, session)
- [ ] Organization switching tested
- [ ] Integration settings tested (Notion, Slack, Google Calendar)
- [ ] Admin panel features tested (agents, skills, SOPs)
- [ ] No critical or high-severity bugs remaining
- [ ] All findings documented with evidence

---

## Must Have / Must NOT Have

### Must Have (Guardrails)
- Test every route listed in App.tsx
- Capture screenshot evidence for every issue
- Record console errors on every page
- Monitor network requests for 4xx/5xx errors
- Document reproduction steps for all bugs
- Test both happy path and error scenarios
- Test with valid and invalid inputs
- Test authorization (protected vs admin routes)

### Must NOT Have
- Do not modify source code (QA only)
- Do not delete production data
- Do not test with real user credentials (use test accounts)
- Do not skip any route
- Do not mark tests as passed without verification
- Do not ignore console warnings/errors

---

## Prerequisites

**Before starting TASK 1, ensure:**
1. **Backend server is running** on port 3000 (`http://localhost:3000`)
2. **Frontend server is running** on port 3001 (`http://localhost:3001`)
3. **Chrome browser is open** with Claude in Chrome extension active

---

## Task Flow and Dependencies

```
[TASK 0: Authentication Verification] (BLOCKER - must pass before continuing)
    |
    v
[Phase 1: Setup & Smoke Test]
    |
    v
[Phase 2: Authentication Testing]
    |
    v
[Phase 3: Core Feature Testing]
    |
    +---> [3a: Dashboard]
    +---> [3b: Workflows]
    +---> [3c: Executions]
    +---> [3d: Settings]
    |
    v
[TASK 6.5: Admin Access Verification] (BLOCKER - must pass before TASK 7)
    |
    v
[Phase 4: Admin Panel Testing]
    |
    v
[Phase 5: Integration Testing]
    |
    v
[Phase 6: Edge Cases & Error Handling]
    |
    v
[Phase 7: Accessibility & Performance]
    |
    v
[Phase 8: Report Generation]
```

---

## Detailed TODOs

### TASK 0: Authentication Verification (BLOCKER)
- **Priority**: P0 (MUST PASS BEFORE ANY OTHER TASK)
- **Estimated Time**: 5 minutes
- **Dependencies**: None

**Purpose:**
Verify the test profile has a valid authenticated session before proceeding with any testing. If authentication is invalid, testing cannot proceed.

**Steps:**
1. Navigate to `http://localhost:3001/dashboard` using `mcp__claude-in-chrome__navigate`
2. Wait 3 seconds for redirect/render
3. Use `mcp__claude-in-chrome__read_page` to check current page content
4. Determine authentication status:
   - **SUCCESS**: Dashboard loads with user data visible (look for user name, organization info, or dashboard widgets)
   - **FAILURE**: Redirected to `/login` or see login page content

**If FAILURE (redirected to /login):**
- **STOP IMMEDIATELY**
- Report: "Authentication verification failed. The test profile session has expired or was never authenticated. Manual login is required before QA testing can proceed."
- Provide instructions: "Please manually log in using Google OAuth in the Chrome test profile, then restart the QA session."
- **DO NOT PROCEED** with any other tasks

**Acceptance Criteria:**
- [ ] Navigated to /dashboard
- [ ] Verified user is authenticated (dashboard content visible)
- [ ] Confirmed user data loads (not empty state)

---

### TASK 1: Environment Setup & Smoke Test
- **Priority**: P0
- **Estimated Time**: 15 minutes
- **Dependencies**: TASK 0 (must pass)

**Prerequisite Check:**
Before starting, verify:
1. Backend is running: Check if `http://localhost:3000/health` responds (or any known endpoint)
2. Frontend is running: TASK 0 already confirmed `http://localhost:3001` is accessible

**Setup:**
1. Create QA results directory:
   ```bash
   mkdir -p qa-results/screenshots
   ```

**Steps:**
1. Navigate to `http://localhost:3001` using `mcp__claude-in-chrome__navigate`
2. Verify application loads (check for React root element)
3. Check console for startup errors using `mcp__claude-in-chrome__read_console_messages`
4. Monitor initial network requests using `mcp__claude-in-chrome__read_network_requests`
5. Take baseline screenshot using `mcp__claude-in-chrome__computer` (screenshot action)

**Acceptance Criteria:**
- [ ] qa-results/screenshots directory exists
- [ ] Application renders without blank screen
- [ ] No critical console errors on initial load
- [ ] All critical assets (JS, CSS) load successfully
- [ ] Response times < 3s for initial page load

---

### TASK 2: Authentication Flow Testing
- **Priority**: P0
- **Estimated Time**: 30 minutes
- **Dependencies**: TASK 1

**Test Scenarios:**

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| AUTH-001 | Navigate to protected route without auth | Redirect to /login |
| AUTH-002 | Login page renders correctly | Google button visible, no errors |
| AUTH-003 | Google OAuth flow initiates | Opens Google consent screen |
| AUTH-004 | After login, redirect to dashboard | Dashboard loads with user info |
| AUTH-005 | Session persists on refresh | Still authenticated after F5 |
| AUTH-006 | Logout clears session | Redirected to login, session cleared |
| AUTH-007 | Access admin route as non-admin | Inline "Access Denied" page renders (AdminRoute component blocks access without redirect) |

**Steps:**
1. Use `mcp__claude-in-chrome__navigate` to go to `/dashboard` without auth
2. Verify redirect to `/login` using `mcp__claude-in-chrome__read_page`
3. Use `mcp__claude-in-chrome__find` to locate Google login button
4. Click using `mcp__claude-in-chrome__computer`
5. Monitor network for OAuth flow using `mcp__claude-in-chrome__read_network_requests`
6. After login, verify dashboard content with `mcp__claude-in-chrome__read_page`

**Acceptance Criteria:**
- [ ] Protected routes redirect unauthenticated users
- [ ] Login flow completes without errors
- [ ] Session management works correctly
- [ ] Admin routes show "Access Denied" page to non-admin users (not 403, not redirect)

---

### TASK 3: Dashboard Page Testing
- **Priority**: P1
- **Estimated Time**: 20 minutes
- **Dependencies**: TASK 2

**Test Scenarios:**

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| DASH-001 | Dashboard renders after login | All widgets load |
| DASH-002 | Stats cards display data | Numbers render, no NaN |
| DASH-003 | Quick actions are clickable | Navigation works |
| DASH-004 | Activity feed shows history | Recent items visible |
| DASH-005 | Organization switcher works | Can change org |
| DASH-006 | Header navigation works | All nav links function |
| DASH-007 | Sidebar navigation works | All menu items clickable |

**Steps:**
1. Navigate to `/dashboard` using `mcp__claude-in-chrome__navigate`
2. Use `mcp__claude-in-chrome__read_page` to capture accessibility tree
3. Verify StatCard components render with data
4. Test QuickActions using `mcp__claude-in-chrome__find` and `mcp__claude-in-chrome__computer`
5. Check ActivityFeed loads with history
6. Test OrganizationSwitcher dropdown
7. Capture screenshot for visual baseline

**Acceptance Criteria:**
- [ ] All dashboard widgets render without errors
- [ ] Data displays correctly (no undefined/NaN)
- [ ] Navigation works from dashboard
- [ ] Organization context switches correctly

---

### TASK 4: Workflow Management Testing
- **Priority**: P0
- **Estimated Time**: 45 minutes
- **Dependencies**: TASK 3

**Test Scenarios:**

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| WF-001 | Workflows page loads | List renders or empty state |
| WF-002 | Create new workflow | Form opens, validates, saves |
| WF-003 | Edit existing workflow | Changes persist |
| WF-004 | Delete workflow | Removed from list |
| WF-005 | View workflow detail | Detail page renders |
| WF-006 | Execute workflow | Execution starts |
| WF-007 | View execution history | History shows in detail |
| WF-008 | Filter workflows | Search/filter works |
| WF-009 | Pagination works | Can navigate pages |
| WF-010 | Empty state displays | Shows when no workflows |

**Steps:**
1. Navigate to `/workflows`
2. Test list rendering with `mcp__claude-in-chrome__read_page`
3. Use `mcp__claude-in-chrome__find` to locate "Create Workflow" button
4. Use `mcp__claude-in-chrome__form_input` to fill workflow form
5. Submit and verify with network monitoring
6. Navigate to detail page `/workflows/:id`
7. Test ExecuteWorkflowModal interaction
8. Verify execution status updates (may use `mcp__claude-in-chrome__javascript_tool` to poll)

**Acceptance Criteria:**
- [ ] CRUD operations work correctly
- [ ] Form validation prevents invalid input
- [ ] Execution triggers and status updates
- [ ] Error states handled gracefully

---

### TASK 5: Executions Page Testing
- **Priority**: P1
- **Estimated Time**: 25 minutes
- **Dependencies**: TASK 4

**Test Scenarios:**

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| EXEC-001 | Executions list loads | Shows all executions |
| EXEC-002 | Filter by status | Shows filtered results |
| EXEC-003 | Filter by workflow | Shows filtered results |
| EXEC-004 | View execution detail | Shows full execution data |
| EXEC-005 | Real-time status update | Status changes via SSE |
| EXEC-006 | Pagination works | Can navigate large lists |
| EXEC-007 | Input/output data visible | JSON renders correctly |
| EXEC-008 | Error message display | Failed executions show error |

**Steps:**
1. Navigate to `/executions`
2. Verify list renders with `mcp__claude-in-chrome__read_page`
3. Test filter dropdowns with `mcp__claude-in-chrome__form_input`
4. Navigate to execution detail `/executions/:id`
5. Monitor SSE connection with `mcp__claude-in-chrome__read_network_requests`
6. Verify JSON data rendering in detail view

**Acceptance Criteria:**
- [ ] Executions list displays correctly
- [ ] Filters work as expected
- [ ] Detail view shows complete execution data
- [ ] Real-time updates work (SSE)

---

### TASK 6: Settings Pages Testing
- **Priority**: P1
- **Estimated Time**: 40 minutes
- **Dependencies**: TASK 3

**Test Scenarios:**

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| SET-001 | Main settings page loads | Profile section visible |
| SET-002 | Profile info displays | User data shown |
| SET-003 | Notion settings page loads | Connection status shown |
| SET-004 | Slack settings page loads | Connection status shown |
| SET-005 | Google Calendar settings | Connection status shown |
| SET-006 | Members page loads | Member list shown |
| SET-007 | Add member flow | Can invite new member |
| SET-008 | Remove member flow | Can remove member |
| SET-009 | Role change flow | Can change member role |
| SET-010 | OAuth connection flow | Can connect/disconnect |

**Steps:**
1. Navigate to `/settings`
2. Verify profile section with `mcp__claude-in-chrome__read_page`
3. Navigate to `/settings/notion`, `/settings/slack`, `/settings/google-calendar`
4. Test OAuth connect buttons
5. Navigate to `/settings/members`
6. Test member CRUD operations
7. Monitor network for API calls

**Acceptance Criteria:**
- [ ] All settings pages render correctly
- [ ] OAuth connection flows work
- [ ] Member management works
- [ ] Settings persist after changes

---

### TASK 6.5: Admin Access Verification (BLOCKER for TASK 7)
- **Priority**: P0 (MUST PASS BEFORE TASK 7)
- **Estimated Time**: 5 minutes
- **Dependencies**: TASK 2

**Purpose:**
Verify the test account has admin privileges before attempting admin panel testing.

**Steps:**
1. Navigate to `http://localhost:3001/admin` using `mcp__claude-in-chrome__navigate`
2. Wait 2 seconds for page to render
3. Use `mcp__claude-in-chrome__read_page` to check page content
4. Determine admin access:
   - **SUCCESS**: Admin dashboard content visible (stats, overview, admin navigation)
   - **FAILURE**: Page shows "Access Denied" text or similar unauthorized message

**If FAILURE (Access Denied shown):**
- **STOP ADMIN TESTING**
- Report: "Admin access verification failed. The test account does not have admin privileges. Admin panel testing (TASK 7) cannot proceed."
- Mark TASK 7 as BLOCKED in the test report
- Continue with TASK 8 and remaining non-admin tasks
- Provide recommendation: "To test admin features, either grant admin role to test account or use a different account with admin privileges."

**Acceptance Criteria:**
- [ ] Navigated to /admin
- [ ] Verified admin dashboard content loads (not "Access Denied")
- [ ] Admin privileges confirmed

---

### TASK 7: Admin Panel Testing
- **Priority**: P1
- **Estimated Time**: 45 minutes
- **Dependencies**: TASK 2, **TASK 6.5 must pass** (Admin auth required)

**PREREQUISITE:** TASK 6.5 must have passed. If TASK 6.5 failed (Access Denied), skip this entire task and mark it as BLOCKED in the report.

**Test Scenarios:**

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| ADM-001 | Admin dashboard loads | Stats and overview visible |
| ADM-002 | Agents page loads | Agent registry visible |
| ADM-003 | Agent list/chart toggle | Both views work |
| ADM-004 | Agent search works | Filters results |
| ADM-005 | Agent detail panel | Shows agent info |
| ADM-006 | Skills page loads | Skills list visible |
| ADM-007 | SOP library loads | SOP list visible |
| ADM-008 | Organizations page loads | Org list visible |
| ADM-009 | System dashboard loads | Meta agent status visible |
| ADM-010 | Admin-only access verified | Non-admin sees inline "Access Denied" page (per AdminRoute.tsx behavior) |

**Steps:**
1. Confirm TASK 6.5 passed (admin access verified)
2. Navigate to `/admin` and verify dashboard
3. Test `/admin/agents` with list/chart toggle
4. Use `mcp__claude-in-chrome__form_input` for search
5. Navigate to `/admin/skills` and `/admin/sops`
6. Test `/admin/organizations`
7. Verify `/admin/system` renders MetaAgentDashboardPage
8. Test with non-admin user for access denial (verify inline "Access Denied" page renders)

**Acceptance Criteria:**
- [ ] All admin pages accessible to admins
- [ ] Agent registry functions correctly
- [ ] Admin features work as expected
- [ ] Non-admins see inline "Access Denied" page (no redirect, no 403 error code)

---

### TASK 8: Onboarding Flow Testing
- **Priority**: P1
- **Estimated Time**: 25 minutes
- **Dependencies**: TASK 2

**Test Scenarios:**

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| ONB-001 | Onboarding page loads | Wizard renders |
| ONB-002 | Welcome step visible | First step shows |
| ONB-003 | Can progress through steps | Next button works |
| ONB-004 | Slack connect step | OAuth button works |
| ONB-005 | Notion connect step | OAuth button works |
| ONB-006 | First workflow step | Can create workflow |
| ONB-007 | Success step | Completion shown |
| ONB-008 | Can skip steps | Skip button works |
| ONB-009 | Progress indicator | Shows current step |
| ONB-010 | Completion redirect | Goes to dashboard |

**Steps:**
1. Navigate to `/onboarding`
2. Verify OnboardingWizard renders
3. Test each step progression
4. Test skip functionality
5. Complete flow and verify redirect

**Acceptance Criteria:**
- [ ] Onboarding wizard flows correctly
- [ ] Each step works as expected
- [ ] Progress is tracked
- [ ] Completion redirects to dashboard

---

### TASK 9: Search and Conversations Testing
- **Priority**: P2
- **Estimated Time**: 20 minutes
- **Dependencies**: TASK 3

**Test Scenarios:**

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| SRCH-001 | Search page loads | Search input visible |
| SRCH-002 | Search returns results | Results render |
| SRCH-003 | Empty search handled | Shows empty state |
| SRCH-004 | Invalid search handled | Error handled |
| CNV-001 | Conversations page loads | Chat interface visible |
| CNV-002 | Message input works | Can type message |
| CNV-003 | Send message works | Message appears |
| CNV-004 | Streaming response | Response streams in |

**Steps:**
1. Navigate to `/search`
2. Use `mcp__claude-in-chrome__form_input` to enter search query
3. Verify results with `mcp__claude-in-chrome__read_page`
4. Navigate to `/conversations`
5. Test ChatInterface component
6. Send message and verify response

**Acceptance Criteria:**
- [ ] Search functionality works
- [ ] Conversations UI renders
- [ ] Chat interaction works
- [ ] Streaming responses display

---

### TASK 10: Error Handling and Edge Cases
- **Priority**: P1
- **Estimated Time**: 30 minutes
- **Dependencies**: TASK 1-9

**Test Scenarios:**

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| ERR-001 | 404 page for invalid route | Error page shown |
| ERR-002 | Network error handling | Error message shown |
| ERR-003 | Form validation errors | Error messages display |
| ERR-004 | Invalid UUID in URL | Handled gracefully |
| ERR-005 | Empty state handling | Empty states shown |
| ERR-006 | Loading states | Spinners/skeletons shown |
| ERR-007 | Session timeout | Redirect to login |
| ERR-008 | API rate limiting | Error handled |
| ERR-009 | Large data sets | Pagination works |
| ERR-010 | Special characters | Escaped properly |

**Steps:**
1. Navigate to invalid routes
2. Simulate network errors with `mcp__claude-in-chrome__javascript_tool`
3. Submit forms with invalid data
4. Navigate to non-existent entity IDs
5. Test with large data sets
6. Test special character handling

**Acceptance Criteria:**
- [ ] Error boundaries catch errors
- [ ] User-friendly error messages
- [ ] No unhandled exceptions
- [ ] Graceful degradation

---

### TASK 11: Console and Network Monitoring
- **Priority**: P1
- **Estimated Time**: 20 minutes
- **Dependencies**: TASK 1-10 (run continuously)

**Steps:**
1. Use `mcp__claude-in-chrome__read_console_messages` on every page
2. Use `mcp__claude-in-chrome__read_network_requests` on every page
3. Record all console errors/warnings
4. Record all failed network requests (4xx, 5xx)
5. Record slow API responses (>2s)
6. Compile into report

**Acceptance Criteria:**
- [ ] All console errors documented
- [ ] All failed requests documented
- [ ] Performance issues identified
- [ ] No CORS or security errors

---

### TASK 12: Accessibility Testing
- **Priority**: P2
- **Estimated Time**: 30 minutes
- **Dependencies**: TASK 3

**Test Scenarios:**

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| A11Y-001 | Keyboard navigation | Tab order logical |
| A11Y-002 | Focus indicators | Focus visible |
| A11Y-003 | Form labels | All inputs labeled |
| A11Y-004 | Button labels | All buttons accessible |
| A11Y-005 | Alt text for images | Images have alt |
| A11Y-006 | Color contrast | Meets WCAG AA |
| A11Y-007 | Screen reader text | ARIA labels present |
| A11Y-008 | Skip links | Can skip nav |
| A11Y-009 | Modal focus trap | Focus contained |
| A11Y-010 | Error announcements | Errors announced |

**Steps:**
1. Use `mcp__claude-in-chrome__read_page` to check accessibility tree
2. Test keyboard-only navigation
3. Verify ARIA attributes
4. Check color contrast with JS tool
5. Test screen reader experience

**Acceptance Criteria:**
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] ARIA labels present
- [ ] No critical a11y issues

---

### TASK 13: Visual Regression Baseline
- **Priority**: P2
- **Estimated Time**: 30 minutes
- **Dependencies**: TASK 1-10

**Steps:**
1. Navigate to each route
2. Take screenshot using `mcp__claude-in-chrome__computer` (screenshot action)
3. Store in organized structure:
   - `/qa-results/screenshots/login.png`
   - `/qa-results/screenshots/dashboard.png`
   - etc.
4. Create GIF of key workflows using `mcp__claude-in-chrome__gif_creator`

**Acceptance Criteria:**
- [ ] Screenshot of every page
- [ ] GIFs of key workflows
- [ ] Organized file structure
- [ ] Baseline for future comparison

---

### TASK 14: Generate QA Report
- **Priority**: P0
- **Estimated Time**: 30 minutes
- **Dependencies**: All tasks

**Deliverables:**
1. `qa-results/test-execution-report.md` - Pass/fail for each scenario
2. `qa-results/bug-report.md` - All issues found
3. `qa-results/console-errors.md` - JavaScript errors
4. `qa-results/network-issues.md` - Failed requests, slow responses
5. `qa-results/accessibility-audit.md` - A11y findings
6. `qa-results/screenshots/` - Visual evidence

**Report Format:**
```markdown
# Nubabel QA Report - [DATE]

## Executive Summary
- Total Scenarios: X
- Passed: X
- Failed: X
- Blocked: X

## Critical Issues
1. [Issue title] - [Severity] - [Route]

## Test Results by Feature
### Authentication
- AUTH-001: PASS/FAIL
...

## Bug Details
### BUG-001: [Title]
- **Severity**: Critical/High/Medium/Low
- **Route**: /path
- **Steps to Reproduce**:
  1. Step 1
  2. Step 2
- **Expected**: X
- **Actual**: Y
- **Evidence**: [screenshot link]
```

**Acceptance Criteria:**
- [ ] Complete report generated
- [ ] All findings documented
- [ ] Evidence attached
- [ ] Actionable recommendations

---

## Commit Strategy

This is a QA task - no code changes expected. All outputs go to:
- `/Users/sean/Documents/Kyndof/tools/nubabel/qa-results/` directory

---

## Success Criteria

| Criteria | Target | Priority |
|----------|--------|----------|
| Route coverage | 100% (26/26 routes tested) | P0 |
| Critical bugs found | 0 remaining at end | P0 |
| Test execution documented | All scenarios logged | P0 |
| Console error audit | Complete | P1 |
| Network health check | Complete | P1 |
| Accessibility audit | Complete | P2 |
| Visual baseline | Created | P2 |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Auth flow requires real Google account | Use pre-authenticated test profile (`.chrome-test-profile/`). **TASK 0 verifies authentication before proceeding.** |
| Session may expire during long test | TASK 0 catches expired sessions. Re-authenticate if needed. |
| Network flakiness | Retry failed tests, document intermittent issues |
| Page load timeouts | Increase timeouts, document slow pages |
| Missing test data | Create test fixtures before testing |
| Admin access needed | **TASK 6.5 verifies admin access before TASK 7.** If not available, admin testing is skipped and documented. |
| Servers not running | Prerequisites section documents required services. TASK 1 validates connectivity. |

---

## Tool Usage Reference

| Task | Tool | Usage |
|------|------|-------|
| Navigate to page | `mcp__claude-in-chrome__navigate` | `{url: "http://localhost:3001/dashboard"}` |
| Read page structure | `mcp__claude-in-chrome__read_page` | Returns accessibility tree |
| Find element | `mcp__claude-in-chrome__find` | `{query: "login button"}` |
| Click/type | `mcp__claude-in-chrome__computer` | `{action: "click", x: 100, y: 200}` |
| Fill form | `mcp__claude-in-chrome__form_input` | `{selector: "input[name=email]", value: "test@test.com"}` |
| Run JS | `mcp__claude-in-chrome__javascript_tool` | `{code: "document.querySelector('...')"}` |
| Screenshot | `mcp__claude-in-chrome__computer` | `{action: "screenshot"}` |
| Record GIF | `mcp__claude-in-chrome__gif_creator` | Records interaction sequence |
| Console logs | `mcp__claude-in-chrome__read_console_messages` | Returns console output |
| Network | `mcp__claude-in-chrome__read_network_requests` | Returns request/response log |

---

**PLANNING_COMPLETE**
