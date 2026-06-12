import { useState } from "react";
import { toast } from "sonner";
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
} from "@/components/ui/alert-dialog";

// Confirmed disconnect for a data source. Deleting a source removes its stored
// data, so the action is guarded behind an AlertDialog rather than firing on a
// single click. `variant` switches between the compact text link used on the
// Data Sources cards and a bordered button used in page headers.
export function DisconnectButton({
  name,
  onConfirm,
  variant = "link",
}: {
  name: string;
  onConfirm: () => Promise<void>;
  variant?: "link" | "button";
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      toast.error(
        (err instanceof Error && err.message) ||
          `Could not disconnect ${name}.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const trigger =
    variant === "button" ? (
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border-warm)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--risk-critical)] hover:border-[var(--risk-critical)]/40 transition-colors"
      >
        Disconnect
      </button>
    ) : (
      <button
        type="button"
        className="text-xs text-[var(--text-muted)] hover:text-[var(--risk-critical)] font-medium transition-colors"
      >
        Disconnect
      </button>
    );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes all data we pulled from {name} and revokes the stored
            credentials. Your Exit Score will no longer use this source until
            you reconnect. This can't be undone, but you can reconnect at any
            time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handle();
            }}
            disabled={busy}
            className="bg-[var(--risk-critical)] hover:bg-[var(--risk-critical)]/90"
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
