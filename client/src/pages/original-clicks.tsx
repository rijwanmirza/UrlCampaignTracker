import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pencil, RefreshCw, Check, X } from "lucide-react";

interface OriginalUrl {
  id: number;
  name: string;
  target_url: string;
  original_click_limit: number;
  used_in_campaigns: string[];
}

export default function OriginalClicksPage() {
  const { toast } = useToast();
  const [editableItem, setEditableItem] = useState<OriginalUrl | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newClickValue, setNewClickValue] = useState<string>("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  
  // Fetch all URLs with their original click values
  const { data: urls, isLoading, error, refetch } = useQuery<OriginalUrl[]>({
    queryKey: ['/api/original-clicks'],
    retry: false
  });

  // Update original click value mutation
  const updateOriginalClickMutation = useMutation({
    mutationFn: async ({ id, originalClickLimit }: { id: number; originalClickLimit: number }) => {
      const response = await fetch(`/api/original-clicks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_click_limit: originalClickLimit }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update original click value");
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Original click value updated and propagated successfully",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/original-clicks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/urls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      setIsDialogOpen(false);
      setIsConfirmOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update original click value",
        variant: "destructive",
      });
    }
  });

  // Handle edit click
  const handleEdit = (url: OriginalUrl) => {
    setEditableItem(url);
    setNewClickValue(url.original_click_limit.toString());
    setIsDialogOpen(true);
  };

  // Handle update
  const handleUpdate = () => {
    if (!editableItem || !newClickValue || isNaN(parseInt(newClickValue))) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid number for click limit",
        variant: "destructive",
      });
      return;
    }
    
    setIsConfirmOpen(true);
  };

  // Confirm and apply update
  const confirmUpdate = () => {
    if (!editableItem) return;
    
    updateOriginalClickMutation.mutate({
      id: editableItem.id,
      originalClickLimit: parseInt(newClickValue),
    });
  };

  // Format URL display for better readability
  const formatUrl = (url: string) => {
    if (url.length > 40) {
      return url.substring(0, 37) + "...";
    }
    return url;
  };

  // Handle manual refresh
  const handleRefresh = () => {
    refetch();
    toast({
      title: "Refreshed",
      description: "Original click values data refreshed",
      variant: "default",
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">Original Click Values</h1>
        <div className="flex justify-center items-center h-40">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">Original Click Values</h1>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4">
          <p>{(error as Error).message || "Failed to load original click values"}</p>
        </div>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Original Click Values</h1>
        <Button onClick={handleRefresh} variant="outline" className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </Button>
      </div>
      
      <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md mb-6">
        <p>This section manages the original click quantities for URLs. Any changes made here will propagate to all campaigns using these URLs.</p>
      </div>
      
      {urls && urls.length > 0 ? (
        <div className="bg-white rounded-md shadow overflow-hidden">
          <Table>
            <TableCaption>List of all URLs with their original click quantities</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">URL Name</TableHead>
                <TableHead className="hidden md:table-cell">Target URL</TableHead>
                <TableHead className="w-[150px] text-right">Original Clicks</TableHead>
                <TableHead className="w-[150px] hidden md:table-cell">Used In Campaigns</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {urls.map((url) => (
                <TableRow key={url.id}>
                  <TableCell className="font-medium">{url.name}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <a href={url.target_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {formatUrl(url.target_url)}
                    </a>
                  </TableCell>
                  <TableCell className="text-right font-mono">{url.original_click_limit.toLocaleString()}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {url.used_in_campaigns && url.used_in_campaigns.length > 0 
                      ? url.used_in_campaigns.join(', ') 
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleEdit(url)}
                      title="Edit original click value"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-10 bg-gray-50 rounded-md">
          <p className="text-gray-500">No URLs found. URLs will appear here once added to the system.</p>
        </div>
      )}
      
      {/* Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Original Click Value</DialogTitle>
            <DialogDescription>
              Update the original click quantity for {editableItem?.name}. This change will propagate to all campaigns using this URL.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">URL Name</Label>
              <Input id="name" value={editableItem?.name || ""} className="col-span-3" disabled />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="original_clicks" className="text-right">Original Clicks</Label>
              <Input 
                id="original_clicks" 
                type="number" 
                value={newClickValue} 
                onChange={(e) => setNewClickValue(e.target.value)}
                className="col-span-3" 
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateOriginalClickMutation.isPending}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Confirmation Dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Update</DialogTitle>
            <DialogDescription>
              Are you sure you want to change the original click value from {editableItem?.original_click_limit} to {newClickValue}?
              This will update all instances of this URL across all campaigns.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmOpen(false)}>Cancel</Button>
            <Button onClick={confirmUpdate} disabled={updateOriginalClickMutation.isPending}>
              {updateOriginalClickMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Confirm
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}