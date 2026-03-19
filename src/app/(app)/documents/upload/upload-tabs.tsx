"use client";

import { FileText, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadForm } from "./upload-form";
import { IndividualPaymentForm } from "./individual-payment-form";

export function UploadTabs() {
  return (
    <Tabs defaultValue="document">
      <TabsList className="mb-4 w-full">
        <TabsTrigger value="document">
          <FileText className="mr-1.5 size-4" />
          Invoice / Receipt
        </TabsTrigger>
        <TabsTrigger value="individual">
          <User className="mr-1.5 size-4" />
          Payment to Individual
        </TabsTrigger>
      </TabsList>
      <TabsContent value="document">
        <UploadForm />
      </TabsContent>
      <TabsContent value="individual">
        <IndividualPaymentForm />
      </TabsContent>
    </Tabs>
  );
}
