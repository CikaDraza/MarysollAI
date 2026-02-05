// src/components/blocks/LoginBlock.tsx
"use client";
import { useAuthActions } from "@/hooks/useAuthActions";
import { AuthBlockType } from "@/types/landing-block";
import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { LockOpenIcon } from "@heroicons/react/24/outline";
import LoaderButton from "../LoaderButton";
import { Reveal } from "../motion/Reveal";
import { motion } from "framer-motion";
import { CollapseView } from "../motion/CollapseView";

interface Props {
  block: AuthBlockType;
  onSwitchRegister: () => void;
  onSwitchForgot: () => void;
  onActionComplete?: (msg: string) => void;
}

export function LoginBlockView({
  block,
  onSwitchRegister,
  onSwitchForgot,
  onActionComplete,
}: Props) {
  const { user, login, isLoggingIn } = useAuthActions();
  const [email, setEmail] = useState(block.defaultEmail || "");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password });
      // ✅ OBAVEŠTAVAMO AGENTA
      if (onActionComplete) {
        onActionComplete("USPEŠNA PRIJAVA.");
      }
    } catch (error: unknown) {
      return console.error({
        error: error instanceof Error && "Auth Login Error",
        status: 500,
      });
    }
  };

  const showForm = !user;

  return (
    <Reveal>
      <div className="isolate relative bg-gray-900 rounded-2xl">
        <Toaster position="top-right" />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-44 -z-10 transform-gpu overflow-hidden blur-3xl lg:-top-96"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="relative left-1/2 -z-10 aspect-1155/678 w-144.5 max-w-none -translate-x-1/2 rotate-30 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%-40rem)] sm:w-288.75"
          />
        </div>
        <div className="flex flex-col justify-center px-6 py-12 lg:px-8">
          <div className="header sm:mx-auto sm:w-full sm:max-w-xl">
            <motion.div
              initial={false}
              animate={{ rotate: user ? 360 : 0, scale: user ? 1.2 : 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
            >
              {user ? (
                <LockOpenIcon className="size-10 mx-auto text-teal-400" />
              ) : (
                <LockClosedIcon className="size-10 mx-auto text-(--secondary-color)" />
              )}
            </motion.div>
            <h3 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-white">
              {user
                ? `Zdravo, ${user.name || "uspešna prijava"}`
                : "Prijavite se na vaš nalog."}
            </h3>
          </div>
          <CollapseView isExpanded={showForm}>
            <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm/6 font-medium text-gray-100"
                  >
                    Email address
                  </label>
                  <div className="mt-2">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary-color) sm:text-sm/6"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-sm/6 font-medium text-gray-100"
                    >
                      Password
                    </label>
                    <div className="text-sm">
                      <button
                        onClick={onSwitchForgot}
                        className="cursor-pointer font-semibold text-(--secondary-color) hover:text-(--secondary-color)/80"
                      >
                        Zaboravili ste lozinku?
                      </button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary-color) sm:text-sm/6"
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="cursor-pointer flex w-full justify-center rounded-md bg-(--secondary-color) px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-(--secondary-color)/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary-color)"
                  >
                    {isLoggingIn ? <LoaderButton /> : "Ulogujte se"}
                  </button>
                </div>
              </form>

              <p className="mt-10 text-center text-sm/6 text-gray-400">
                Niste registrovani?{" "}
                <button
                  onClick={onSwitchRegister}
                  className="cursor-pointer font-semibold text-(--secondary-color) hover:text-(--secondary-color)/80"
                >
                  registrujte se
                </button>
              </p>
            </div>
          </CollapseView>
        </div>
      </div>
    </Reveal>
  );
}
