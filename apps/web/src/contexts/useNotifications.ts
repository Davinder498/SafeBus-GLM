import { useContext } from 'react';
import { NotificationContext } from './NotificationContext';

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('useNotifications must be used inside NotificationProvider.');
  return value;
}
