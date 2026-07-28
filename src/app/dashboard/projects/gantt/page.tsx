import ProjectGanttDB from "@/components/dashboard/ProjectGanttDB";

export default function ProjectGanttPage() {
  return (
    <div className="animate-page-enter flex flex-col overflow-hidden" style={{ height: "calc(100vh - 96px)" }}>
      <ProjectGanttDB />
    </div>
  );
}
