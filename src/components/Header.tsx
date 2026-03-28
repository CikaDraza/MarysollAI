"use client";

import { Button } from "@headlessui/react";
import Image from "next/image";
import Link from "next/link";
import LoggedButton from "./LoggedButton";
import { useAuthActions } from "@/hooks/useAuthActions";
import { Reveal } from "./motion/Reveal";
import { useDrawerSeek } from "@/hooks/useDrawerSeek";
import { SparklesIcon } from "@heroicons/react/24/outline";

export default function Header() {
  const { user, logout } = useAuthActions();
  const { openDrawer, isOpen } = useDrawerSeek();

  return (
    <header className="bg-transparent relative z-10">
      <nav
        aria-label="Global"
        className="flex flex-wrap items-center justify-between p-6 lg:px-8"
      >
        <div className="flex">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">Marysoll Assistant</span>
            <Image
              src={"/Logo_Marysoll_assistent_website.png"}
              alt="Marysoll Assistant AI"
              width={130}
              height={27}
              className="w-24 h-6 md:w-32 md:h-7"
            />
          </Link>
        </div>
        <Link
          href="#blog"
          className="block text-center hidden lg:block text-xs font-semibold text-gray-900 hover:text-(--secondary-color) px-6"
        >
          💡 Tip: Click on any article and ask Marysoll Assistant for a summary,
          recommendation, or to schedule a service.
        </Link>
        <div className="flex space-x-4">
          {!isOpen && (
            <Button
              onClick={() => openDrawer()}
              className="group cursor-pointer flex items-center justify-center text-sm font-semibold text-gray-900 group"
            >
              <SparklesIcon className="size-4 text-(--primary-color) group-hover:text-(--secondary-color)" />{" "}
              <span className="text-(--primary-color) group-hover:text-(--secondary-color)">
                Ask Maria Deep
              </span>
            </Button>
          )}
        </div>
      </nav>
      <Link
        href="#blog"
        className="block lg:hidden text-center text-xs font-semibold text-gray-900 hover:text-(--secondary-color) px-6"
      >
        💡 Tip: Click on any article and ask Marysoll Assistant for a summary,
        recommendation, or to schedule a service.
      </Link>
      <div className="flex justify-center mt-6">
        {user && (
          <Reveal>
            <LoggedButton user={user} logout={logout} />
          </Reveal>
        )}
      </div>
    </header>
  );
}
