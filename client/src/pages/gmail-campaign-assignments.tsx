import GmailCampaignAssignments from "@/components/gmail/campaign-assignments";

export default function GmailCampaignAssignmentsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Gmail Campaign Assignments</h1>
        <p className="text-muted-foreground">
          Configure rules for assigning URLs from Gmail to campaigns based on click quantity.
        </p>
      </div>
      
      <GmailCampaignAssignments />
    </div>
  );
}