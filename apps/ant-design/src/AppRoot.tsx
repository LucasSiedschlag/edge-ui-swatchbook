import { RuntimeProvider, type RuntimeProviderProps } from '@swatchbook/runtime';
import { Shell } from './Shell';

export type AppRootProps = Omit<RuntimeProviderProps, 'libraryId' | 'children'>;

/** Mounts the whole app. Tests pass the provider's test props. */
export function AppRoot(props: AppRootProps) {
  return (
    <RuntimeProvider libraryId="ant-design" {...props}>
      <Shell />
    </RuntimeProvider>
  );
}
