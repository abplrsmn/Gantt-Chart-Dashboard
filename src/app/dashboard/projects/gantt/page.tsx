import ProjectGanttDB from "@/components/dashboard/ProjectGanttDB";

export default function ProjectGanttPage() {
  return (
    <div className="animate-page-enter flex flex-col" style={{ maxHeight: "calc(100vh - 52px)" }}>
      <ProjectGanttDB />
    </div>
  );
}
