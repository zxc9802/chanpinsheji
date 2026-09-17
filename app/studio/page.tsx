import { WorkflowShell } from '@/components/workflow-shell';
import { QuickDesignStudio } from '@/components/quick-design-studio';
export default function StudioPage() {
  return <WorkflowShell currentStep={1} mode="studio"><QuickDesignStudio /></WorkflowShell>;
}
