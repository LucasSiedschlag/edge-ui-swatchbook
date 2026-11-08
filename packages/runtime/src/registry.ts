import type { ScreenId } from '@swatchbook/core';

export const LIBRARIES = [
  { id: 'ant-design', name: 'Ant Design', status: 'built' },
  { id: 'ui5', name: 'UI5 Web Components for React', status: 'planned' },
  { id: 'ix', name: 'Siemens iX', status: 'planned' },
] as const;
export type LibraryId = typeof LIBRARIES[number]['id'];
export const LIBRARY_NOT_BUILT_KEY = 'shell.library-not-built';

export function libraryUrl({ siteBase, libraryId, screen }: { siteBase: string; libraryId: LibraryId; screen: ScreenId }): string {
  return `${siteBase.replace(/\/+$/, '')}/${libraryId}/#/${screen}`;
}
