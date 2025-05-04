import { ReportsApiTester } from "@/components/trafficstar/reports-api-tester";

/**
 * API Tester Page
 * Page for testing various API integrations
 */
export default function ApiTesterPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">API Testing Tools</h1>
      
      <div className="grid grid-cols-1 gap-8">
        <ReportsApiTester />
      </div>
    </div>
  );
}