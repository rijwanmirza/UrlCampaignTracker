import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GmailConfigExact from "@/components/gmail/gmail-config-exact";
import GmailCampaignAssignments from "@/components/gmail/campaign-assignments";

export default function GmailSettingsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Gmail Reader Settings</h1>
        <p className="text-muted-foreground">
          Configure automatic URL import from emails and campaign assignment rules.
        </p>
      </div>
      
      <Tabs defaultValue="config" className="space-y-6">
        <TabsList>
          <TabsTrigger value="config">Gmail Configuration</TabsTrigger>
          <TabsTrigger value="assignments">Campaign Assignments</TabsTrigger>
        </TabsList>
        
        <TabsContent value="config" className="space-y-4">
          <GmailConfigExact />
        </TabsContent>
        
        <TabsContent value="assignments" className="space-y-4">
          <GmailCampaignAssignments />
        </TabsContent>
      </Tabs>
    </div>
  );
}