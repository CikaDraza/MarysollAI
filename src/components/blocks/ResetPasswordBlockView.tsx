"use client";
import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { AuthBlockType } from "@/types/landing-block";
import { useAuthActions } from "@/hooks/useAuthActions";
import { Reveal } from "../motion/Reveal";
import { motion } from "framer-motion";
import { CollapseView } from "../motion/CollapseView";
import { PaperAirplaneIcon, PencilIcon } from "@heroicons/react/24/outline";
import LoaderButton from "../LoaderButton";

interface Props {
  block: AuthBlockType;
  token?: string;
  onSwitchLogin: () => void;
  onActionComplete?: (msg: string) => void;
}

export function ResetPasswordBlockView({
  token,
  onSwitchLogin,
  onActionComplete,
}: Props) {
  const { resetPassword, isResetting } = useAuthActions();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setMessage("Nevažeći reset link");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Šifre se ne poklapaju");
      return;
    }

    if (password.length < 6) {
      setMessage("Šifra mora imati najmanje 6 karaktera");
      return;
    }

    try {
      await resetPassword({ token, newPassword: password });

      if (onActionComplete) {
        onActionComplete("USPEŠNO UPISANA NOVA ŠIFRA.");
      }
      setShowForm(false);
      // nakon uspešnog API poziva ukloniti ?token=... :
      window.history.replaceState({}, "", window.location.pathname);
      // Opciono: automatski prebaci na login nakon par sekundi
      setTimeout(() => onSwitchLogin(), 3000);
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : String(err));
      setMessage("Došlo je do greške pri resetovanju šifre");
      setShowForm(true);
    }
  };

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
              animate={{
                rotate: showForm ? 360 : 0,
                scale: showForm ? 1.2 : 1,
              }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
            >
              {showForm ? (
                <PencilIcon className="size-10 mx-auto text-teal-400" />
              ) : (
                <PaperAirplaneIcon className="size-10 mx-auto text-(--secondary-color)" />
              )}
            </motion.div>
            <h2 className="mt-6 text-center text-3xl! font-extrabold text-gray-50">
              Resetuj šifru
            </h2>
            <p className="mt-2 text-center text-sm text-gray-300">
              Unesite novu šifru za vaš nalog
            </p>
          </div>
          {message && (
            <div
              className={`p-4 text-center rounded-md ${
                message.includes("poslat") ? "text-green-500" : " text-red-500"
              }`}
            >
              {message}
            </div>
          )}
          <CollapseView isExpanded={showForm}>
            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-100 mb-1"
                >
                  Nova šifra
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-(--secondary-color) focus:border-(--secondary-color) focus:z-10 sm:text-sm"
                  placeholder="Unesite novu šifru"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Potvrdite šifru
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-(--secondary-color) focus:border-(--secondary-color) focus:z-10 sm:text-sm"
                  placeholder="Ponovite šifru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="cursor-pointer group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-(--primary-color) hover:bg-(--primary-color)/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-(--primary-color) disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResetting ? <LoaderButton /> : "Resetuj šifru"}
                </button>
              </div>
            </form>
            <p className="mt-10 text-center text-sm/6 text-gray-400">
              Imate nalog?{" "}
              <button
                onClick={onSwitchLogin}
                className="font-semibold text-(--secondary-color) hover:text-(--secondary-color)/80"
              >
                Ulogujte se
              </button>
            </p>
          </CollapseView>
        </div>
      </div>
    </Reveal>
  );
}
