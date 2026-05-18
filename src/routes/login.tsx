import { createFileRoute } from "@tanstack/react-router";
import { SplitAuth } from "./signup";

export const Route = createFileRoute("/login")({ component: () => <SplitAuth mode="login" /> });
