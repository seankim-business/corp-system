# Members Page Identity Integration

## Summary

Updated the Members page to display linked external identities (Slack, Google, Notion) for each organization member with comprehensive filtering and statistics.

## Files Modified

### 1. New Hook: `frontend/src/hooks/useMemberIdentities.ts`
- React Query hook for fetching all linked identities in the organization
- Groups identities by userId for efficient lookup
- Auto-refreshes every 60 seconds

### 2. Enhanced Page: `frontend/src/pages/MembersPage.tsx`
Complete redesign with identity awareness

## Features Added

### 1. Statistics Dashboard
Six stat cards showing:
- Total Members
- Slack Linked (purple badge with MessageSquare icon)
- Google Linked (blue badge with Mail icon)
- Notion Linked (gray badge with FileText icon)
- Fully Linked (green badge - all 3 providers)
- No Links (orange badge)

### 2. Identity Badges
Each member row shows linked account badges:
- **Linked accounts**: Colored badges (purple/Slack, blue/Google, gray/Notion)
- **Unlinked accounts**: Greyed-out badges with border
- **Hover tooltips**: Show linked email/display name

### 3. Advanced Filtering
Two filter dropdowns:
- **Provider Filter**: All, Slack Only, Google Only, Notion Only
- **Link Status Filter**: All, Has Linked Accounts, No Linked Accounts
- **Counter**: Shows "X of Y members" after filtering

### 4. Enhanced Table
New "Linked Accounts" column between Member and Role:
- Shows all 3 provider badges (colored if linked, greyed if not)
- Tooltips reveal linked account details
- Responsive layout

### 5. Empty States
- Original: "No members yet" when table is empty
- New: "No members match filters" when filters return no results

## Visual Design

### Color Palette
- **Slack**: Purple (`bg-purple-100 text-purple-600`)
- **Google**: Blue (`bg-blue-100 text-blue-600`)
- **Notion**: Gray (`bg-gray-100 text-gray-600`)
- **Fully Linked**: Green (`bg-green-50`)
- **No Links**: Orange (`bg-orange-50`)

### Icons (lucide-react)
- `MessageSquare` - Slack
- `Mail` - Google
- `FileText` - Notion
- `Link` - Fully linked status

### Tooltips
Dark tooltips appear on hover above badges showing:
- Email address (if available)
- Display name (if available)
- Fallback: "{Provider} Account"

## API Integration

Uses existing admin identity API:
```
GET /api/admin/identities?status=linked&limit=1000
```

Returns identities with:
- provider (slack/google/notion)
- userId (linked user)
- email, displayName, avatarUrl
- linkStatus, linkMethod, linkedAt

## User Experience Flow

1. **Page Load**
   - Fetches members list
   - Fetches all linked identities in parallel
   - Groups identities by userId
   - Calculates statistics

2. **Filtering**
   - User selects provider (e.g., "Slack Only")
   - Table filters to show only members with Slack linked
   - Counter updates: "5 of 12 members"

3. **Hover Interaction**
   - User hovers over Slack badge
   - Tooltip appears: "john.doe@company.com"

4. **Visual Scan**
   - Quick glance at stat cards shows org-wide status
   - Greyed badges reveal gaps in coverage
   - Green "Fully Linked" stat highlights well-integrated members

## Performance Considerations

- React Query caching (60s stale time)
- Single API call for all identities (not N+1)
- In-memory Map for O(1) identity lookup
- Efficient filtering with early returns

## Accessibility

- Semantic HTML table structure
- Label/select associations for filters
- Title attributes on all badges (screen reader support)
- Color + text + icon for all states (not color-only)

## Future Enhancements

Potential additions:
- Click badge to view full identity details
- Bulk actions (e.g., "Invite all unlinked members")
- Export members with identity data
- Timeline showing when accounts were linked
- Admin action: Link identity directly from this page

## Testing Checklist

- [ ] Page loads without errors
- [ ] Statistics calculate correctly
- [ ] Filters work independently and combined
- [ ] Tooltips appear on hover
- [ ] Greyed badges show for unlinked accounts
- [ ] Colored badges show for linked accounts
- [ ] Counter updates after filtering
- [ ] Empty states appear correctly
- [ ] Responsive on mobile/tablet/desktop

## Related Files

- `/api/admin/identities` - Backend API endpoint
- `src/hooks/useIdentityAdmin.ts` - Admin identity hooks
- `src/pages/admin/IdentityManagement.tsx` - Admin identity page
- `src/services/identity/` - Identity service layer
