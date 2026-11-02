export type SavedSubject = { id: string; label: string; job_id: string; track_key: string; camera_id?: string; time_seconds?: number; note: string; watched: boolean; archived: boolean; created_at: number; updated_at: number };
export type Incident = { id: string; title: string; note: string; priority: 'normal' | 'high'; status: 'open' | 'reviewing' | 'closed'; job_id?: string; track_key?: string; created_at: number; updated_at: number };
export type CampusZone = { archived?: boolean; id: string; name: string; points: [number, number][]; created_at: number; updated_at: number };
export type AuditEvent = { id: string; action: string; target: string; at: number; actor: 'workspace-access' };
export type OperationsSnapshot = { subjects: SavedSubject[]; incidents: Incident[]; zones: CampusZone[]; audit: AuditEvent[] };
export const EMPTY_OPERATIONS: OperationsSnapshot = { subjects: [], incidents: [], zones: [], audit: [] };
