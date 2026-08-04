import { createContext, useContext, type ReactNode } from 'react';

export type AppSurface = 'web' | 'native-mobile';

const AppSurfaceContext = createContext<AppSurface>('web');

export function AppSurfaceProvider({
  surface,
  children,
}: {
  surface: AppSurface;
  children: ReactNode;
}) {
  return <AppSurfaceContext.Provider value={surface}>{children}</AppSurfaceContext.Provider>;
}

export function useAppSurface(): AppSurface {
  return useContext(AppSurfaceContext);
}
