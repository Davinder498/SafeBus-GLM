import { monitorStatus } from '../lib/monitor-heartbeat.mjs';

// Public, read-only aggregate signal for the independent external monitor.
// A request never runs probes, writes a heartbeat, or sends notifications.
export default function handler(request, context) {
  return monitorStatus(request, { deploy: context?.deploy });
}
