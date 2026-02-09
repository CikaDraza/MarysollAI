// src/components/conversational/blocks/AuthBlockView.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { AuthBlockType, AuthMode } from "@/types/landing-block";
import { RegisterBlockView } from "./RegisterBlockView";
import { ResetPasswordBlockView } from "./ResetPasswordBlockView";
import { LoginBlockView } from "./LoginBlockView";
import ForgotPasswordBlockView from "./ForgotPasswordBlockView";
import { useSearchParams } from "next/navigation";
import { Reveal } from "../motion/Reveal";
import { LogoutBlockView } from "./LogoutBlockView";

interface Props {
  block: AuthBlockType;
  onActionComplete?: (m: string) => void;
}

export function AuthBlockView({ block, onActionComplete }: Props) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const hasNotifiedRef = useRef(false);
  const incomingMode = (block.metadata?.mode as AuthMode) || "login";
  const [mode, setMode] = useState<AuthMode>(() => {
    if (token) return "reset";
    return incomingMode;
  });

  const [prevIncomingMode, setPrevIncomingMode] =
    useState<AuthMode>(incomingMode);

  // 1. AUTOMATSKO OTVARANJE RESET MODA
  useEffect(() => {
    if (token && onActionComplete && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true; // 👈 Odmah "zaključavamo" da se ne ponovi
      onActionComplete("RESETOVAO SAM ŠIFRU.");
    }
  }, [token, onActionComplete]);

  if (incomingMode !== prevIncomingMode) {
    setPrevIncomingMode(incomingMode);
    setMode(incomingMode);
  }

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
        {mode === "logout" && (
          <LogoutBlockView onActionComplete={onActionComplete} />
        )}
      </div>
    </Reveal>
  );
}
