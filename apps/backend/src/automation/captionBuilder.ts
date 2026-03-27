import { DEFAULT_CAPTION_TEMPLATE } from '@whatsapp-porter/shared';

interface CaptionVars {
  groupName: string;
  sender: string;
  originalCaption: string;
}

export function buildCaption(template: string | null | undefined, vars: CaptionVars): string {
  const tpl = template && template.trim() ? template : DEFAULT_CAPTION_TEMPLATE;

  return tpl
    .replace(/\{groupName\}/g, vars.groupName)
    .replace(/\{sender\}/g, vars.sender)
    .replace(/\{originalCaption\}/g, vars.originalCaption || '(none)');
}
