import type { ScreenId } from '@swatchbook/core';
import { createContext, useContext } from 'react';
import { readTestTick } from './clock';

export const LIBRARIES = [
  { id: 'ant-design', name: 'Ant Design', status: 'built', supportsDensity: true },
  { id: 'ui5', name: 'UI5 Web Components for React', status: 'planned', supportsDensity: false },
  { id: 'ix', name: 'Siemens iX', status: 'planned', supportsDensity: false },
] as const;
export type Library = typeof LIBRARIES[number];
export type LibraryId = Library['id'];
export const LibraryContext = createContext<Library | null>(null);
export function useLibrary(): Library {
  const library = useContext(LibraryContext);
  if (!library) throw new Error('useLibrary requires RuntimeProvider');
  return library;
}
export const LIBRARY_NOT_BUILT_KEY = 'shell.library-not-built';

export function siteBaseFrom(baseUrl: string, libraryId: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (base === libraryId) return '';
  const suffix = `/${libraryId}`;
  return base.endsWith(suffix) ? base.slice(0, -suffix.length) : base;
}

export function libraryUrl({ siteBase, libraryId, screen }: { siteBase: string; libraryId: LibraryId; screen: ScreenId }): string {
  const tick = readTestTick();
  return `${siteBase.replace(/\/+$/, '')}/${libraryId}/${tick === null ? '' : `?tick=${tick}`}#/${screen}`;
}
