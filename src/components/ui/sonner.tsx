import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * App toaster.
 *
 * Appearance lives in the `[data-sonner-toaster]` block in styles.css, not in
 * classNames here: sonner injects its own unlayered stylesheet at runtime, so
 * utility classes on the toast tie on specificity and lose on source order.
 *
 * `richColors` is deliberately off — it ships sonner's own palette, which drifts
 * from the semantic tokens (`--positive`, `--risk-critical`, `--risk-medium`).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      closeButton
      gap={10}
      visibleToasts={3}
      // Long enough to read a two-line connector message without rushing.
      duration={5000}
      {...props}
    />
  );
};

export { Toaster };
