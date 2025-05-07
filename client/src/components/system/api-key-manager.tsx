import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Key } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function ApiKeyManager() {
  const [currentKey, setCurrentKey] = useState("");
  const [newKey, setNewKey] = useState("");
  const [confirmNewKey, setConfirmNewKey] = useState("");
  const [isChanging, setIsChanging] = useState(false);
  const { logout } = useAuth();

  const handleChangeKey = async () => {
    if (!currentKey || !newKey || !confirmNewKey) {
      toast({
        title: "All fields are required",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    if (newKey !== confirmNewKey) {
      toast({
        title: "Keys do not match",
        description: "The new key and confirmation key must match.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsChanging(true);
      
      const response = await apiRequest("POST", "/api/auth/change-key", {
        currentKey,
        newKey,
        confirmNewKey
      });
      
      if (response.ok) {
        toast({
          title: "API Key Changed",
          description: "Your API key was successfully updated. You will need to log in again with the new key.",
        });
        
        // Clear the inputs
        setCurrentKey("");
        setNewKey("");
        setConfirmNewKey("");
        
        // Logout after a short delay so the user can see the success message
        setTimeout(() => {
          logout().then(() => {
            window.location.href = "/login";
          });
        }, 3000);
      } else {
        const errorData = await response.json();
        toast({
          title: "Change Failed",
          description: errorData.message || "Failed to change the API key. Please check your current key.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Key className="mr-2 h-5 w-5" />
          API Key Management
        </CardTitle>
        <CardDescription>
          Change your application's API security key. You will need to log in with the new key after changing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="current-key">Current API Key</Label>
            <Input
              id="current-key"
              type="password"
              value={currentKey}
              onChange={(e) => setCurrentKey(e.target.value)}
              placeholder="Enter your current API key"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="new-key">New API Key</Label>
            <Input
              id="new-key"
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Enter a new API key"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="confirm-new-key">Confirm New API Key</Label>
            <Input
              id="confirm-new-key"
              type="password"
              value={confirmNewKey}
              onChange={(e) => setConfirmNewKey(e.target.value)}
              placeholder="Confirm your new API key"
            />
          </div>
          
          <Button 
            onClick={handleChangeKey} 
            disabled={isChanging || !currentKey || !newKey || !confirmNewKey}
          >
            {isChanging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Changing API Key...
              </>
            ) : (
              "Change API Key"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}