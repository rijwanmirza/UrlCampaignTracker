import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/contexts/AuthContext';

const apiKeySchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
});

type ApiKeyFormValues = z.infer<typeof apiKeySchema>;

export default function ApiKeyLogin() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      apiKey: '',
    },
  });

  // Import useAuth
  const { verifyApiKey } = useAuth();
  
  async function onSubmit(data: ApiKeyFormValues) {
    setIsLoading(true);
    
    try {
      await verifyApiKey(data.apiKey);
      
      toast({
        title: 'Access granted',
        description: 'API key accepted',
      });
      
      // Redirect to main page after successful API key verification
      navigate('/');
    } catch (error: any) {
      console.error('API key verification error:', error);
      
      toast({
        title: 'Invalid API key',
        description: error.response?.data?.message || 'The API key is not valid',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">TrafficStar Manager</CardTitle>
          <CardDescription className="text-center">
            Enter your API key to access the application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter secret keyword" 
                        {...field} 
                        disabled={isLoading} 
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Verifying...' : 'Access Application'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-xs text-muted-foreground text-center">
            Enter the secret keyword to access the application
          </div>
          <div className="text-xs text-muted-foreground text-center">
            Your API key will be remembered for 30 days
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}