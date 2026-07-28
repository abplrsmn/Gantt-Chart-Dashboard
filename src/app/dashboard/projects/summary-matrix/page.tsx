import ProjectSummaryMatrixPage from "@/components/dashboard/ProjectSummaryMatrixPage";

export default function SummaryMatrixPage() {
  return (
    <div className="animate-page-enter flex flex-col overflow-hidden" style={{ height: "calc(100vh - 96px)" }}>
      <ProjectSummaryMatrixPage />
    </div>
  );
}
