---
name: Cyber-Analytical Interface
colors:
  surface: '#11131c'
  surface-dim: '#11131c'
  surface-bright: '#373943'
  surface-container-lowest: '#0c0e17'
  surface-container-low: '#191b24'
  surface-container: '#1d1f29'
  surface-container-high: '#282933'
  surface-container-highest: '#32343e'
  on-surface: '#e1e1ef'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#e1e1ef'
  inverse-on-surface: '#2e303a'
  outline: '#849495'
  outline-variant: '#3a494b'
  surface-tint: '#00dbe7'
  primary: '#e1fdff'
  on-primary: '#00363a'
  primary-container: '#00f2ff'
  on-primary-container: '#006a71'
  inverse-primary: '#00696f'
  secondary: '#ffabf3'
  on-secondary: '#5b005b'
  secondary-container: '#fe00fe'
  on-secondary-container: '#500050'
  tertiary: '#eaffc8'
  on-tertiary: '#203600'
  tertiary-container: '#a0f11c'
  on-tertiary-container: '#436a00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#74f5ff'
  primary-fixed-dim: '#00dbe7'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#ffd7f5'
  secondary-fixed-dim: '#ffabf3'
  on-secondary-fixed: '#380038'
  on-secondary-fixed-variant: '#810081'
  tertiary-fixed: '#a8f928'
  tertiary-fixed-dim: '#8fdb00'
  on-tertiary-fixed: '#112000'
  on-tertiary-fixed-variant: '#314f00'
  background: '#11131c'
  on-background: '#e1e1ef'
  surface-variant: '#32343e'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  mono-label:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

This design system establishes a high-fidelity, "comfy cyberpunk" aesthetic tailored for technical AI evaluation. It balances the high-energy visuals of a futuristic terminal with the professional clarity required for deep data analysis. The brand personality is analytical, immersive, and precise.

The style is a fusion of **Minimalism** and **Glassmorphism**, set against a **Cyberpunk** backdrop. We use heavy structural whitespace to prevent information density from becoming overwhelming. Visual interest is generated through thin neon accents, backdrop blurs, and subtle digital grid textures rather than heavy decorative elements. The goal is to make the user feel like they are operating an advanced AI diagnostic core while maintaining the ergonomic comfort of a modern SaaS application.

## Colors

The palette is anchored by deep "Void" tones to minimize ocular fatigue during long evaluation sessions. 

- **Primary (Cyan):** Used for interactive elements, primary actions, and active states. It represents the "pulse" of the AI.
- **Secondary (Magenta):** Used for highlights, decorative accents, and secondary data visualizations to create the cyberpunk contrast.
- **Backgrounds:** We utilize a two-tier dark system. `#0a0b10` serves as the canvas, while `#12141d` is used for elevated surface containers.
- **Functional Accents:** Lime, Amber, and Red are reserved strictly for semantic status signaling (Success, Warning, Failure) to ensure high-speed scannability of evaluation results.

## Typography

Typography is split between the human-readable and the machine-technical. 

**Inter** provides the structural foundation for the UI, ensuring that evaluation metrics and descriptive text are highly legible. **JetBrains Mono** is employed for all technical data points, IDs, timestamps, and AI-generated transcripts. This distinction helps the user subconsciously categorize information as either "interface/guidance" or "raw data."

Headlines use tight tracking and bold weights to command attention, while mono labels are set in uppercase with increased letter spacing to mimic tactical readouts.

## Layout & Spacing

The layout follows a **Fluid Grid** system with fixed-width sidebars for navigation and meta-data. We utilize an 8px base unit to ensure rhythmic consistency.

- **Desktop:** 12-column grid with 24px margins. Content is organized into "Modules" that can span 4, 6, or 12 columns.
- **Mobile:** Single column with 16px margins.
- **Philosophy:** To achieve the "comfy" requirement, we prioritize vertical stack spacing (32px+) between major evaluation sections. This "breathable" layout prevents the interface from feeling claustrophobic, which is a common pitfall of the cyberpunk style. 

Subtle 1px grid lines (low opacity Cyan) may be used in the background of data sections to reinforce the technical theme without cluttering the foreground.

## Elevation & Depth

Depth is achieved through **Glassmorphism** and **Tonal Layering** rather than traditional drop shadows.

1.  **Base Layer:** `#0a0b10` with a subtle static or grid texture.
2.  **Surface Layer:** `#12141d` at 80% opacity with a `20px` backdrop blur. 
3.  **Borders:** Instead of shadows, we use 1px solid borders. For inactive cards, use `#ffffff10`. For active or "Hot" cards, use a subtle 1px gradient border of Cyan to Magenta.
4.  **Glow:** High-priority elements (like a "Critical Failure" or "Top Performer") use a very soft, diffused outer glow matching their status color (e.g., a `0 0 15px` Cyan bloom).

## Shapes

The shape language is **Soft (0.25rem)** to maintain a professional, architectural feel. We avoid fully rounded "bubble" shapes to stay true to the edgy cyberpunk aesthetic.

- **Cards/Containers:** 4px (0.25rem) corner radius.
- **Buttons:** 4px corner radius.
- **Selection Indicators:** Sharp 0px corners are permitted for tiny decorative accents (like corner brackets on a photo or code block) to add a "scanner" feel.

## Components

- **Buttons:** Primary buttons are solid Cyan with black text. Secondary buttons are ghost-style with a Cyan border and glow on hover.
- **Cards:** Use the Glassmorphism style. Headers within cards should be separated by a 1px dimmed line. Each card should feature a 2px vertical accent bar on the left side indicating status (Cyan for neutral, Lime for pass, etc.).
- **Input Fields:** Dark background (#000000), 1px Cyan border, and JetBrains Mono text. The cursor should be a solid Cyan block.
- **Chips:** Small, rectangular tags with JetBrains Mono text. Backgrounds are low-opacity versions of the status colors (e.g., Magenta at 15% opacity).
- **Status Indicators:** Use "LED" style circles—small icons with a concentrated center color and a wide, soft glow.
- **Progress Bars:** Thin (4px) tracks. The filled portion should be a linear gradient (e.g., Cyan to Deep Blue) to suggest movement and energy.
- **AI Transcript Viewer:** A dedicated component using JetBrains Mono, housed in a recessed container with a dark background and a subtle scanline overlay effect.