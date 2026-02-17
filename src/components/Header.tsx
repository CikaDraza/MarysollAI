"use client";

import { Button } from "@headlessui/react";
import Image from "next/image";
import Link from "next/link";
import LoggedButton from "./LoggedButton";
import { useAuthActions } from "@/hooks/useAuthActions";
import { Reveal } from "./motion/Reveal";
import { useDrawerSeek } from "@/hooks/useDrawerSeek";

export default function Header() {
  const { user, logout } = useAuthActions();
  const { openDrawer, isOpen } = useDrawerSeek();

  return (
    <header className="bg-transparent relative z-50">
      <nav
        aria-label="Global"
        className="flex items-center justify-between p-6 lg:px-8"
      >
        <div className="flex">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">Marysoll Assistant</span>
            <Image
              src={"/Logo_Marysoll_assistent_website.png"}
              alt="Marysoll Assistant AI"
              width={130}
              height={27}
            />
          </Link>
        </div>
        <div className="hidden lg:flex">
          <Link
            href={"#articles"}
            className="text-center text-xs font-semibold text-gray-900 px-6"
          >
            💡 Tip: Click on any article and ask Marysoll Assistant for a
            summary, recommendation, or to schedule a service.
          </Link>
        </div>
        <div className="flex flex-col">
          {!isOpen && (
            <Button
              onClick={() => openDrawer()}
              className="cursor-pointer text-xs md:text-sm font-semibold text-gray-900"
            >
              Ask Marysoll
            </Button>
          )}
          {user && (
            <Reveal>
              <LoggedButton user={user} logout={logout} />
            </Reveal>
          )}
        </div>
      </nav>
      <Link
        href={"#articles"}
        className="block lg:hidden text-center text-xs font-semibold text-gray-900 px-6"
      >
        💡 Tip: Click on any article and ask Marysoll Assistant for a summary,
        recommendation, or to schedule a service.
      </Link>
    </header>
  );
}
