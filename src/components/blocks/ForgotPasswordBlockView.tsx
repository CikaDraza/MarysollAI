"use client";

import { AuthBlockType } from "@/types/landing-block";
import { EnvelopeOpenIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "react-hot-toast";
import { Reveal } from "../motion/Reveal";
import { useAuthActions } from "@/hooks/useAuthActions";
import { motion } from "framer-motion";
import { CollapseView } from "../motion/CollapseView";
import LoaderButton from "../LoaderButton";

interface Props {
  block: AuthBlockType;
  onSwitchLogin: () => void;
  onActionComplete?: (msg: string) => void;
}

export default function ForgotPasswordBlockView({
  onSwitchLogin,
  onActionComplete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { forgotPassword, isSendingForgot } = useAuthActions();
  const [email, setEmail] = useState(""); // 👈 inicijalno prazan string, ne undefined
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setMessage("Molimo unesite email adresu");

    try {
      const currentSlug = window.location.pathname.split("/").pop();
      await forgotPassword({
        email,
        assistantSlug: currentSlug || "",
        isAssistant: true,
      });

      setMessage("Ako nalog postoji, reset link će biti poslat na email");

      if (onActionComplete) {
        onActionComplete("USPEŠNO POSLAT ZAHTEV ZA RESET.");
      }
      setShowForm(false);
    } catch (error: unknown) {
      setMessage("Greška pri slanju. Pokušajte ponovo.");
      setShowForm(true);
      return console.error({
        error: error instanceof Error && "Auth Login Error",
        status: 500,
      });
    }
  };

  // FUNKCIJA ZA SKROL KOJA CILJA GLAVNI KONTEJNER
  const triggerGlobalScroll = () => {
    const mainContent = document.getElementById("main-content");
    if (mainContent && containerRef.current) {
      // Skrolujemo tako da ovaj blok dođe u vidno polje
      containerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start", // "start" je bolje za velike blokove kao cenovnik
      });
    }
  };

  // 1. Skroluj čim podaci prestanu da se učitavaju
  useEffect(() => {
    // Mali delay da dozvolimo React-u da renderuje listu
    const timer = setTimeout(triggerGlobalScroll, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={containerRef} className="scroll-mt-20">
      <Reveal>
        <div className="isolate reltaive bg-gray-900 rounded-2xl">
          <Toaster position="top-right" />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
          >
            <div
              style={{
                clipPath:
                  "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
              }}
              className="relative left-1/2 -z-10 aspect-1155/678 w-144.5 max-w-none -translate-x-1/2 rotate-30 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%-40rem)] sm:w-288.75"
            />
          </div>
          <div className="flex flex-col justify-center px-6 py-12 pt-36 lg:px-8">
            <motion.div
              initial={false}
              animate={{
                rotate: showForm ? 360 : 0,
                scale: showForm ? 1.2 : 1,
              }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
            >
              {showForm ? (
                <LockClosedIcon className="size-10 mx-auto text-(--secondary-color)" />
              ) : (
                <EnvelopeOpenIcon className="size-10 mx-auto text-(--secondary-color)" />
              )}
            </motion.div>

            {message && (
              <div
                className={`p-4 text-center rounded-md ${
                  message.includes("poslat")
                    ? "text-(--secondary-color)"
                    : " text-red-500"
                }`}
              >
                {message}
              </div>
            )}
            <CollapseView isExpanded={showForm}>
              <div className="sm:mx-auto sm:w-full sm:max-w-xl">
                <h3 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-white">
                  Zaboravili ste lozinku?
                </h3>
                <p className="mt-2 text-center text-sm text-gray-500">
                  Unesite email adresu i poslaćemo vam link za resetovanje šifre
                </p>
              </div>
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
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary-color) sm:text-sm/6"
                      />
                    </div>
                  </div>
                  <div>
                    <button
                      type="submit"
                      disabled={isSendingForgot}
                      className="cursor-pointer flex w-full justify-center rounded-md bg-(--secondary-color) px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-(--secondary-color)/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary-color)"
                    >
                      {isSendingForgot ? (
                        <LoaderButton />
                      ) : (
                        "Pošalji reset link"
                      )}
                    </button>
                  </div>
                </form>
                <p className="mt-10 text-center text-sm/6 text-gray-400">
                  Imate nalog?{" "}
                  <button
                    onClick={onSwitchLogin}
                    className="cursor-pointer font-semibold text-(--secondary-color) hover:text-(--secondary-color)/80"
                  >
                    Ulogujte se
                  </button>
                </p>
              </div>
            </CollapseView>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
