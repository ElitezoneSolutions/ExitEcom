import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useBusinessData } from "./useBusinessData";
import {
  computeFullReport,
  type AnalyticsInput,
  type FullReport,
} from "@/lib/analytics";

// Shared logic for the on-demand report pages (Exit Score, Risk Scanner,
// Valuation, Optimization). A report is only produced when the user clicks
// "Run". Once run, it is recomputed deterministically from the stored raw data
// for display (identical inputs → identical numbers) and re-persisted on demand.
export function useReport() {
  const bd = useBusinessData();
  const {
    store,
    orders,
    products,
    customers,
    business,
    risks,
    saveComputedReport,
  } = bd;
  const [computing, setComputing] = useState(false);
  const [justRan, setJustRan] = useState<FullReport | null>(null);

  const input: AnalyticsInput = useMemo(
    () => ({
      store: store
        ? {
            name: store.name,
            currency: store.currency,
            country: store.country,
            shopCreatedAt: store.shopCreatedAt,
          }
        : null,
      orders,
      products,
      customers,
      industry: business.industry || "E-commerce",
    }),
    [store, orders, products, customers, business.industry],
  );

  const hasData = orders.length > 0;
  const hasRun = business.exitScore > 0 || risks.length > 0;

  const report: FullReport | null = useMemo(() => {
    if (justRan) return justRan;
    if (hasRun && hasData) return computeFullReport(input);
    return null;
  }, [justRan, hasRun, hasData, input]);

  const run = async () => {
    if (!hasData) {
      toast.error("No store data yet — sync your store first.");
      return;
    }
    setComputing(true);
    try {
      const r = computeFullReport(input);
      setJustRan(r);
      await saveComputedReport({
        businessUpdate: r.businessUpdate,
        risks: r.risks,
        actions: r.actions,
      });
      toast.success("Report computed from your store data.");
    } finally {
      setComputing(false);
    }
  };

  return { ...bd, input, hasData, hasRun, report, computing, run };
}
