const bemClassName =
  '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?(?:--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$';

export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'custom-property-empty-line-before': null,
    'no-descending-specificity': null
  },
  overrides: [
    {
      files: ['src/client/**/*.module.css'],
      rules: {
        'selector-class-pattern': [
          bemClassName,
          {
            message:
              'CSS Module class names must use kebab-case BEM, for example block, block__element, or block--modifier.'
          }
        ]
      }
    }
  ]
};
