# Comprehensive Status Badge Patterns for Workflow States

A complete guide to implementing status badges with semantic colors, icons, animations, and state transitions for modern web applications.

## Table of Contents

1. [Badge Colors & Semantic Systems](#badge-colors--semantic-systems)
2. [Icons for Status](#icons-for-status)
3. [Animations & Transitions](#animations--transitions)
4. [State Transitions](#state-transitions)
5. [Design System Examples](#design-system-examples)
6. [React/TypeScript Implementation](#reacttypescript-implementation)
7. [Accessibility Considerations](#accessibility-considerations)
8. [Real-World Patterns](#real-world-patterns)

---

## Badge Colors & Semantic Systems

### 1. Standard Color Conventions

#### Success State
- **Primary Color**: Green (#10B981, #22C55E)
- **Background**: Light green (#D1FAE5, #ECFDF5)
- **Text**: Dark green (#065F46, #166534)
- **Meaning**: Task completed, operation successful, workflow finished
- **Psychology**: Trust, completion, positive action

```css
.badge-success {
  background-color: #ECFDF5;
  color: #065F46;
  border: 1px solid #A7F3D0;
}

.badge-success-dark {
  background-color: #10B981;
  color: #FFFFFF;
}
```

#### Error/Failed State
- **Primary Color**: Red (#EF4444, #DC2626)
- **Background**: Light red (#FEE2E2, #FEF2F2)
- **Text**: Dark red (#7F1D1D, #991B1B)
- **Meaning**: Task failed, error occurred, action blocked
- **Psychology**: Urgency, danger, requires attention

```css
.badge-error {
  background-color: #FEF2F2;
  color: #7F1D1D;
  border: 1px solid #FECACA;
}

.badge-error-dark {
  background-color: #DC2626;
  color: #FFFFFF;
}
```

#### Warning State
- **Primary Color**: Amber (#F59E0B, #FBBF24)
- **Background**: Light amber (#FFFBEB, #FEF3C7)
- **Text**: Dark amber (#78350F, #92400E)
- **Meaning**: Attention needed, pending action, caution
- **Psychology**: Caution, requires review, potential issue

```css
.badge-warning {
  background-color: #FFFBEB;
  color: #78350F;
  border: 1px solid #FCD34D;
}

.badge-warning-dark {
  background-color: #F59E0B;
  color: #FFFFFF;
}
```

#### Info/Pending State
- **Primary Color**: Blue (#3B82F6, #2563EB)
- **Background**: Light blue (#EFF6FF, #F0F9FF)
- **Text**: Dark blue (#1E3A8A, #1E40AF)
- **Meaning**: Processing, in progress, informational
- **Psychology**: Neutral, processing, awaiting completion

```css
.badge-info {
  background-color: #F0F9FF;
  color: #1E40AF;
  border: 1px solid #BFDBFE;
}

.badge-info-dark {
  background-color: #3B82F6;
  color: #FFFFFF;
}
```

#### Neutral/Default State
- **Primary Color**: Gray (#6B7280, #9CA3AF)
- **Background**: Light gray (#F9FAFB, #F3F4F6)
- **Text**: Dark gray (#374151, #4B5563)
- **Meaning**: Inactive, disabled, neutral status
- **Psychology**: Neutral, no action needed

```css
.badge-neutral {
  background-color: #F3F4F6;
  color: #374151;
  border: 1px solid #D1D5DB;
}
```

### 2. Semantic Color Systems from Design Systems

#### Material Design 3
```typescript
const materialColors = {
  success: {
    light: '#E8F5E9',
    main: '#4CAF50',
    dark: '#2E7D32',
    text: '#1B5E20'
  },
  error: {
    light: '#FFEBEE',
    main: '#F44336',
    dark: '#C62828',
    text: '#B71C1C'
  },
  warning: {
    light: '#FFF3E0',
    main: '#FF9800',
    dark: '#E65100',
    text: '#E65100'
  },
  info: {
    light: '#E3F2FD',
    main: '#2196F3',
    dark: '#1565C0',
    text: '#0D47A1'
  }
};
```

#### Ant Design
```typescript
const antDesignColors = {
  success: {
    light: '#F6FFED',
    main: '#52C41A',
    dark: '#389E0D',
    text: '#274E0F'
  },
  error: {
    light: '#FFF1F0',
    main: '#FF4D4F',
    dark: '#D9363E',
    text: '#58181C'
  },
  warning: {
    light: '#FFFBE6',
    main: '#FAAD14',
    dark: '#D48806',
    text: '#7D4E08'
  },
  processing: {
    light: '#E6F7FF',
    main: '#1890FF',
    dark: '#0050B3',
    text: '#003A8C'
  }
};
```

#### Chakra UI
```typescript
const chakraColors = {
  success: {
    light: '#C6F6D5',
    main: '#48BB78',
    dark: '#22543D',
    text: '#22543D'
  },
  error: {
    light: '#FED7D7',
    main: '#F56565',
    dark: '#742A2A',
    text: '#742A2A'
  },
  warning: {
    light: '#FEEBC8',
    main: '#ED8936',
    dark: '#7C2D12',
    text: '#7C2D12'
  },
  info: {
    light: '#BEE3F8',
    main: '#4299E1',
    dark: '#2C5282',
    text: '#2C5282'
  }
};
```

### 3. Accessibility Considerations

#### WCAG 2.1 Contrast Ratios

**Minimum Requirements**:
- **Normal text**: 4.5:1 contrast ratio
- **Large text** (18pt+): 3:1 contrast ratio
- **UI components**: 3:1 contrast ratio

**Recommended**:
- **AAA level**: 7:1 for normal text, 4.5:1 for large text

```typescript
// Contrast ratio checker
const getContrastRatio = (color1: string, color2: string): number => {
  const getLuminance = (hex: string): number => {
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    
    const [rs, gs, bs] = [r, g, b].map(x => {
      x = x / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };
  
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
};

// Verify badge colors
console.log(getContrastRatio('#ECFDF5', '#065F46')); // Should be > 4.5
console.log(getContrastRatio('#FEF2F2', '#7F1D1D')); // Should be > 4.5
```

#### Colorblind-Friendly Palettes

**Deuteranopia (Red-Green Colorblind)**:
- Avoid red-green combinations
- Use blue-yellow, blue-orange instead

```typescript
const colorblindFriendlyPalette = {
  success: '#0173B2',      // Blue
  error: '#DE8F05',        // Orange
  warning: '#CC78BC',      // Purple
  info: '#CA9161',         // Brown
  neutral: '#999999'       // Gray
};

// Better: Use patterns + color
const badgeWithPattern = {
  success: { color: '#0173B2', icon: '✓', pattern: 'solid' },
  error: { color: '#DE8F05', icon: '✗', pattern: 'striped' },
  warning: { color: '#CC78BC', icon: '⚠', pattern: 'dotted' },
};
```

**Protanopia (Red-Green Colorblind - Red Weak)**:
- Use blue, yellow, black
- Avoid red, green

**Tritanopia (Blue-Yellow Colorblind)**:
- Use red, blue, black
- Avoid blue, yellow

#### Color + Icon + Text Combination

Always use multiple indicators, not just color:

```tsx
// ✅ GOOD: Color + Icon + Text
<span className="badge badge-success">
  <CheckIcon /> Success
</span>

// ❌ BAD: Color only
<span className="badge badge-success" />
```

---

## Icons for Status

### 1. Common Icon Patterns

#### Success Icons
```typescript
const successIcons = {
  checkmark: '✓',           // Simple, universal
  checkCircle: '✔️',        // Filled circle
  checkDouble: '✔✔',        // Double check
  thumbsUp: '👍',           // Positive feedback
  star: '⭐',               // Achievement
  trophy: '🏆',             // Victory
  rocket: '🚀',             // Launch/completion
};
```

#### Error Icons
```typescript
const errorIcons = {
  x: '✗',                   // Simple X
  xCircle: '❌',            // Filled circle X
  alert: '⚠️',              // Alert triangle
  exclamation: '❗',        // Exclamation
  stop: '🛑',               // Stop sign
  fire: '🔥',               // Critical
  bomb: '💣',               // Explosion
};
```

#### Warning Icons
```typescript
const warningIcons = {
  triangle: '⚠️',           // Warning triangle
  exclamation: '⚠',        // Exclamation
  clock: '⏰',              // Time-related
  hourglass: '⏳',          // Waiting
  attention: '👁️',         // Attention needed
  caution: '⚡',            // Caution
};
```

#### Pending/Loading Icons
```typescript
const pendingIcons = {
  spinner: '⟳',             // Rotating
  dots: '...',              // Animated dots
  hourglass: '⏳',          // Time passing
  clock: '🕐',              // Clock
  sync: '🔄',               // Syncing
  loading: '⌛',            // Loading
};
```

### 2. Icon Libraries

#### Heroicons (Tailwind)
```tsx
import { CheckIcon, ExclamationIcon, ClockIcon } from '@heroicons/react/solid';

<CheckIcon className="w-4 h-4" />
<ExclamationIcon className="w-4 h-4" />
<ClockIcon className="w-4 h-4" />
```

#### React Icons
```tsx
import { FiCheck, FiX, FiAlertCircle, FiClock } from 'react-icons/fi';
import { AiOutlineCheckCircle, AiOutlineCloseCircle } from 'react-icons/ai';

<FiCheck />
<FiX />
<FiAlertCircle />
```

#### Feather Icons
```tsx
import { Check, X, AlertCircle, Clock } from 'react-feather';

<Check size={16} />
<X size={16} />
<AlertCircle size={16} />
```

#### Material Icons
```tsx
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';

<CheckCircleIcon />
<ErrorIcon />
<WarningIcon />
```

### 3. When to Use Icons vs Text-Only Badges

| Scenario | Icon | Text | Both |
|----------|------|------|------|
| **High-frequency status** | ✅ | ❌ | ✅ |
| **Accessibility critical** | ❌ | ✅ | ✅ |
| **Space-constrained** | ✅ | ❌ | ❌ |
| **Colorblind users** | ❌ | ✅ | ✅ |
| **Mobile/small screens** | ✅ | ❌ | ✅ |
| **Formal/professional** | ❌ | ✅ | ✅ |
| **Real-time dashboards** | ✅ | ❌ | ✅ |

### 4. Icon + Text Combinations

```tsx
// Horizontal layout (most common)
<span className="badge badge-success">
  <CheckIcon className="w-4 h-4" />
  <span>Success</span>
</span>

// Vertical layout (for larger badges)
<div className="badge badge-success flex-col">
  <CheckIcon className="w-6 h-6" />
  <span className="text-xs">Success</span>
</div>

// Icon only with tooltip
<span 
  className="badge badge-success" 
  title="Workflow completed successfully"
>
  <CheckIcon className="w-4 h-4" />
</span>

// Text with icon on right
<span className="badge badge-success">
  <span>Success</span>
  <CheckIcon className="w-4 h-4" />
</span>
```

---

## Animations & Transitions

### 1. Loading/Pending State Animations

#### Spinner Animation (GPU-Accelerated)
```css
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spinner {
  animation: spin 1s linear infinite;
  will-change: transform;
}

/* Pulsing spinner */
@keyframes spin-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.spinner-pulse {
  animation: spin 1s linear infinite, spin-pulse 2s ease-in-out infinite;
}
```

#### Shimmer Animation (Skeleton Loading)
```css
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.shimmer {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 1000px 100%;
  animation: shimmer 2s infinite;
  will-change: background-position;
}
```

#### Pulse Animation
```css
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  will-change: opacity;
}

/* Dot pulse (like typing indicator) */
@keyframes dot-pulse {
  0%, 60%, 100% {
    opacity: 0.3;
  }
  30% {
    opacity: 1;
  }
}

.dot-pulse {
  animation: dot-pulse 1.4s infinite;
}
```

#### Bounce Animation
```css
@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.bounce {
  animation: bounce 1s infinite;
  will-change: transform;
}
```

### 2. State Transition Animations

#### Fade Transition
```css
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.fade-enter {
  animation: fadeIn 0.3s ease-in;
}

.fade-exit {
  animation: fadeOut 0.3s ease-out;
}
```

#### Slide Transition
```css
@keyframes slideIn {
  from {
    transform: translateX(-10px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.slide-enter {
  animation: slideIn 0.3s ease-out;
}
```

#### Scale Transition
```css
@keyframes scaleIn {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.scale-enter {
  animation: scaleIn 0.2s ease-out;
}
```

### 3. Micro-interactions for Status Changes

#### Color Transition
```css
.badge {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.badge.success {
  background-color: #ECFDF5;
  color: #065F46;
}

.badge.error {
  background-color: #FEF2F2;
  color: #7F1D1D;
}
```

#### Icon Rotation on Success
```css
@keyframes checkmark-rotate {
  0% {
    transform: rotate(-45deg);
    opacity: 0;
  }
  100% {
    transform: rotate(0deg);
    opacity: 1;
  }
}

.badge-success .icon {
  animation: checkmark-rotate 0.5s ease-out;
}
```

#### Shake on Error
```css
@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-5px);
  }
  75% {
    transform: translateX(5px);
  }
}

.badge-error {
  animation: shake 0.5s ease-in-out;
}
```

### 4. Performance Considerations

#### GPU-Accelerated Properties
```css
/* ✅ Use these (GPU accelerated) */
.badge {
  animation: spin 1s linear infinite;
  will-change: transform;
  /* Use: transform, opacity, filter */
}

/* ❌ Avoid animating these (CPU intensive) */
.badge-bad {
  animation: bad-animation 1s linear infinite;
  /* Avoid: width, height, margin, padding, top, left */
}
```

#### Reduce Motion for Accessibility
```css
@media (prefers-reduced-motion: reduce) {
  .badge,
  .spinner,
  .pulse {
    animation: none;
    transition: none;
  }
}

/* Or use opacity-only animation */
@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: pulse-opacity 2s ease-in-out infinite;
  }
}

@keyframes pulse-opacity {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
```

#### Mobile Battery Optimization
```typescript
const useReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return prefersReducedMotion;
};

// Usage
const Badge = ({ status }: { status: string }) => {
  const reducedMotion = useReducedMotion();
  
  return (
    <span 
      className={`badge badge-${status} ${
        reducedMotion ? 'no-animation' : ''
      }`}
    >
      {status}
    </span>
  );
};
```

---

## State Transitions

### 1. Common Workflow State Progressions

#### Simple Linear Workflow
```
pending → running → success
              ↓
            failed
```

#### Complex Multi-Stage Workflow
```
pending → queued → running → processing → success
                      ↓
                    paused → running
                      ↓
                    failed → retrying → success
```

#### Cancellable Workflow
```
pending → running → success
   ↓        ↓
cancelled  cancelled
```

### 2. Visual Feedback During State Changes

```tsx
interface WorkflowExecution {
  id: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  progress?: number;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

const StatusBadge = ({ execution }: { execution: WorkflowExecution }) => {
  const getStatusConfig = (status: string) => {
    const configs: Record<string, any> = {
      pending: {
        color: 'bg-gray-100 text-gray-800',
        icon: '⏳',
        label: 'Pending',
        animation: 'pulse'
      },
      running: {
        color: 'bg-blue-100 text-blue-800',
        icon: '⟳',
        label: 'Running',
        animation: 'spin'
      },
      success: {
        color: 'bg-green-100 text-green-800',
        icon: '✓',
        label: 'Success',
        animation: 'scale-in'
      },
      failed: {
        color: 'bg-red-100 text-red-800',
        icon: '✗',
        label: 'Failed',
        animation: 'shake'
      },
      cancelled: {
        color: 'bg-yellow-100 text-yellow-800',
        icon: '⊘',
        label: 'Cancelled',
        animation: 'fade-out'
      }
    };
    return configs[status] || configs.pending;
  };

  const config = getStatusConfig(execution.status);

  return (
    <span className={`badge ${config.color} ${config.animation}`}>
      <span className={config.animation === 'spin' ? 'spinner' : ''}>
        {config.icon}
      </span>
      {config.label}
    </span>
  );
};
```

### 3. Optimistic UI Patterns for Status Updates

```tsx
const useOptimisticStatusUpdate = () => {
  const [status, setStatus] = useState<string>('pending');
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);

  const updateStatus = async (newStatus: string) => {
    // Optimistically update UI
    setOptimisticStatus(newStatus);

    try {
      const response = await fetch('/api/execution/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        // Confirm the update
        setStatus(newStatus);
        setOptimisticStatus(null);
      } else {
        // Revert on error
        setOptimisticStatus(null);
      }
    } catch (error) {
      // Revert on error
      setOptimisticStatus(null);
    }
  };

  const displayStatus = optimisticStatus || status;

  return { displayStatus, updateStatus, isPending: optimisticStatus !== null };
};

// Usage
const ExecutionBadge = ({ executionId }: { executionId: string }) => {
  const { displayStatus, isPending } = useOptimisticStatusUpdate();

  return (
    <span className={`badge badge-${displayStatus} ${isPending ? 'opacity-75' : ''}`}>
      {displayStatus}
    </span>
  );
};
```

### 4. Error State Handling and Recovery

```tsx
interface ExecutionState {
  status: 'pending' | 'running' | 'success' | 'failed';
  error?: {
    message: string;
    code: string;
    retryable: boolean;
  };
  retryCount: number;
  maxRetries: number;
}

const ErrorRecoveryBadge = ({ execution }: { execution: ExecutionState }) => {
  const canRetry = execution.error?.retryable && 
                   execution.retryCount < execution.maxRetries;

  return (
    <div className="flex items-center gap-2">
      <span className="badge badge-error">
        ✗ {execution.error?.message}
      </span>
      
      {canRetry && (
        <span className="text-xs text-gray-600">
          Retry {execution.retryCount}/{execution.maxRetries}
        </span>
      )}
      
      {!canRetry && execution.error?.retryable && (
        <span className="text-xs text-red-600">
          Max retries exceeded
        </span>
      )}
    </div>
  );
};
```

---

## Design System Examples

### 1. Material Design 3 Status Badges

```tsx
import React from 'react';

interface MaterialBadgeProps {
  status: 'success' | 'error' | 'warning' | 'info';
  label: string;
  icon?: React.ReactNode;
}

const MaterialBadge: React.FC<MaterialBadgeProps> = ({ status, label, icon }) => {
  const styles: Record<string, any> = {
    success: {
      backgroundColor: '#E8F5E9',
      color: '#2E7D32',
      borderColor: '#A5D6A7'
    },
    error: {
      backgroundColor: '#FFEBEE',
      color: '#C62828',
      borderColor: '#EF9A9A'
    },
    warning: {
      backgroundColor: '#FFF3E0',
      color: '#E65100',
      borderColor: '#FFB74D'
    },
    info: {
      backgroundColor: '#E3F2FD',
      color: '#1565C0',
      borderColor: '#64B5F6'
    }
  };

  const style = styles[status];

  return (
    <span
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '16px',
        border: `1px solid ${style.borderColor}`,
        fontSize: '12px',
        fontWeight: 500,
        letterSpacing: '0.5px'
      }}
    >
      {icon && <span>{icon}</span>}
      {label}
    </span>
  );
};

export default MaterialBadge;
```

### 2. Ant Design Status Badges

```tsx
import React from 'react';

interface AntBadgeProps {
  status: 'success' | 'error' | 'warning' | 'processing';
  text: string;
}

const AntBadge: React.FC<AntBadgeProps> = ({ status, text }) => {
  const statusConfig: Record<string, any> = {
    success: {
      color: '#52C41A',
      backgroundColor: '#F6FFED',
      borderColor: '#B7EB8F'
    },
    error: {
      color: '#FF4D4F',
      backgroundColor: '#FFF1F0',
      borderColor: '#FFCCC7'
    },
    warning: {
      color: '#FAAD14',
      backgroundColor: '#FFFBE6',
      borderColor: '#FFE58F'
    },
    processing: {
      color: '#1890FF',
      backgroundColor: '#E6F7FF',
      borderColor: '#91D5FF'
    }
  };

  const config = statusConfig[status];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        borderRadius: '2px',
        border: `1px solid ${config.borderColor}`,
        backgroundColor: config.backgroundColor,
        color: config.color,
        fontSize: '12px',
        fontWeight: 500
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: config.color
        }}
      />
      {text}
    </span>
  );
};

export default AntBadge;
```

### 3. Chakra UI Status Badges

```tsx
import React from 'react';

interface ChakraBadgeProps {
  colorScheme: 'green' | 'red' | 'orange' | 'blue';
  children: React.ReactNode;
  variant?: 'solid' | 'subtle' | 'outline';
}

const ChakraBadge: React.FC<ChakraBadgeProps> = ({ 
  colorScheme, 
  children, 
  variant = 'subtle' 
}) => {
  const colorSchemes: Record<string, any> = {
    green: {
      solid: { bg: '#48BB78', color: 'white' },
      subtle: { bg: '#C6F6D5', color: '#22543D' },
      outline: { border: '1px solid #48BB78', color: '#22543D' }
    },
    red: {
      solid: { bg: '#F56565', color: 'white' },
      subtle: { bg: '#FED7D7', color: '#742A2A' },
      outline: { border: '1px solid #F56565', color: '#742A2A' }
    },
    orange: {
      solid: { bg: '#ED8936', color: 'white' },
      subtle: { bg: '#FEEBC8', color: '#7C2D12' },
      outline: { border: '1px solid #ED8936', color: '#7C2D12' }
    },
    blue: {
      solid: { bg: '#4299E1', color: 'white' },
      subtle: { bg: '#BEE3F8', color: '#2C5282' },
      outline: { border: '1px solid #4299E1', color: '#2C5282' }
    }
  };

  const style = colorSchemes[colorScheme][variant];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        ...style
      }}
    >
      {children}
    </span>
  );
};

export default ChakraBadge;
```

### 4. Radix UI Status Badges

```tsx
import React from 'react';
import * as Badge from '@radix-ui/react-badge';

interface RadixStatusBadgeProps {
  status: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
}

const RadixStatusBadge: React.FC<RadixStatusBadgeProps> = ({ status, children }) => {
  const statusStyles: Record<string, any> = {
    success: {
      backgroundColor: '#ECFDF5',
      color: '#065F46',
      borderColor: '#A7F3D0'
    },
    error: {
      backgroundColor: '#FEF2F2',
      color: '#7F1D1D',
      borderColor: '#FECACA'
    },
    warning: {
      backgroundColor: '#FFFBEB',
      color: '#78350F',
      borderColor: '#FCD34D'
    },
    info: {
      backgroundColor: '#F0F9FF',
      color: '#1E40AF',
      borderColor: '#BFDBFE'
    }
  };

  const style = statusStyles[status];

  return (
    <Badge.Root
      style={{
        ...style,
        padding: '4px 12px',
        borderRadius: '6px',
        border: `1px solid ${style.borderColor}`,
        fontSize: '12px',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px'
      }}
    >
      {children}
    </Badge.Root>
  );
};

export default RadixStatusBadge;
```

### 5. shadcn/ui Status Badges

```tsx
import React from 'react';

interface ShadcnBadgeProps {
  variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
  children: React.ReactNode;
}

const ShadcnBadge: React.FC<ShadcnBadgeProps> = ({ variant, children }) => {
  const variants: Record<string, string> = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/80',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
    outline: 'text-foreground border border-input',
    success: 'bg-green-100 text-green-800 hover:bg-green-200',
    warning: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
  };

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
};

export default ShadcnBadge;
```

---

## React/TypeScript Implementation

### 1. Complete Status Badge Component

```tsx
import React, { ReactNode } from 'react';

type StatusType = 'success' | 'error' | 'warning' | 'info' | 'pending';
type BadgeSize = 'sm' | 'md' | 'lg';
type BadgeVariant = 'solid' | 'outline' | 'subtle';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  icon?: ReactNode;
  size?: BadgeSize;
  variant?: BadgeVariant;
  animated?: boolean;
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  icon,
  size = 'md',
  variant = 'subtle',
  animated = false,
  className = ''
}) => {
  const statusConfig: Record<StatusType, any> = {
    success: {
      colors: {
        solid: { bg: '#10B981', text: '#FFFFFF' },
        outline: { bg: 'transparent', text: '#10B981', border: '#10B981' },
        subtle: { bg: '#ECFDF5', text: '#065F46' }
      },
      icon: '✓',
      label: 'Success'
    },
    error: {
      colors: {
        solid: { bg: '#EF4444', text: '#FFFFFF' },
        outline: { bg: 'transparent', text: '#EF4444', border: '#EF4444' },
        subtle: { bg: '#FEF2F2', text: '#7F1D1D' }
      },
      icon: '✗',
      label: 'Error'
    },
    warning: {
      colors: {
        solid: { bg: '#F59E0B', text: '#FFFFFF' },
        outline: { bg: 'transparent', text: '#F59E0B', border: '#F59E0B' },
        subtle: { bg: '#FFFBEB', text: '#78350F' }
      },
      icon: '⚠',
      label: 'Warning'
    },
    info: {
      colors: {
        solid: { bg: '#3B82F6', text: '#FFFFFF' },
        outline: { bg: 'transparent', text: '#3B82F6', border: '#3B82F6' },
        subtle: { bg: '#F0F9FF', text: '#1E40AF' }
      },
      icon: 'ℹ',
      label: 'Info'
    },
    pending: {
      colors: {
        solid: { bg: '#6B7280', text: '#FFFFFF' },
        outline: { bg: 'transparent', text: '#6B7280', border: '#6B7280' },
        subtle: { bg: '#F3F4F6', text: '#374151' }
      },
      icon: '⏳',
      label: 'Pending'
    }
  };

  const sizeConfig: Record<BadgeSize, any> = {
    sm: { padding: '2px 8px', fontSize: '11px', gap: '4px' },
    md: { padding: '4px 12px', fontSize: '12px', gap: '6px' },
    lg: { padding: '6px 16px', fontSize: '14px', gap: '8px' }
  };

  const config = statusConfig[status];
  const colors = config.colors[variant];
  const size_config = sizeConfig[size];

  const animationClass = animated && status === 'pending' ? 'animate-pulse' : '';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium transition-all ${animationClass} ${className}`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: colors.border ? `1px solid ${colors.border}` : 'none',
        padding: size_config.padding,
        fontSize: size_config.fontSize,
        gap: size_config.gap
      }}
    >
      {icon || config.icon}
      {label || config.label}
    </span>
  );
};

export default StatusBadge;
```

### 2. Workflow Execution Status Component

```tsx
import React, { useState, useEffect } from 'react';
import StatusBadge from './StatusBadge';

interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  progress?: number;
}

interface ExecutionStatusProps {
  execution: WorkflowExecution;
  showProgress?: boolean;
  showDuration?: boolean;
}

const ExecutionStatus: React.FC<ExecutionStatusProps> = ({
  execution,
  showProgress = false,
  showDuration = false
}) => {
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (execution.startedAt && execution.completedAt) {
      const start = new Date(execution.startedAt).getTime();
      const end = new Date(execution.completedAt).getTime();
      setDuration(Math.round((end - start) / 1000));
    }
  }, [execution.startedAt, execution.completedAt]);

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      pending: 'Pending',
      running: 'Running',
      success: 'Success',
      failed: 'Failed',
      cancelled: 'Cancelled'
    };
    return labels[status] || status;
  };

  const mapStatusToType = (status: string): 'success' | 'error' | 'warning' | 'info' | 'pending' => {
    switch (status) {
      case 'success':
        return 'success';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'warning';
      case 'running':
        return 'info';
      default:
        return 'pending';
    }
  };

  return (
    <div className="flex items-center gap-4">
      <StatusBadge
        status={mapStatusToType(execution.status)}
        label={getStatusLabel(execution.status)}
        animated={execution.status === 'running'}
      />

      {showProgress && execution.progress !== undefined && (
        <div className="flex items-center gap-2">
          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${execution.progress}%` }}
            />
          </div>
          <span className="text-xs text-gray-600">{execution.progress}%</span>
        </div>
      )}

      {showDuration && duration !== null && (
        <span className="text-xs text-gray-600">{duration}s</span>
      )}

      {execution.status === 'failed' && execution.errorMessage && (
        <span className="text-xs text-red-600" title={execution.errorMessage}>
          {execution.errorMessage.substring(0, 50)}...
        </span>
      )}
    </div>
  );
};

export default ExecutionStatus;
```

### 3. Status Badge with Tooltip

```tsx
import React, { ReactNode, useState } from 'react';
import StatusBadge from './StatusBadge';

interface StatusBadgeWithTooltipProps {
  status: 'success' | 'error' | 'warning' | 'info' | 'pending';
  label?: string;
  tooltip?: string;
  icon?: ReactNode;
}

const StatusBadgeWithTooltip: React.FC<StatusBadgeWithTooltipProps> = ({
  status,
  label,
  tooltip,
  icon
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <StatusBadge status={status} label={label} icon={icon} />
      </div>

      {showTooltip && tooltip && (
        <div
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10"
          style={{
            animation: 'fadeIn 0.2s ease-in'
          }}
        >
          {tooltip}
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"
          />
        </div>
      )}
    </div>
  );
};

export default StatusBadgeWithTooltip;
```

### 4. Status Badge List Component

```tsx
import React from 'react';
import StatusBadge from './StatusBadge';

interface StatusItem {
  id: string;
  status: 'success' | 'error' | 'warning' | 'info' | 'pending';
  label: string;
  timestamp?: string;
}

interface StatusBadgeListProps {
  items: StatusItem[];
  maxVisible?: number;
  showTimestamps?: boolean;
}

const StatusBadgeList: React.FC<StatusBadgeListProps> = ({
  items,
  maxVisible = 5,
  showTimestamps = false
}) => {
  const visibleItems = items.slice(0, maxVisible);
  const hiddenCount = Math.max(0, items.length - maxVisible);

  return (
    <div className="flex flex-wrap gap-2">
      {visibleItems.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <StatusBadge status={item.status} label={item.label} />
          {showTimestamps && item.timestamp && (
            <span className="text-xs text-gray-500">{item.timestamp}</span>
          )}
        </div>
      ))}

      {hiddenCount > 0 && (
        <StatusBadge
          status="info"
          label={`+${hiddenCount} more`}
          variant="outline"
        />
      )}
    </div>
  );
};

export default StatusBadgeList;
```

---

## Accessibility Considerations

### 1. ARIA Labels and Roles

```tsx
const AccessibleStatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  icon
}) => {
  const ariaLabels: Record<string, string> = {
    success: 'Workflow completed successfully',
    error: 'Workflow failed with an error',
    warning: 'Workflow completed with warnings',
    info: 'Workflow is processing',
    pending: 'Workflow is pending'
  };

  return (
    <span
      role="status"
      aria-label={ariaLabels[status]}
      aria-live="polite"
      className={`badge badge-${status}`}
    >
      {icon}
      {label}
    </span>
  );
};
```

### 2. Keyboard Navigation

```tsx
const KeyboardAccessibleBadge: React.FC<StatusBadgeProps> = (props) => {
  return (
    <button
      className={`badge badge-${props.status}`}
      aria-label={`Status: ${props.label}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          // Handle badge interaction
        }
      }}
    >
      {props.icon}
      {props.label}
    </button>
  );
};
```

### 3. Color Contrast Verification

```typescript
const verifyContrast = (bgColor: string, textColor: string): boolean => {
  const getLuminance = (hex: string): number => {
    const rgb = parseInt(hex.replace('#', ''), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;

    const [rs, gs, bs] = [r, g, b].map(x => {
      x = x / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(bgColor);
  const l2 = getLuminance(textColor);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  const ratio = (lighter + 0.05) / (darker + 0.05);
  return ratio >= 4.5; // WCAG AA standard
};

// Verify all badge colors
console.assert(verifyContrast('#ECFDF5', '#065F46'), 'Success badge contrast failed');
console.assert(verifyContrast('#FEF2F2', '#7F1D1D'), 'Error badge contrast failed');
```

### 4. Screen Reader Announcements

```tsx
const ScreenReaderAnnouncement: React.FC<{ message: string }> = ({ message }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
};

// Usage
const ExecutionStatusWithAnnouncement = ({ execution }: any) => {
  return (
    <>
      <StatusBadge status={execution.status} />
      <ScreenReaderAnnouncement
        message={`Workflow execution status changed to ${execution.status}`}
      />
    </>
  );
};
```

---

## Real-World Patterns

### 1. GitHub-Style Status Badges

```tsx
const GitHubStyleBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, any> = {
    success: {
      bg: '#28a745',
      text: '#fff'
    },
    failure: {
      bg: '#cb2431',
      text: '#fff'
    },
    pending: {
      bg: '#ffc107',
      text: '#000'
    }
  };

  const style = styles[status] || styles.pending;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        fontSize: '11px',
        fontWeight: 'bold',
        lineHeight: '1',
        color: style.text,
        backgroundColor: style.bg,
        borderRadius: '3px',
        fontFamily: 'monospace'
      }}
    >
      {status.toUpperCase()}
    </span>
  );
};
```

### 2. Slack-Style Status Indicators

```tsx
const SlackStyleStatus: React.FC<{ status: string }> = ({ status }) => {
  const statusDots: Record<string, any> = {
    active: { color: '#31a24c', label: 'Active' },
    away: { color: '#daa520', label: 'Away' },
    offline: { color: '#ccc', label: 'Offline' },
    dnd: { color: '#e01e5a', label: 'Do Not Disturb' }
  };

  const config = statusDots[status];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: config.color,
          animation: status === 'active' ? 'pulse 2s infinite' : 'none'
        }}
      />
      <span style={{ fontSize: '12px', color: '#666' }}>
        {config.label}
      </span>
    </div>
  );
};
```

### 3. Jira-Style Status Badges

```tsx
const JiraStyleBadge: React.FC<{ status: string }> = ({ status }) => {
  const jiraStatuses: Record<string, any> = {
    'To Do': { color: '#4a5568', bg: '#edf2f7' },
    'In Progress': { color: '#2c5aa0', bg: '#ebf8ff' },
    'In Review': { color: '#744210', bg: '#fef5e7' },
    'Done': { color: '#22543d', bg: '#f0fff4' }
  };

  const config = jiraStatuses[status];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '3px',
        backgroundColor: config.bg,
        color: config.color,
        fontSize: '11px',
        fontWeight: 600,
        border: `1px solid ${config.color}20`
      }}
    >
      {status}
    </span>
  );
};
```

### 4. Linear-Style Status Badges

```tsx
const LinearStyleBadge: React.FC<{ status: string }> = ({ status }) => {
  const linearStatuses: Record<string, any> = {
    'Backlog': { color: '#9CA3AF', icon: '○' },
    'Todo': { color: '#6366F1', icon: '◐' },
    'In Progress': { color: '#F59E0B', icon: '◑' },
    'In Review': { color: '#8B5CF6', icon: '◒' },
    'Done': { color: '#10B981', icon: '●' }
  };

  const config = linearStatuses[status];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '4px',
        backgroundColor: `${config.color}15`,
        color: config.color,
        fontSize: '12px',
        fontWeight: 500
      }}
    >
      <span style={{ fontSize: '10px' }}>{config.icon}</span>
      {status}
    </span>
  );
};
```

---

## Best Practices Summary

### Do's ✅

1. **Always use color + icon + text** for accessibility
2. **Use semantic colors** (green for success, red for error)
3. **Provide ARIA labels** for screen readers
4. **Use GPU-accelerated animations** (transform, opacity)
5. **Respect `prefers-reduced-motion`** for accessibility
6. **Test contrast ratios** (minimum 4.5:1)
7. **Use consistent sizing** across your application
8. **Provide tooltips** for additional context
9. **Use state transitions** for visual feedback
10. **Monitor performance** of animations

### Don'ts ❌

1. **Don't rely on color alone** for meaning
2. **Don't use non-standard colors** without reason
3. **Don't animate layout properties** (width, height, margin)
4. **Don't forget error states** and recovery options
5. **Don't use too many animations** simultaneously
6. **Don't ignore mobile performance** (battery impact)
7. **Don't skip loading states** for status changes
8. **Don't use low contrast colors** (< 4.5:1)
9. **Don't forget keyboard navigation**
10. **Don't use animations for critical information** (use text)

---

## Resources

### Color Tools

- **Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **Color Blindness Simulator**: https://www.color-blindness.com/coblis-color-blindness-simulator/
- **Tailwind Color Palette**: https://tailwindcss.com/docs/customizing-colors
- **Material Design Colors**: https://material.io/design/color/

### Icon Libraries

- **Heroicons**: https://heroicons.com/
- **React Icons**: https://react-icons.github.io/react-icons/
- **Feather Icons**: https://feathericons.com/
- **Material Icons**: https://fonts.google.com/icons

### Design Systems

- **Material Design 3**: https://m3.material.io/
- **Ant Design**: https://ant.design/
- **Chakra UI**: https://chakra-ui.com/
- **Radix UI**: https://www.radix-ui.com/
- **shadcn/ui**: https://ui.shadcn.com/

### Animation Resources

- **CSS Animations**: https://developer.mozilla.org/en-US/docs/Web/CSS/animation
- **GPU Animation**: https://smashingmagazine.com/2016/12/gpu-animation-doing-it-right/
- **Framer Motion**: https://www.framer.com/motion/
- **React Spring**: https://www.react-spring.dev/

---

## Conclusion

Effective status badges require:

1. **Semantic color systems** for consistency
2. **Multiple indicators** (color + icon + text) for accessibility
3. **Smooth animations** for visual feedback
4. **Clear state transitions** for user understanding
5. **Accessibility compliance** (WCAG 2.1 AA)
6. **Performance optimization** (GPU acceleration)
7. **Real-world patterns** from established design systems

By following these patterns and best practices, you can create status badges that are:
- **Accessible** to all users
- **Performant** on all devices
- **Consistent** across your application
- **Intuitive** for users to understand
- **Beautiful** and professional-looking

