import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';

const RunMigrationButton = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const runMigration = async () => {
    try {
      setIsLoading(true);
      
      // Run both migrations to ensure everything is up to date
      const migrateTrafficstarResponse = await axios.post('/api/system/migrate-trafficstar-fields');
      const migrateBudgetResponse = await axios.post('/api/system/migrate-budget-update-time');
      
      console.log('Migration responses:', { 
        trafficstar: migrateTrafficstarResponse.data, 
        budget: migrateBudgetResponse.data 
      });
      
      toast({
        title: 'Migration Completed',
        description: 'Database migration successfully completed. Please refresh the page.',
        duration: 5000
      });
      
      // Reload the page after 2 seconds to refresh all data
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      console.error('Migration failed:', error);
      toast({
        title: 'Migration Failed',
        description: 'Failed to run database migration. Please try again.',
        variant: 'destructive',
        duration: 5000
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={runMigration} 
      disabled={isLoading}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Running Migration...
        </>
      ) : (
        'Run Database Migration'
      )}
    </Button>
  );
};

export default RunMigrationButton;