/** Type families and the size ramp both apps draw from. Sizes are px on web and dp on mobile. */
export const TYPE = {
  display: { family: 'Rajdhani', weights: ['500', '600', '700'] },
  body: { family: 'Inter' },
  mono: { family: 'JetBrainsMono' },
  ramp: { label: 11, caption: 12, body: 14, bodyLg: 16, title: 20, heading: 28 },
} as const;
