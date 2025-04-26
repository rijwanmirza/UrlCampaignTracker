import { TestSpentValue } from "../components/trafficstar/test-spent-value";
import { PageContainer } from "../components/page-container";
import { PageHeader } from "../components/page-header";

export default function TestSpentValuePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Test Spent Value Feature"
        description="This page allows you to test the spent value monitoring feature"
      />
      <div className="grid grid-cols-1 gap-4">
        <TestSpentValue />
      </div>
    </PageContainer>
  );
}