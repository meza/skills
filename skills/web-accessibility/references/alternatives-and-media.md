# Alternatives and media

Load this reference for non-text content and time-based media. Follow the linked WCAG criterion when exact applicability or an exception is disputed.

## Non-text content

### 1.1.1 Non-text Content (A)

Provide a text alternative that serves the equivalent purpose for non-text content presented to users. Apply the criterion's specific treatment:

- For non-text content that is a control or accepts user input, provide a name that describes its purpose.
- At least identify time-based media and tests or exercises when a full text equivalent would invalidate their purpose.
- Describe the intended sensory experience rather than pretending to reproduce it textually.
- Identify CAPTCHA purpose and provide alternatives for different sensory modalities.
- Exclude pure decoration, formatting, and invisible content from assistive technology.

For informative images, icons, SVG, canvas, charts, and diagrams, expose the information and relationships that users need. Do not assume filename, surrounding proximity, or generic words such as "image" provide an equivalent alternative. Verify computed names and longer descriptions in the rendered accessibility tree.

## Prerecorded and live media

The media criteria distinguish audio-only, video-only, synchronized media, prerecorded content, and live content. First classify the media correctly and determine whether it is itself a clearly labelled media alternative for text.

### 1.2.1 Audio-only and Video-only (Prerecorded) (A)

For prerecorded audio-only, provide a time-based media alternative conveying equivalent information. For prerecorded video-only, provide either an equivalent time-based media alternative or an equivalent audio track. The exception applies when the media is a clearly labelled alternative for existing text.

### 1.2.2 Captions (Prerecorded) (A)

Provide captions for all prerecorded audio in synchronized media, except when the media is a clearly labelled alternative for text. Include meaningful speech and non-speech audio needed to understand the content.

### 1.2.3 Audio Description or Media Alternative (Prerecorded) (A)

Provide either audio description or a time-based media alternative for prerecorded video in synchronized media, except when the media is a clearly labelled alternative for text.

### 1.2.4 Captions (Live) (AA)

Provide captions for all live audio in synchronized media. Verify accuracy, speaker identification, meaningful sounds, timing, and availability throughout the live presentation.

### 1.2.5 Audio Description (Prerecorded) (AA)

Provide audio description for prerecorded video content in synchronized media. At AA, a text alternative alone does not replace the required audio description when this criterion applies.

## Enhanced media requirements

### 1.2.6 Sign Language (Prerecorded) (AAA)

Provide sign-language interpretation for all prerecorded audio content in synchronized media.

### 1.2.7 Extended Audio Description (Prerecorded) (AAA)

When normal pauses are too short to convey all essential visual information, provide extended audio description by pausing the prerecorded video as needed.

### 1.2.8 Media Alternative (Prerecorded) (AAA)

Provide a time-based media alternative for all prerecorded synchronized media and all prerecorded video-only media.

### 1.2.9 Audio-only (Live) (AAA)

Provide a time-based media alternative that presents information equivalent to live audio-only content.

## Verification

Test alternatives against the content's purpose, not merely their presence. Compare captions, transcripts, descriptions, and interpretations with the complete media. Exercise player controls by keyboard and assistive technology through the relevant keyboard, focus, name-role-value, contrast, and target-size criteria in their owning references.
