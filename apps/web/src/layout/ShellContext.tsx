import type { GoogleStatus } from '@replypilot/shared';
import { createContext, useContext } from 'react';

export interface ShellValue {
  status: GoogleStatus | undefined;
  // Undefined means every location the person can reach.
  locationId: string | undefined;
  setLocationId: (id: string | undefined) => void;
}

export const ShellContext = createContext<ShellValue>({
  status: undefined,
  locationId: undefined,
  setLocationId: () => {},
});

export const useShell = () => useContext(ShellContext);

export const managedLocations = (status: GoogleStatus | undefined) =>
  (status?.locations ?? []).filter((location) => location.status !== 'available');
