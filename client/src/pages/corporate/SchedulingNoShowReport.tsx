import SchedulingNoShowTab from "@/components/scheduling/SchedulingNoShowTab";
import {
  SchedulingModuleNav,
  SchedulingReportBreadcrumb,
} from "@/components/scheduling/SchedulingModuleNav";

export default function SchedulingNoShowReport() {
  return (
    <div className="p-6 space-y-4 max-w-screen-2xl mx-auto" data-testid="scheduling-no-show-report">
      <SchedulingModuleNav active="reports" />
      <SchedulingReportBreadcrumb reportName="No Show Monitor" />
      <SchedulingNoShowTab />
    </div>
  );
}