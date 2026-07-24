"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { BriefForm } from "@/components/brief-form";
import { LogoDesignPage } from "@/components/logo-design-page";
import { CopyPlanningPage } from "@/components/copy-planning-page";
import { ProductDesignPage } from "@/components/product-design-page";
import { PackagingDesignPage } from "@/components/packaging-design-page";
import { DeliveryPage } from "@/components/delivery-page";
import { PlaceholderStep } from "@/components/placeholder-step";
import { WorkflowShell } from "@/components/workflow-shell";

export default function WorkflowPage() {
  const params = useParams<{ step: string }>();
  const router = useRouter();
  const parsed = Number(params.step);
  const legacyDeliveryRoute = parsed === 7;
  const step = Number.isInteger(parsed) && parsed >= 1 && parsed <= 6 ? parsed : legacyDeliveryRoute ? 6 : 1;
  useEffect(() => {
    if (legacyDeliveryRoute) router.replace("/workflow/6");
  }, [legacyDeliveryRoute, router]);
  return <WorkflowShell currentStep={step}>{step === 1 ? <BriefForm /> : step === 2 ? <LogoDesignPage /> : step === 3 ? <CopyPlanningPage /> : step === 4 ? <ProductDesignPage /> : step === 5 ? <PackagingDesignPage /> : step === 6 ? <DeliveryPage /> : <PlaceholderStep step={step} />}</WorkflowShell>;
}
