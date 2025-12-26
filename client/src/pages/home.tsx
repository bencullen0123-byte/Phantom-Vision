import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Zap } from "lucide-react";
import { SiStripe } from "react-icons/si";

export default function Home() {
  const stripeConnectUrl = "/api/auth/stripe";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            <CardTitle className="text-3xl font-bold tracking-tight" data-testid="text-title">
              PHANTOM
            </CardTitle>
          </div>
          <CardDescription className="text-base" data-testid="text-description">
            Revenue Intelligence Engine
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3 p-4 bg-muted rounded-md">
            <Zap className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Connect your Stripe account to begin hunting ghost users and recovering lost revenue.
            </p>
          </div>
          <a href={stripeConnectUrl} data-testid="link-connect-stripe">
            <Button className="w-full gap-2" size="lg">
              <SiStripe className="h-5 w-5" />
              Connect Stripe
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
