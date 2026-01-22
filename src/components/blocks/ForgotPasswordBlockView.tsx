"use client";

import { AuthBlockType } from "@/types/landing-block";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { Reveal } from "../motion/Reveal";

interface Props {
  block: AuthBlockType;
  onSwitchLogin: () => void;
  onActionComplete?: (msg: string) => void;
}

export default function ForgotPasswordBlockView({
  block,
  onSwitchLogin,
  onActionComplete,
}: Props) {
  const [email, setEmail] = useState(""); // 👈 inicijalno prazan string, ne undefined
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage("Molimo unesite email adresu");
      return;
    }

    setIsLoading(true);

    try {
      // if (res.ok) {
      //   setMessage("Ako nalog postoji, reset link će biti poslat na email");
      //   setEmail("");
      //   toast.success("link poslat na email!");
      // } else {
      //   setMessage(data.error || "Došlo je do greške");
      // }

      // ✅ OBAVEŠTAVAMO AGENTA
      if (onActionComplete) {
        onActionComplete("Uspešno sam se ulogovao. Šta je sledeći korak?");
      }
    } catch (error: unknown) {
      setMessage(`Došlo je do greške pri slanju zahteva - ${error}`);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Došlo je do greške pri prijavi";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
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
          <div className="sm:mx-auto sm:w-full sm:max-w-xl">
            <LockClosedIcon className="size-10 mx-auto text-(--secondary-color)" />
            {message && (
              <div
                className={`p-4 text-center rounded-md ${
                  message.includes("poslat")
                    ? "text-green-500"
                    : " text-red-500"
                }`}
              >
                {message}
              </div>
            )}
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
                  disabled={isLoading}
                  className="cursor-pointer flex w-full justify-center rounded-md bg-(--secondary-color) px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-(--secondary-color)/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary-color)"
                >
                  {isLoading ? "Slanje..." : "Pošalji reset link"}
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
        </div>
      </div>
    </Reveal>
  );
}
