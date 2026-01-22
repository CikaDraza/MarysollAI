// src/components/conversational/blocks/AuthBlockView.tsx
"use client";

import { useState } from "react";
import { AuthBlockType } from "@/types/landing-block";
import { RegisterBlockView } from "./RegisterBlockView";
import { ResetPasswordBlockView } from "./ResetPasswordBlockView";
import { LoginBlockView } from "./LoginBlockView";
import ForgotPasswordBlockView from "./ForgotPasswordBlockView";
import { useSearchParams } from "next/navigation";
import { Reveal } from "../motion/Reveal";

interface Props {
  block: AuthBlockType;
  onActionComplete?: (m: string) => void;
}

export function AuthBlockView({ block, onActionComplete }: Props) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(
    "login",
  );

  return (
    <Reveal>
      <div className="max-w-md mx-auto py-12">
        {mode === "login" && (
          <LoginBlockView
            block={block}
            onSwitchRegister={() => setMode("register")}
            onSwitchForgot={() => setMode("forgot")}
            onActionComplete={onActionComplete}
          />
        )}
        {mode === "register" && (
          <RegisterBlockView
            block={block}
            onSwitchLogin={() => setMode("login")}
            onActionComplete={onActionComplete}
          />
        )}
        {mode === "forgot" && (
          <ForgotPasswordBlockView
            block={block}
            onSwitchLogin={() => setMode("login")}
            onActionComplete={onActionComplete}
          />
        )}
        {mode === "reset" && (
          <ResetPasswordBlockView
            block={block}
            token={token || ""}
            onSwitchLogin={() => setMode("login")}
            onActionComplete={onActionComplete}
          />
        )}
      </div>
    </Reveal>
  );
}
