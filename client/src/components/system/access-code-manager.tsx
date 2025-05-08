import { useState, useEffect } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound } from "lucide-react";

export default function AccessCodeManager() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [maskedAccessCode, setMaskedAccessCode] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmNewCode, setConfirmNewCode] = useState("");
  const [isChangeFormVisible, setIsChangeFormVisible] = useState(false);

  useEffect(() => {
    fetchAccessCode();
  }, []);

  const fetchAccessCode = async () => {
    try {
      setIsLoading(true);
      const data = await apiRequest("GET", "/api/auth/access-code");
      
      if (data?.success) {
        setMaskedAccessCode(data.accessCode);
      } else {
        toast({
          title: "Error",
          description: data?.message || "Failed to load access code",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fetching access code:", error);
      toast({
        title: "Error",
        description: "Unable to load access code. Please refresh the page and try again.",
        variant: "destructive",
      });
      // Set a default masked code so the UI doesn't break
      setMaskedAccessCode("****");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (currentCode.trim() === "") {
      toast({
        title: "Validation Error",
        description: "Current access code is required",
        variant: "destructive",
      });
      return;
    }

    if (newCode.trim() === "") {
      toast({
        title: "Validation Error",
        description: "New access code is required",
        variant: "destructive",
      });
      return;
    }

    if (confirmNewCode !== newCode) {
      toast({
        title: "Validation Error",
        description: "New access code and confirmation do not match",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSaving(true);
      
      const data = await apiRequest("POST", "/api/auth/change-access-code", {
        currentCode,
        newCode,
        confirmNewCode,
      });
      
      if (data.success) {
        toast({
          title: "Success",
          description: "Access code has been updated successfully",
        });
        
        // Reset form
        setCurrentCode("");
        setNewCode("");
        setConfirmNewCode("");
        setIsChangeFormVisible(false);
        
        // Refresh the masked access code
        fetchAccessCode();
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to update access code",
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
      setIsSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center">
          <KeyRound className="mr-2 h-5 w-5" />
          Special Access URL Code
        </CardTitle>
        <CardDescription>
          Change your application's special access URL code. You will need to use the new code in the /access/CODE URL.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="mb-4">
              <Label htmlFor="current-code">Current Access Code</Label>
              <div className="flex items-center mt-1">
                <Input
                  id="current-code"
                  value={maskedAccessCode}
                  disabled
                  className="font-mono bg-muted"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="ml-2"
                  onClick={() => setIsChangeFormVisible(!isChangeFormVisible)}
                >
                  {isChangeFormVisible ? "Cancel" : "Change"}
                </Button>
              </div>
            </div>

            {isChangeFormVisible && (
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="current-code-input">Enter Current Access Code</Label>
                    <Input
                      id="current-code-input"
                      type="password"
                      value={currentCode}
                      onChange={(e) => setCurrentCode(e.target.value)}
                      className="mt-1"
                      placeholder="Enter current access code"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="new-code">New Access Code</Label>
                    <Input
                      id="new-code"
                      type="password"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      className="mt-1"
                      placeholder="Enter new access code"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="confirm-new-code">Confirm New Access Code</Label>
                    <Input
                      id="confirm-new-code"
                      type="password"
                      value={confirmNewCode}
                      onChange={(e) => setConfirmNewCode(e.target.value)}
                      className="mt-1"
                      placeholder="Confirm new access code"
                      required
                    />
                  </div>
                  
                  <div className="pt-2">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Update Access Code"
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}