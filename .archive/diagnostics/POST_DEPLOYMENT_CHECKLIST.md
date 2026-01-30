# Post-Deployment Testing Checklist

Use this checklist after the deployment issue is resolved.

---

## Pre-Testing Setup

- [ ] Verify https://auth.nubabel.com returns 200 OK (not 404)
- [ ] Open browser DevTools (F12)
- [ ] Clear browser cache and cookies
- [ ] Prepare test credentials (Google account)
- [ ] Have GitHub PR URL ready for testing

---

## 1. Login & Authentication Tests

### 1.1 Initial Page Load
- [ ] Navigate to https://auth.nubabel.com
- [ ] Verify page loads without errors
- [ ] Check console for JavaScript errors (should be none)
- [ ] Verify "Nubabel" heading displays
- [ ] Verify "AI-Powered Workflow Automation" subtitle displays
- [ ] Verify Google sign-in button is visible
- [ ] Verify button has Google logo

### 1.2 Visual Design
- [ ] Background has blue-to-indigo gradient
- [ ] Card is white with rounded corners
- [ ] Card has shadow effect
- [ ] Layout is centered on screen
- [ ] No broken images

### 1.3 Google OAuth Flow
- [ ] Click "Sign in with Google" button
- [ ] Verify redirects to Google OAuth consent screen
- [ ] Complete Google sign-in
- [ ] Verify redirects back to application
- [ ] Verify lands on /dashboard (not /login)

### 1.4 Error Handling
- [ ] Test with `?error=session_expired` in URL
- [ ] Verify red error box appears
- [ ] Verify error message is clear
- [ ] Verify URL is cleaned after display

---

## 2. Org Changes Page Tests

### 2.1 Page Access
- [ ] Navigate to /org-changes
- [ ] Verify page loads without errors
- [ ] Check console for errors (should be none)
- [ ] Verify "Organization Changes" heading displays
- [ ] Verify subtitle displays

### 2.2 Table Structure
- [ ] Verify table is visible
- [ ] Verify table headers are present:
  - [ ] Type
  - [ ] Description
  - [ ] Impact
  - [ ] **PR Status** (NEW in Phase 3)
  - [ ] Date

### 2.3 Filter Controls
- [ ] Verify "Filter by Type" dropdown is visible
- [ ] Click Type dropdown
- [ ] Verify options appear:
  - [ ] All Types
  - [ ] New Member
  - [ ] Role Change
  - [ ] Workflow Added
  - [ ] Workflow Deleted
  - [ ] Integration Added
  - [ ] Settings Changed
- [ ] Select a filter option
- [ ] Verify table updates (check Network tab)

- [ ] Verify "Filter by Impact" dropdown is visible
- [ ] Click Impact dropdown
- [ ] Verify options appear:
  - [ ] All Impact Levels
  - [ ] Low
  - [ ] Medium
  - [ ] High
- [ ] Select a filter option
- [ ] Verify table updates

### 2.4 PR Status Column (PHASE 3 FEATURE)

If organization changes exist:

**Test Case 1: Change with Linked PR**
- [ ] Find a row with a linked PR
- [ ] Verify PR badge is visible
- [ ] Verify badge shows PR number (e.g., "#123")
- [ ] Verify badge color matches PR state:
  - [ ] Purple background for "merged"
  - [ ] Green background for "open"
  - [ ] Gray background for "closed"
- [ ] Click the PR badge
- [ ] Verify opens GitHub PR in new tab
- [ ] Verify GitHub URL is correct

**Test Case 2: Refresh PR Status**
- [ ] Find the 🔄 (refresh) icon next to PR badge
- [ ] Click the refresh icon
- [ ] Verify loading indicator or state update
- [ ] Check Network tab for API call to `/api/org-changes/:id/pr-status`
- [ ] Verify PR status updates if changed

**Test Case 3: Link New PR**
- [ ] Find a row without a linked PR
- [ ] Verify "+ Link PR" button is visible
- [ ] Click "+ Link PR" button
- [ ] Verify input field appears
- [ ] Verify "Link" and "Cancel" buttons appear
- [ ] Enter invalid URL (e.g., "not-a-url")
- [ ] Click "Link" button
- [ ] Verify error message appears
- [ ] Click "Cancel" button
- [ ] Verify input disappears

**Test Case 4: Successfully Link PR**
- [ ] Click "+ Link PR" again
- [ ] Enter valid GitHub PR URL (e.g., "https://github.com/owner/repo/pull/123")
- [ ] Click "Link" button
- [ ] Check Network tab for POST to `/api/org-changes/:id/link-pr`
- [ ] Verify PR badge appears after successful link
- [ ] Verify badge shows correct PR number
- [ ] Verify badge is clickable

**Empty State:**
- [ ] If no changes exist, verify empty state shows:
  - [ ] 📋 icon
  - [ ] "No changes yet" message
  - [ ] Descriptive text

### 2.5 Pagination
- [ ] Scroll to bottom of page
- [ ] Verify "Previous" and "Next" buttons are visible
- [ ] Verify "Showing X to Y" text is visible
- [ ] Click "Next" button
- [ ] Verify table content changes
- [ ] Verify page number updates
- [ ] Click "Previous" button
- [ ] Verify returns to previous page
- [ ] Verify "Previous" is disabled on first page
- [ ] Verify "Next" is disabled on last page

### 2.6 Loading States
- [ ] Refresh the page
- [ ] Verify loading spinner appears
- [ ] Verify "Loading organization changes..." text shows
- [ ] Verify spinner disappears when data loads

---

## 3. Responsive Design Tests

### 3.1 Mobile (375px width)
- [ ] Resize browser to 375px width or use DevTools device mode
- [ ] Test Login page:
  - [ ] Card fits on screen
  - [ ] No horizontal scrolling
  - [ ] Button is large enough to tap
- [ ] Test Org Changes page:
  - [ ] Table scrolls horizontally if needed
  - [ ] Filters are usable
  - [ ] Pagination buttons are tappable

### 3.2 Tablet (768px width)
- [ ] Resize to 768px
- [ ] Verify layout adapts properly
- [ ] Verify no overlapping elements
- [ ] Test all interactive elements

### 3.3 Desktop (1920px width)
- [ ] Resize to 1920px
- [ ] Verify content doesn't stretch awkwardly
- [ ] Verify table columns are readable
- [ ] Verify layout looks polished

---

## 4. Tailwind CSS Verification

### 4.1 Visual Inspection
- [ ] Verify rounded corners on cards
- [ ] Verify proper spacing (padding/margin)
- [ ] Verify shadow effects on cards
- [ ] Verify hover effects on buttons
- [ ] Verify color scheme is consistent

### 4.2 Interactive States
- [ ] Hover over buttons - verify color change
- [ ] Hover over table rows - verify highlight
- [ ] Hover over links - verify underline or color change
- [ ] Focus on input fields - verify border color change

---

## 5. Network & Performance Tests

### 5.1 Network Activity
- [ ] Open DevTools Network tab
- [ ] Refresh page
- [ ] Verify no 404 errors for assets
- [ ] Verify no 500 errors from API
- [ ] Verify CSS and JS files load successfully
- [ ] Check API calls:
  - [ ] `/api/org-changes` returns 200
  - [ ] Response has `data` and `pagination` fields
  - [ ] PR metadata is included when available

### 5.2 Performance Metrics
- [ ] Open DevTools Performance/Lighthouse tab
- [ ] Run Lighthouse audit
- [ ] Check scores:
  - [ ] Performance > 80
  - [ ] Accessibility > 90
  - [ ] Best Practices > 90
  - [ ] SEO > 80
- [ ] Check Core Web Vitals:
  - [ ] LCP < 2.5s
  - [ ] FID < 100ms
  - [ ] CLS < 0.1

---

## 6. Browser Compatibility Tests

### 6.1 Chrome (Latest)
- [ ] All features work
- [ ] No console errors
- [ ] UI renders correctly

### 6.2 Firefox (Latest)
- [ ] All features work
- [ ] No console errors
- [ ] UI renders correctly

### 6.3 Safari (Latest)
- [ ] All features work
- [ ] No console errors
- [ ] UI renders correctly

### 6.4 Edge (Latest)
- [ ] All features work
- [ ] No console errors
- [ ] UI renders correctly

---

## 7. Error Scenarios

### 7.1 Network Errors
- [ ] Disable network in DevTools
- [ ] Try to load page
- [ ] Verify graceful error handling
- [ ] Re-enable network
- [ ] Verify recovery

### 7.2 API Errors
- [ ] Test with invalid API endpoint (manually modify request)
- [ ] Verify error messages appear
- [ ] Verify application doesn't crash

### 7.3 Authentication Errors
- [ ] Log out
- [ ] Try to access /org-changes directly
- [ ] Verify redirects to /login
- [ ] Verify protected route works

---

## 8. Accessibility Tests

### 8.1 Keyboard Navigation
- [ ] Tab through all interactive elements
- [ ] Verify tab order is logical
- [ ] Verify focus indicators are visible
- [ ] Press Enter on buttons - verify they activate
- [ ] Press Escape on modals - verify they close

### 8.2 Screen Reader
- [ ] Use VoiceOver (Mac) or NVDA (Windows)
- [ ] Navigate through page
- [ ] Verify all content is announced
- [ ] Verify button labels are clear
- [ ] Verify table structure is announced

### 8.3 Contrast & Colors
- [ ] Verify text is readable
- [ ] Verify color contrast meets WCAG AA standards
- [ ] Test with high contrast mode

---

## 9. Data Validation Tests

### 9.1 PR URL Validation
- [ ] Try to link PR with empty URL
- [ ] Try to link PR with invalid URL
- [ ] Try to link PR with non-GitHub URL
- [ ] Try to link PR with valid GitHub URL
- [ ] Verify appropriate feedback for each case

### 9.2 Filter Combinations
- [ ] Select Type: "New Member" + Impact: "High"
- [ ] Verify both filters applied
- [ ] Clear one filter
- [ ] Verify other filter remains active
- [ ] Clear all filters
- [ ] Verify shows all results

---

## 10. Console & Error Check

### 10.1 Browser Console
- [ ] No JavaScript errors in console
- [ ] No React warnings
- [ ] No network errors
- [ ] No CORS errors
- [ ] No 404s for assets

### 10.2 React DevTools
- [ ] Install React DevTools extension
- [ ] Verify components render correctly
- [ ] Check component props are correct
- [ ] Check state updates properly

---

## Sign-Off

**Tester Name:** ________________
**Date:** ________________
**Environment:** Production / Staging / Local
**Build Version:** ________________

**Overall Status:**
- [ ] All critical tests passed
- [ ] All high-priority tests passed
- [ ] Known issues documented
- [ ] Ready for release

**Issues Found:** ________________

**Notes:**
_______________________________________________________
_______________________________________________________
_______________________________________________________

---

## Quick Reference - Expected API Responses

### GET /api/org-changes
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "workflow_added",
      "description": "New workflow created",
      "impactLevel": "medium",
      "createdBy": "user@example.com",
      "createdAt": "2026-01-30T12:00:00Z",
      "prUrl": "https://github.com/owner/repo/pull/123",
      "metadata": {
        "pr": {
          "number": 123,
          "title": "Add new feature",
          "state": "merged",
          "author": "username",
          "lastSynced": "2026-01-30T12:05:00Z"
        }
      }
    }
  ],
  "pagination": {
    "total": 50,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### POST /api/org-changes/:id/link-pr
```json
Request:
{
  "prUrl": "https://github.com/owner/repo/pull/123"
}

Response: 200 OK
{
  "message": "PR linked successfully"
}
```

### GET /api/org-changes/:id/pr-status
```json
Response: 200 OK
{
  "pr": {
    "number": 123,
    "title": "Add new feature",
    "state": "merged",
    "author": "username",
    "lastSynced": "2026-01-30T12:10:00Z"
  }
}
```
