import { notFound, redirect } from "next/navigation";
import { WorkspaceScreen } from "@/components/workspace/WorkspaceScreen";
import { VIEW_NAMES, type WorkspaceView } from "@/lib/workspace-types";
export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  const view = section?.[0] ?? "overview";
  if (view === 'research' && section?.length === 1) redirect('/workspace');
  if (section && section.length > 1 || !Object.hasOwn(VIEW_NAMES, view)) notFound();
  return <WorkspaceScreen view={view as WorkspaceView} />;
}
