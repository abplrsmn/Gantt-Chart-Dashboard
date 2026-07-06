import ProjectSummaryMatrixPage from "@/components/dashboard/ProjectSummaryMatrixPage";

export default function SummaryMatrixPage() {
  return (
    <div className="animate-page-enter flex flex-col" style={{ height: "calc(100vh - 52px)" }}>
      <ProjectSummaryMatrixPage />
    </div>
  );
}
