#!/bin/bash

# Test script for CSRF token verification on Notion settings page
# This script will guide manual testing steps

echo "==================================="
echo "CSRF Token Test for Notion Settings"
echo "==================================="
echo ""
echo "Prerequisites:"
echo "1. Chrome with 'Claude in chrome' profile must be running"
echo "2. You should be logged in to https://app.nubabel.com"
echo ""
echo "Test Steps:"
echo ""
echo "Step 1: Open Developer Tools"
echo "  - Press Cmd+Option+I in Chrome"
echo "  - Go to 'Network' tab"
echo "  - Check 'Preserve log' option"
echo ""
echo "Step 2: Navigate to Settings > Notion"
echo "  - Go to https://app.nubabel.com"
echo "  - Click on Settings (in sidebar)"
echo "  - Click on Notion"
echo ""
echo "Step 3: Check CSRF Cookie"
echo "  - In DevTools, go to 'Application' tab"
echo "  - Look for 'Cookies' in the left sidebar"
echo "  - Expand https://app.nubabel.com"
echo "  - Look for 'csrf_token' cookie"
echo "  - Note: Value, Domain, Path, Secure, HttpOnly, SameSite settings"
echo ""
echo "Step 4: Check Network Requests"
echo "  - Go back to 'Network' tab"
echo "  - Trigger a POST request (e.g., try to connect Notion)"
echo "  - Look for the POST request in the list"
echo "  - Click on it to see details"
echo ""
echo "Step 5: Verify Headers"
echo "  - In the request details, check 'Request Headers'"
echo "  - Look for 'X-CSRF-Token' header"
echo "  - Compare its value with the cookie value"
echo ""
echo "Step 6: Check Response (if 403 error)"
echo "  - Look at 'Response' tab"
echo "  - Note the error message"
echo "  - Check 'Preview' tab for formatted response"
echo ""
echo "Step 7: Console Check"
echo "  - Go to 'Console' tab"
echo "  - Type: document.cookie"
echo "  - Press Enter"
echo "  - Copy the full output"
echo ""
echo "==================================="
echo "Automated Check (if logged in):"
echo "==================================="
echo ""

# Try to open Chrome and navigate
osascript <<EOF
tell application "Google Chrome"
    activate
    set targetUrl to "https://app.nubabel.com/settings/notion"

    -- Find or create tab with target URL
    set found to false
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t contains "app.nubabel.com" then
                set active tab index of w to (index of t)
                set URL of t to targetUrl
                set found to true
                exit repeat
            end if
        end repeat
        if found then exit repeat
    end repeat

    if not found then
        tell window 1
            set newTab to make new tab with properties {URL:targetUrl}
        end tell
    end if

    return "Chrome opened to Notion settings page"
end tell
EOF

echo ""
echo "Chrome should now be showing the Notion settings page."
echo "Please follow the manual steps above to check CSRF token implementation."
echo ""
echo "Report the following information:"
echo "  1. Is csrf_token cookie present?"
echo "  2. Cookie attributes (Secure, HttpOnly, SameSite)"
echo "  3. Is X-CSRF-Token header sent in POST requests?"
echo "  4. Header value matches cookie value?"
echo "  5. Any 403 errors? If yes, what's the response body?"
echo "  6. Full document.cookie output"
echo ""
