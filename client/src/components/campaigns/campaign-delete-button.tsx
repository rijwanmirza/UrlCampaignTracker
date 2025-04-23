import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface CampaignDeleteButtonProps {
  campaignId: number;
  onSuccess?: () => void;
}

export default function CampaignDeleteButton({ campaignId, onSuccess }: CampaignDeleteButtonProps) {
  const [open, setOpen] = React.useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const deleteCampaignMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/campaigns/${campaignId}`, undefined);
    },
    onSuccess: () => {
      toast({
        title: 'Campaign deleted',
        description: 'The campaign has been deleted successfully.',
      });
      
      // Invalidate queries that might be affected
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
      
      // Close the dialog
      setOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete campaign. Please try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Campaign
        </Button>
      </AlertDialogTrigger>
      
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action will permanently delete the campaign and mark all its URLs as deleted.
            The URLs will still be visible in URL History with their click data preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              deleteCampaignMutation.mutate();
            }}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteCampaignMutation.isPending ? 'Deleting...' : 'Delete Campaign'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}