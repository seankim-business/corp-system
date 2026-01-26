# Status Badge Quick Reference

Fast lookup guide for status badge colors, icons, and patterns.

## Color Palette Quick Reference

### Success (Green)
```
Background: #ECFDF5 | Text: #065F46 | Border: #A7F3D0
Dark: #10B981 (text: white)
Icon: ✓ | Label: Success
```

### Error (Red)
```
Background: #FEF2F2 | Text: #7F1D1D | Border: #FECACA
Dark: #EF4444 (text: white)
Icon: ✗ | Label: Error
```

### Warning (Amber)
```
Background: #FFFBEB | Text: #78350F | Border: #FCD34D
Dark: #F59E0B (text: white)
Icon: ⚠ | Label: Warning
```

### Info (Blue)
```
Background: #F0F9FF | Text: #1E40AF | Border: #BFDBFE
Dark: #3B82F6 (text: white)
Icon: ℹ | Label: Info
```

### Pending (Gray)
```
Background: #F3F4F6 | Text: #374151 | Border: #D1D5DB
Dark: #6B7280 (text: white)
Icon: ⏳ | Label: Pending
```

## Tailwind CSS Classes

```tsx
// Success
<span className="bg-green-100 text-green-800 border border-green-300">✓ Success</span>

// Error
<span className="bg-red-100 text-red-800 border border-red-300">✗ Error</span>

// Warning
<span className="bg-yellow-100 text-yellow-800 border border-yellow-300">⚠ Warning</span>

// Info
<span className="bg-blue-100 text-blue-800 border border-blue-300">ℹ Info</span>

// Pending (with animation)
<span className="bg-gray-100 text-gray-800 border border-gray-300 animate-pulse">⏳ Pending</span>
```

## Icon Reference

| Status | Icon | Unicode | Emoji |
|--------|------|---------|-------|
| Success | ✓ | U+2713 | ✅ |
| Error | ✗ | U+2717 | ❌ |
| Warning | ⚠ | U+26A0 | ⚠️ |
| Info | ℹ | U+2139 | ℹ️ |
| Pending | ⏳ | U+23F3 | ⏳ |
| Running | ⟳ | U+27F3 | 🔄 |
| Cancelled | ⊘ | U+2298 | 🚫 |

## Workflow State Mapping

```typescript
const stateMapping = {
  'pending': { status: 'pending', icon: '⏳', color: 'gray' },
  'running': { status: 'info', icon: '⟳', color: 'blue' },
  'success': { status: 'success', icon: '✓', color: 'green' },
  'failed': { status: 'error', icon: '✗', color: 'red' },
  'cancelled': { status: 'warning', icon: '⊘', color: 'yellow' }
};
```

## Animation Classes

```css
/* Pending/Loading */
.animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

/* Running */
.animate-spin { animation: spin 1s linear infinite; }

/* Error */
.animate-shake { animation: shake 0.5s ease-in-out; }

/* Success */
.animate-bounce { animation: bounce 1s infinite; }
```

## Accessibility Checklist

- [ ] Color + Icon + Text (not color alone)
- [ ] ARIA labels: `role="status"` and `aria-label`
- [ ] Contrast ratio ≥ 4.5:1 (WCAG AA)
- [ ] Respect `prefers-reduced-motion`
- [ ] Keyboard accessible (if interactive)
- [ ] Screen reader friendly

## Common Patterns

### Simple Badge
```tsx
<span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-300">
  ✓ Success
</span>
```

### With Tooltip
```tsx
<div className="relative inline-block group">
  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
    ✓ Success
  </span>
  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
    Workflow completed successfully
  </div>
</div>
```

### With Progress
```tsx
<div className="flex items-center gap-4">
  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
    ⟳ Running
  </span>
  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
    <div className="h-full bg-blue-500" style={{ width: '45%' }} />
  </div>
  <span className="text-xs text-gray-600">45%</span>
</div>
```

### In Table
```tsx
<td className="px-6 py-4 whitespace-nowrap">
  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-300">
    ✓ Success
  </span>
</td>
```

## Design System Implementations

### Material Design 3
- Success: #4CAF50 on #E8F5E9
- Error: #F44336 on #FFEBEE
- Warning: #FF9800 on #FFF3E0
- Info: #2196F3 on #E3F2FD

### Ant Design
- Success: #52C41A on #F6FFED
- Error: #FF4D4F on #FFF1F0
- Warning: #FAAD14 on #FFFBE6
- Processing: #1890FF on #E6F7FF

### Chakra UI
- Success: #48BB78 on #C6F6D5
- Error: #F56565 on #FED7D7
- Warning: #ED8936 on #FEEBC8
- Info: #4299E1 on #BEE3F8

## Performance Tips

1. **Use GPU-accelerated animations**: `transform`, `opacity` only
2. **Avoid animating**: `width`, `height`, `margin`, `padding`
3. **Use `will-change`**: `will-change: transform;`
4. **Memoize components**: `React.memo()` to prevent re-renders
5. **Debounce updates**: Batch status changes
6. **Lazy load icons**: Use code splitting for icon libraries

## Contrast Ratios (WCAG 2.1)

| Combination | Ratio | Level |
|------------|-------|-------|
| #ECFDF5 + #065F46 | 8.2:1 | AAA ✓ |
| #FEF2F2 + #7F1D1D | 7.1:1 | AAA ✓ |
| #FFFBEB + #78350F | 6.8:1 | AAA ✓ |
| #F0F9FF + #1E40AF | 7.5:1 | AAA ✓ |
| #F3F4F6 + #374151 | 5.2:1 | AA ✓ |

## Common Mistakes to Avoid

❌ **Color only**: Don't rely on color alone
❌ **No animation**: Don't skip loading state animations
❌ **Poor contrast**: Don't use low contrast colors
❌ **No labels**: Don't use icons without text
❌ **CPU animations**: Don't animate layout properties
❌ **No accessibility**: Don't forget ARIA labels
❌ **Too many animations**: Don't animate everything
❌ **No error states**: Don't skip error handling

## Resources

- **Colors**: https://tailwindcss.com/docs/customizing-colors
- **Icons**: https://heroicons.com/, https://react-icons.github.io/
- **Contrast**: https://webaim.org/resources/contrastchecker/
- **Animations**: https://developer.mozilla.org/en-US/docs/Web/CSS/animation
- **Accessibility**: https://www.w3.org/WAI/WCAG21/quickref/

