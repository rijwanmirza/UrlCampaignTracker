import { TestSpentValue } from "../components/trafficstar/test-spent-value";
import { TestUrlBudget } from "../components/trafficstar/test-url-budget";
import { PageContainer } from "../components/page-container";
import { PageHeader } from "../components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TestSpentValuePage() {
  return (
    <PageContainer>
      <PageHeader
        title="TrafficStar API Testing"
        description="This page provides tools to test various TrafficStar API integrations"
      />
      
      <Tabs defaultValue="spent-value" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="spent-value">Spent Value Tests</TabsTrigger>
          <TabsTrigger value="url-budget">URL Budget Tests</TabsTrigger>
        </TabsList>
        
        <TabsContent value="spent-value" className="mt-4">
          <div className="grid grid-cols-1 gap-4">
            <TestSpentValue />
          </div>
        </TabsContent>
        
        <TabsContent value="url-budget" className="mt-4">
          <div className="grid grid-cols-1 gap-4">
            <TestUrlBudget />
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}