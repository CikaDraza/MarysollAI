"use client";
import { useState } from "react";
import { Button, Dialog, DialogPanel } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import Link from "next/link";
import LoggedButton from "./LoggedButton";
import { useAuthActions } from "@/hooks/useAuthActions";
import { Reveal } from "./motion/Reveal";

export default function Header() {
  const { user, logout } = useAuthActions();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <nav
        aria-label="Global"
        className="flex items-center justify-between p-6 lg:px-8"
      >
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">Your Company</span>
            <Image
              src={"/Logo_Marysoll_assistent_website.png"}
              alt="Marysoll Assistant AI"
              width={130}
              height={27}
            />
          </Link>
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="-m-2.5 cursor-pointer inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
          >
            <span className="sr-only">Open main menu</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>
        </div>
        <div className="hidden lg:flex">
          {user ? (
            <Reveal>
              <LoggedButton user={user} logout={logout} />
            </Reveal>
          ) : (
            <Button className="cursor-pointer hidden lg:block text-sm font-semibold text-gray-900">
              Prijavi se <span aria-hidden="true">&rarr;</span>
            </Button>
          )}
        </div>
      </nav>
      <Dialog
        open={mobileMenuOpen}
        onClose={setMobileMenuOpen}
        className="lg:hidden"
      >
        <div className="fixed inset-0 z-50" />
        <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full max-w-2/3 overflow-y-auto bg-white p-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10">
          <div className="flex items-center justify-between">
            <Link href="/" className="-m-1.5 p-1.5">
              <span className="sr-only">Marysoll Assistant AI</span>
              <Image
                src={"/Logo_Marysoll_assistent_website.png"}
                alt="Marysoll Assistant AI Logo"
                width={130}
                height={27}
              />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="-m-2.5 cursor-pointer rounded-md p-2.5 text-gray-700"
            >
              <span className="sr-only">Close menu</span>
              <XMarkIcon aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="divide-y divide-gray-500/10">
              {user ? (
                <div className="flex flex-col gap-y-4">
                  <p className="text-base font-semibold text-gray-900">
                    Zdravo, {user.name}
                  </p>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="cursor-pointer text-left text-sm font-bold text-red-500 hover:text-red-600"
                  >
                    Odjavi se
                  </button>
                </div>
              ) : (
                <Button className="cursor-pointer text-sm font-semibold text-gray-900">
                  Prijavi se <span aria-hidden="true">&rarr;</span>
                </Button>
              )}
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  );
}
