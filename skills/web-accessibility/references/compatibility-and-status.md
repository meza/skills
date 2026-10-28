# Compatibility and status

Load this reference for user-interface names, roles, states, properties, values, custom controls, and status messages.

WCAG 2.2 removed 4.1.1 Parsing. Do not report it as a WCAG 2.2 failure. Invalid markup can still cause failures under other criteria when it changes relationships, names, roles, states, values, or behaviour.

## Compatible user interfaces

### 4.1.2 Name, Role, Value (A)

For every user-interface component, make its name and role programmatically determinable. Make user-settable states, properties, and values programmatically settable, and expose notification of changes to user agents and assistive technologies. This requirement is primarily significant for authors creating or scripting controls; standard HTML controls satisfy it when used according to specification.

Prefer native controls. Use only ARIA roles permitted for the host element by ARIA in HTML. Do not add redundant roles. When changing a native role, ensure the element's semantics and complete interaction satisfy the new role.

`input[type="checkbox"][role="switch"]` is permitted. The native `checked` state can supply the switch state, so do not add a conflicting `aria-checked` value. Keep every ARIA state synchronized with visible and interactive state.

ARIA changes semantics, not behaviour. Implement the complete keyboard, focus, selection, and state model for custom widgets. `aria-disabled="true"` communicates state but does not prevent activation.

### 4.1.3 Status Messages (AA)

In markup-language content, make status messages programmatically determinable through role or properties so assistive technologies can present them without moving focus. First determine whether the dynamic content meets WCAG's definition of a status message; not every DOM update needs a live region.

Prefer native semantics such as `output` when appropriate. Otherwise choose a suitable status or alert role and politeness. Render the live region before changing its content, because a region inserted together with its message is often not announced. Avoid duplicate announcements and keep important messages available after their initial announcement.

## Verification

Inspect each component's computed name, role, state, properties, and value in the accessibility tree. Operate it through every input method required by the relevant criteria and verify change notifications. For each status transition, confirm in the accessibility tree that the message appears inside a live region that existed before the change, without moving focus solely to force announcement.
