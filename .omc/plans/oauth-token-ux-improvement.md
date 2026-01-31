# OAuth Token UX Improvement Plan

## Context

### Original Request
Improve the Claude connection UX by supporting the new OAuth token format (`sk-ant-oat01-*`) alongside the existing session key format (`sk-ant-sid*`), with a redesigned frontend experience that prioritizes the simpler `claude get-token` CLI command flow.

### Interview Summary
- **Primary Goal:** UX improvement - make connecting Claude accounts easier
- **Token Types:** Support both `sk-ant-oat01-*` (OAuth, new) and `sk-ant-sid*` (session key, legacy)
- **OAuth Source:** Users obtain tokens via `claude get-token` CLI command (no OAuth flow implementation needed)
- **Frontend Focus:** Two-tab design with "Quick Connect" (CLI) as primary, "Manual" (bookmarklet) as fallback
- **Backend:** Extend validation to accept both formats, validate OAuth permissions
- **Error Handling:** 3x automatic retry for transient API errors
- **Storage:** Already secure in PostgreSQL (no changes needed)

### Research Findings
- **Current Frontend:** `frontend/src/pages/ClaudeConnectPage.tsx` - 454 lines, uses wizard-style flow with bookmarklet/console script methods
- **Current Backend:** `src/api/claude-connect.ts` - validates only `sk-ant-sid*` format on line 100
- **UI Patterns:** Project uses Tailwind CSS, lucide-react icons, no dedicated Tab component but similar patterns exist in `InviteFromServicesModal.tsx`
- **Token Validation:** Also exists in `src/api/organization-settings.ts` (line 87) and `src/config/env-validation.ts` (line 81)

---

## Work Objectives

### Core Objective
Redesign the Claude connection experience to support OAuth tokens with a modern, streamlined UI that guides users to the simplest connection method first.

### Deliverables
1. Redesigned ClaudeConnectPage with two-tab interface
2. Backend token validation supporting both formats
3. Auto-validation on token paste with visual feedback
4. Improved error messages guiding users toward OAuth tokens

### Definition of Done
- [ ] Both `sk-ant-oat01-*` and `sk-ant-sid*` tokens are accepted and validated
- [ ] Frontend shows two tabs: "Quick Connect" (primary) and "Manual" (fallback)
- [ ] Token auto-validates on paste with success animation or inline error
- [ ] Error messages are clear and actionable
- [ ] All existing tests pass
- [ ] No TypeScript errors

---

## Guardrails

### Must Have
- Support for both token formats during transition period
- Clear visual distinction between primary and fallback methods
- Auto-validation on paste (no manual "validate" button needed)
- Success animation on valid token
- Inline error messages (not alerts/modals)
- Backward compatibility with existing session key flow

### Must NOT Have
- OAuth flow implementation (users get tokens from CLI)
- Changes to token storage/encryption (already secure)
- Removal of bookmarklet method (keep as fallback)
- Breaking changes to existing `/api/claude-connect/*` endpoints

---

## Task Flow and Dependencies

```
[1] Backend Token Validation
    |
    v
[2] Frontend Tab Component -----> [3] Quick Connect Tab
    |                                  |
    v                                  v
[4] Manual Tab (refactor)         [5] Auto-Validation Hook
    |                                  |
    +-----------> [6] Integration & Testing <-----------+
                          |
                          v
                  [7] Polish & Cleanup
```

---

## Detailed TODOs

### TODO 1: Extend Backend Token Validation
**Priority:** HIGH | **Estimate:** 30 min | **Agent:** executor

**Description:**
Update token validation in `src/api/claude-connect.ts` to accept both `sk-ant-oat01-*` (OAuth) and `sk-ant-sid*` (session key) formats.

**Files to modify:**
- `src/api/claude-connect.ts` (line 99-104)

**Implementation:**
```typescript
// Replace single format check with multi-format validation
const isValidTokenFormat = (token: string): { valid: boolean; type: 'oauth' | 'session' | null } => {
  if (token.startsWith('sk-ant-oat01-')) return { valid: true, type: 'oauth' };
  if (token.startsWith('sk-ant-sid')) return { valid: true, type: 'session' };
  return { valid: false, type: null };
};
```

**Acceptance Criteria:**
- [ ] Both `sk-ant-oat01-*` and `sk-ant-sid*` tokens pass validation
- [ ] Invalid tokens return clear error message suggesting correct format
- [ ] Token type is logged for observability
- [ ] Existing tests still pass

---

### TODO 2: Add Token Validation API Endpoint
**Priority:** HIGH | **Estimate:** 20 min | **Agent:** executor
**Depends on:** TODO 1

**Description:**
Add a new endpoint `/api/claude-connect/validate-token` for frontend auto-validation that checks format and optionally tests the token against Claude API.

**Files to modify:**
- `src/api/claude-connect.ts`

**Implementation:**
```typescript
// POST /api/claude-connect/validate-token
// Body: { token: string }
// Response: { valid: boolean, type: 'oauth' | 'session' | null, error?: string }
```

**Acceptance Criteria:**
- [ ] Endpoint validates token format
- [ ] Returns token type on success
- [ ] Returns helpful error message on failure
- [ ] Does NOT store the token (validation only)

---

### TODO 3: Create Tab Component for ClaudeConnectPage
**Priority:** HIGH | **Estimate:** 30 min | **Agent:** designer

**Description:**
Create a clean, accessible tab component for switching between "Quick Connect" and "Manual" methods.

**Files to create/modify:**
- `frontend/src/pages/ClaudeConnectPage.tsx`

**Design Spec:**
- Two tabs: "Quick Connect" (default active), "Manual"
- Active tab: indigo-600 background, white text, slight shadow
- Inactive tab: gray-100 background, gray-600 text
- Smooth transition animation on tab switch
- Tab content area with consistent padding

**Acceptance Criteria:**
- [ ] Tabs are keyboard accessible (arrow keys, tab, enter)
- [ ] Active state is visually clear
- [ ] Tab switch is animated smoothly
- [ ] Quick Connect tab is active by default

---

### TODO 4: Implement Quick Connect Tab Content
**Priority:** HIGH | **Estimate:** 45 min | **Agent:** designer
**Depends on:** TODO 3

**Description:**
Build the "Quick Connect" tab with CLI command display and token paste field with auto-validation.

**Layout:**
```
+------------------------------------------+
|  Step 1: Get Your Token                  |
|  ----------------------------------------|
|  Run this command in your terminal:      |
|  +------------------------------------+  |
|  | $ claude get-token        [Copy]  |  |
|  +------------------------------------+  |
|                                          |
|  Step 2: Paste Your Token                |
|  ----------------------------------------|
|  +------------------------------------+  |
|  | sk-ant-oat01-...          [icon]  |  |
|  +------------------------------------+  |
|  [Success checkmark or error inline]     |
|                                          |
|  Step 3: Name Your Account               |
|  ----------------------------------------|
|  [Nickname input]  [Priority input]      |
|                                          |
|  [Connect Account Button]                |
+------------------------------------------+
```

**Acceptance Criteria:**
- [ ] CLI command is displayed in monospace with copy button
- [ ] Token input auto-validates on paste (debounced 500ms)
- [ ] Valid token shows green checkmark with animation
- [ ] Invalid token shows inline error message
- [ ] Step 3 only appears after valid token
- [ ] Connect button disabled until valid token + nickname

---

### TODO 5: Refactor Manual Tab Content
**Priority:** MEDIUM | **Estimate:** 30 min | **Agent:** designer
**Depends on:** TODO 3

**Description:**
Move existing bookmarklet/console script flow into the "Manual" tab with simplified presentation.

**Changes:**
- Extract existing steps 1-2 content into Manual tab
- Simplify instructions
- Keep bookmarklet and console script options
- Add note: "Prefer Quick Connect for the easiest experience"

**Acceptance Criteria:**
- [ ] All existing functionality preserved
- [ ] Instructions are clearer and more concise
- [ ] Visual hierarchy guides user through steps
- [ ] Note encourages Quick Connect method

---

### TODO 6: Implement Auto-Validation Hook
**Priority:** HIGH | **Estimate:** 30 min | **Agent:** executor
**Depends on:** TODO 2

**Description:**
Create a custom React hook for token auto-validation with debouncing, loading states, and error handling.

**Files to create:**
- `frontend/src/hooks/useTokenValidation.ts`

**API:**
```typescript
interface UseTokenValidationResult {
  validationState: 'idle' | 'validating' | 'valid' | 'invalid';
  tokenType: 'oauth' | 'session' | null;
  error: string | null;
  validate: (token: string) => void;
}

function useTokenValidation(debounceMs?: number): UseTokenValidationResult;
```

**Acceptance Criteria:**
- [ ] Debounces validation requests (default 500ms)
- [ ] Shows loading state during validation
- [ ] Returns token type on success
- [ ] Returns user-friendly error on failure
- [ ] Cancels pending requests on unmount

---

### TODO 7: Add Success Animation Component
**Priority:** LOW | **Estimate:** 20 min | **Agent:** designer
**Depends on:** TODO 4

**Description:**
Create a subtle success animation for valid token detection.

**Spec:**
- Green checkmark that scales in (0 -> 1.2 -> 1.0)
- Fade in over 300ms
- Optional confetti burst (small, not overwhelming)
- Accessible: respects prefers-reduced-motion

**Acceptance Criteria:**
- [ ] Animation is smooth and professional
- [ ] Works on all modern browsers
- [ ] Respects prefers-reduced-motion
- [ ] Does not distract from next step

---

### TODO 8: Update Error Messages
**Priority:** MEDIUM | **Estimate:** 20 min | **Agent:** executor
**Depends on:** TODO 1

**Description:**
Improve error messages throughout the flow to guide users toward OAuth tokens.

**Error Message Updates:**

| Scenario | Current Message | New Message |
|----------|-----------------|-------------|
| Invalid format | "Invalid token format. Expected..." | "This doesn't look like a Claude token. Run `claude get-token` to get a valid token." |
| Empty token | "token and code are required" | "Please paste your token from `claude get-token`" |
| Expired token | Generic error | "This token may have expired. Run `claude get-token` again to get a fresh token." |

**Acceptance Criteria:**
- [ ] All error messages mention `claude get-token` as the solution
- [ ] Messages are friendly and actionable
- [ ] No technical jargon in user-facing messages

---

### TODO 9: Integration Testing
**Priority:** HIGH | **Estimate:** 30 min | **Agent:** qa-tester
**Depends on:** TODO 4, TODO 5, TODO 6

**Description:**
Test the complete flow for both OAuth and session key tokens.

**Test Scenarios:**
1. Quick Connect with valid OAuth token (`sk-ant-oat01-...`)
2. Quick Connect with valid session key (`sk-ant-sid...`)
3. Quick Connect with invalid token
4. Manual flow with bookmarklet
5. Tab switching preserves state
6. Error recovery flow

**Acceptance Criteria:**
- [ ] All scenarios pass
- [ ] No console errors
- [ ] Accessibility audit passes
- [ ] Mobile responsive

---

### TODO 10: Cleanup and Polish
**Priority:** LOW | **Estimate:** 20 min | **Agent:** executor
**Depends on:** TODO 9

**Description:**
Final cleanup: remove dead code, ensure consistent styling, update any related documentation.

**Tasks:**
- Remove unused state variables
- Ensure consistent spacing/padding
- Verify all imports are used
- Run linter and fix warnings
- Update security note at bottom of page

**Acceptance Criteria:**
- [ ] No unused code
- [ ] No linter warnings
- [ ] TypeScript strict mode passes
- [ ] Code is well-commented

---

## Commit Strategy

| Commit | Tasks | Message |
|--------|-------|---------|
| 1 | TODO 1, 2 | `feat(claude-connect): support OAuth token format (sk-ant-oat01-*)` |
| 2 | TODO 3, 4, 5 | `feat(frontend): redesign ClaudeConnectPage with two-tab UX` |
| 3 | TODO 6, 7 | `feat(frontend): add token auto-validation with success animation` |
| 4 | TODO 8, 10 | `chore(claude-connect): improve error messages and cleanup` |

---

## Success Criteria

### Functional
- [ ] OAuth tokens (`sk-ant-oat01-*`) are accepted end-to-end
- [ ] Session keys (`sk-ant-sid*`) continue to work (backward compatible)
- [ ] Auto-validation provides immediate feedback on paste
- [ ] Error messages guide users to correct action

### UX
- [ ] 80% of new connections use Quick Connect tab (trackable via metadata)
- [ ] Time to successful connection reduced (subjective, verify via testing)
- [ ] Zero user confusion about which method to use

### Technical
- [ ] No TypeScript errors
- [ ] All existing tests pass
- [ ] No regression in existing bookmarklet flow
- [ ] Clean code review approval

---

## Notes for Executor

1. **Token validation regex:** OAuth tokens appear to follow `sk-ant-oat01-[base64-chars]` pattern. Validate prefix only, don't assume specific length.

2. **Metadata tracking:** When saving account, include `connectedVia: 'oauth-cli'` vs `'bookmarklet'` to track adoption.

3. **Future consideration:** OAuth tokens may need scope validation. Leave a TODO comment for this if not implementing now.

4. **Test tokens:** For development, create mock tokens that pass format validation but skip API verification.
