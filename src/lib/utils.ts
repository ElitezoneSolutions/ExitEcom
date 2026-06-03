import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtGBP = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);

export const fmtGBPk = (n: number) => {
  if (Math.abs(n) >= 1000) return `£${(n / 1000).toFixed(0)}k`;
  return fmtGBP(n);
};
