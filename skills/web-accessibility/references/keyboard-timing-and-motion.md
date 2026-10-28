# Keyboard, timing, and motion

Load this reference for keyboard operation, traps, shortcuts, time limits, moving or updating content, interruptions, flashing, and animation.

## Keyboard accessibility

### 2.1.1 Keyboard (A)

Make all functionality operable through a keyboard interface without requiring specific timings for individual keystrokes. The exception covers functions whose underlying input depends on the path of movement, not merely on endpoint coordinates. Supporting keyboard operation does not prohibit mouse or other input.

Prefer native interactive elements. Test all states and functionality, including controls that appear on hover, composite widgets, drawing tools, drag-and-drop, rich editors, and media players.

### 2.1.2 No Keyboard Trap (A)

Allow keyboard focus to move away from every component using standard navigation or, when non-standard exit keys are required, inform users how to leave. This criterion applies to all page content under non-interference.

### 2.1.3 Keyboard (No Exception) (AAA)

Make all functionality operable through a keyboard interface without the path-dependent-input exception available under 2.1.1.

### 2.1.4 Character Key Shortcuts (A)

When a keyboard shortcut uses only a printable character, punctuation, number, or symbol, provide at least one of these safeguards: let users turn it off, let users remap it to include a non-printing key, or make it active only while the affected component has focus.

## Enough time

### 2.2.1 Timing Adjustable (A)

For each author-set time limit, let users turn it off before encountering it, adjust it over a range at least ten times the default, or extend it through a warning with at least 20 seconds to act and at least ten extensions. Apply the real-time-event, essential-time-limit, and longer-than-20-hours exceptions exactly.

### 2.2.2 Pause, Stop, Hide (A)

For moving, blinking, or scrolling content that starts automatically, lasts more than five seconds, and appears alongside other content, provide pause, stop, or hide controls unless the movement is essential. For automatically updating content alongside other content, provide pause, stop, hide, or update-frequency control unless essential. This criterion applies to all page content under non-interference.

### 2.2.3 No Timing (AAA)

Do not make timing an essential part of the event or activity, except for non-interactive synchronized media and real-time events.

### 2.2.4 Interruptions (AAA)

Let users postpone or suppress interruptions, except interruptions involving an emergency.

### 2.2.5 Re-authenticating (AAA)

When an authenticated session expires, let users continue the activity without losing data after re-authentication.

### 2.2.6 Timeouts (AAA)

Warn users about the duration of inactivity that could cause data loss before they begin, unless data is preserved for more than 20 hours without user action.

## Seizures and physical reactions

### 2.3.1 Three Flashes or Below Threshold (A)

Do not include content that flashes more than three times in any one-second period unless the flashes remain below the general flash and red flash thresholds. This criterion applies to all page content under non-interference.

### 2.3.2 Three Flashes (AAA)

Do not include content that flashes more than three times in any one-second period. The threshold alternative available at Level A does not apply.

### 2.3.3 Animation from Interactions (AAA)

Let users disable motion animation triggered by interaction unless the animation is essential to functionality or the information conveyed.

## Verification

Exercise every function with keyboard alone in forward and reverse order. Test documented shortcut settings, focus entry and escape, time warnings and extensions, preservation through re-authentication, pause/stop/hide controls, interrupt suppression, flash analysis, and reduced or disabled interaction animation. Do not infer runtime behaviour from event-handler names or static attributes.
