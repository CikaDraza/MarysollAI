"use client";

import { ChevronDownIcon } from "@heroicons/react/16/solid";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import { useEffect, useRef, useState } from "react";
import { AuthBlockType } from "@/types/landing-block";
import { CheckCircleIcon, LockClosedIcon } from "@heroicons/react/24/outline";
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

export function RegisterBlockView({
  block,
  onSwitchLogin,
  onActionComplete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { user, register, isRegistering } = useAuthActions();
  const [formData, setFormData] = useState({
    name: "",
    email: block.defaultEmail || "",
    password: "",
    phone: "",
    birthday: "",
    agree: false,
  });

  // ✅ validacija jednostavna
  const validate = () => {
    if (!formData.name.trim()) return "Unesite ime.";
    if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
      return "Unesite validan email.";
    if (!formData.phone.match(/^[0-9+\-\s]{6,}$/))
      return "Unesite ispravan broj telefona.";
    if (!formData.agree) return "Morate prihvatiti politiku privatnosti.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    try {
      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        phone: formData.phone,
        agreedToPrivacy: formData.agree,
      });
      // ✅ OBAVEŠTAVAMO AGENTA
      if (onActionComplete) {
        onActionComplete("USPEŠNA REGISTRACIJA.");
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : String(err));
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

  const showForm = !user;

  return (
    <div ref={containerRef} className="scroll-mt-20">
      <Reveal>
        <div className="isolate relative bg-gray-900 px-6 py-24 lg:px-8 rounded-2xl">
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
          <div className="mx-auto max-w-2xl text-center">
            <motion.div
              animate={{
                scale: user ? 1.2 : 1,
                rotate: user ? 360 : 0,
              }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              {user ? (
                <CheckCircleIcon className="size-12 mx-auto text-teal-400" />
              ) : (
                <LockClosedIcon className="size-10 mx-auto text-(--secondary-color)" />
              )}
            </motion.div>
            <h3 className="text-2xl/9 mt-10 font-semibold tracking-tight text-balance text-white">
              {user
                ? `Dobrodošli!, ${user.name || "uspešna prijava"}`
                : "Prijavite se na vaš nalog."}
            </h3>
            <p className="mt-2 text-md/8 text-gray-400">
              {user
                ? "Vaš nalog je uspešno kreiran."
                : "Napravite nalog i zakažite termin. Moći ćete da ostavite vaše utiske i preporuke."}
            </p>
          </div>
          <CollapseView isExpanded={showForm}>
            <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
              <form
                onSubmit={handleSubmit}
                className="mx-auto mt-16 max-w-xl sm:mt-20"
              >
                <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="first-name"
                      className="block text-sm/6 font-semibold text-white"
                    >
                      Vaše ime
                    </label>
                    <div className="mt-2.5">
                      <input
                        id="first-name"
                        name="first-name"
                        type="text"
                        autoComplete="given-name"
                        required
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary-color)"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="email"
                      className="block text-sm/6 font-semibold text-white"
                    >
                      Email
                    </label>
                    <div className="mt-2.5">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary-color)"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="password"
                        className="block text-sm/6 font-semibold text-white"
                      >
                        Password
                      </label>
                    </div>
                    <div className="mt-2">
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                        className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary-color) sm:text-sm/6"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="phone-number"
                      className="block text-sm/6 font-semibold text-white"
                    >
                      Broj telefona
                    </label>
                    <div className="mt-2.5">
                      <div className="flex rounded-md bg-white/5 outline-1 -outline-offset-1 outline-white/10 has-[input:focus-within]:outline-2 has-[input:focus-within]:-outline-offset-2 has-[input:focus-within]:outline-(--secondary-color)">
                        <div className="grid shrink-0 grid-cols-1 focus-within:relative">
                          <select
                            id="country"
                            name="country"
                            autoComplete="country"
                            aria-label="Country"
                            className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-transparent py-2 pr-7 pl-3.5 text-base text-gray-400 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary-color) sm:text-sm/6"
                          >
                            <option>SRB</option>
                          </select>
                          <ChevronDownIcon
                            aria-hidden="true"
                            className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-400 sm:size-4"
                          />
                        </div>
                        <input
                          id="phone-number"
                          name="phone-number"
                          type="text"
                          placeholder="123-456-7890"
                          value={formData.phone}
                          onChange={(e) =>
                            setFormData({ ...formData, phone: e.target.value })
                          }
                          className="block min-w-0 grow bg-transparent py-1.5 pr-3 pl-1 text-base text-white placeholder:text-gray-500 focus:outline-none sm:text-sm/6"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="phone-number"
                      className="block text-sm/6 font-semibold text-white"
                    >
                      Datum rođenja
                    </label>
                    <div className="mt-2.5">
                      <input
                        id="birthday"
                        type="date"
                        name="birthday"
                        value={formData.birthday}
                        onChange={(e) =>
                          setFormData({ ...formData, birthday: e.target.value })
                        }
                        className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary-color) sm:text-sm/6"
                      />
                    </div>
                  </div>
                  <div className="flex gap-x-4 sm:col-span-2">
                    <div className="flex h-6 items-center">
                      <div className="group relative inline-flex w-8 shrink-0 rounded-full bg-white/5 p-px inset-ring inset-ring-white/10 outline-offset-2 outline-(--secondary-color) transition-colors duration-200 ease-in-out has-checked:bg-(--secondary-color) has-focus-visible:outline-2">
                        <span className="size-4 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-3.5" />
                        <input
                          id="agree"
                          name="agree"
                          type="checkbox"
                          aria-label="Agree to policies"
                          checked={formData.agree}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              agree: e.target.checked,
                            })
                          }
                          className="absolute inset-0 appearance-none focus:outline-hidden"
                        />
                      </div>
                    </div>
                    <label htmlFor="agree" className="text-sm/6 text-gray-400">
                      Prihvatam{" "}
                      <Link
                        href="/politika-privatnosti"
                        className="font-semibold whitespace-nowrap text-(--secondary-color) hover:text-(--secondary-color)/80 underline"
                      >
                        politiku privatnosti
                      </Link>
                      .
                    </label>
                  </div>
                </div>
                <div className="mt-10">
                  <button
                    type="submit"
                    disabled={isRegistering}
                    className="cursor-pointer flex justify-center items-center w-full rounded-md bg-(--secondary-color) px-3.5 py-2.5 text-center text-sm font-semibold text-white shadow-xs hover:bg-(--secondary-color)/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--secondary-color)"
                  >
                    {isRegistering ? <LoaderButton /> : "Registruj se"}
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
      </Reveal>
    </div>
  );
}
