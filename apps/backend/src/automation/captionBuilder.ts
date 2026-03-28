import { CAPTION_TEMPLATES } from '@whatsapp-porter/shared';

interface CaptionVars {
  groupName: string;
  sender: string;
  originalCaption: string;
}

export function buildCaption(template: string | null | undefined, vars: CaptionVars): string {
  // If a custom template is provided, use it. Otherwise pick a random variation.
  const tpl = template && template.trim()
    ? template
    : CAPTION_TEMPLATES[Math.floor(Math.random() * CAPTION_TEMPLATES.length)];

  return tpl
    .replace(/\{groupName\}/g, vars.groupName)
    .replace(/\{sender\}/g, vars.sender)
    .replace(/\{originalCaption\}/g, vars.originalCaption || '(none)');
}
